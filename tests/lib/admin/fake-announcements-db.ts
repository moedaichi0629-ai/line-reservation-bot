import { randomUUID } from "node:crypto";
import type { Announcement } from "@/types/database";

/**
 * announcementsテーブルのインメモリ偽物(テスト専用)。
 * supabase-jsのクエリビルダのうち、announcement-repository.tsが使う形だけを再現し、
 * migration 0003 のCHECK制約を書き込みのたびに検証する(違反すればPostgresと同様にエラーを返し、行は変更しない)。
 * 1回のupdate()は同期的に「条件に合う行の検索→更新」を行うため、Postgresの条件付きUPDATEと同じく原子的に振る舞う。
 */

type Filter =
  | { op: "eq"; column: keyof Announcement; value: unknown }
  | { op: "in"; column: keyof Announcement; values: unknown[] }
  | { op: "gte"; column: keyof Announcement; value: string };

type Operation = "select" | "insert" | "update";

type DbError = { message: string };
type DbResult = { data: unknown; error: DbError | null };

const DB_TRIM_CHARS = new Set([" ", "\t", "\r", "\n", "\u3000"]);

function charLength(value: string): number {
  return [...value].length;
}

function dbTrim(value: string): string {
  const chars = [...value];
  let start = 0;
  let end = chars.length;
  while (start < end && DB_TRIM_CHARS.has(chars[start])) start++;
  while (end > start && DB_TRIM_CHARS.has(chars[end - 1])) end--;
  return chars.slice(start, end).join("");
}

/** migration 0003 のCHECK制約。違反内容を返す(問題なければnull)。 */
export function checkAnnouncementConstraints(row: Announcement): string | null {
  if (charLength(dbTrim(row.body)) === 0 || charLength(row.body) > 5000) {
    return "body check violated";
  }
  if (!["draft", "sending", "sent", "failed"].includes(row.status)) {
    return "status check violated";
  }
  if (row.line_request_id !== null && charLength(row.line_request_id) > 100) {
    return "line_request_id check violated";
  }
  if (row.error_message !== null && charLength(row.error_message) > 500) {
    return "error_message check violated";
  }
  const started = row.sending_started_at !== null;
  const sent = row.sent_at !== null;
  const consistent =
    (row.status === "draft" && !started && !sent) ||
    ((row.status === "sending" || row.status === "failed") && started && !sent) ||
    (row.status === "sent" && started && sent);
  return consistent ? null : "announcements_status_timestamps_check violated";
}

export class FakeAnnouncementsDb {
  rows: Announcement[] = [];
  /** 書き込み履歴(状態遷移の検証用)。 */
  updates: Array<Partial<Announcement>> = [];
  /** trueを返した操作はDBエラーにする(障害の再現用)。 */
  failWhen: ((operation: Operation, payload: Partial<Announcement> | null) => boolean) | null = null;
  /** 操作の結果を返した直後に呼ぶ(別の処理が割り込んだ状況の再現用)。 */
  afterOperation: ((operation: Operation) => void) | null = null;

  addRow(overrides: Partial<Announcement> = {}): Announcement {
    const row: Announcement = {
      id: randomUUID(),
      body: "年末年始の営業時間のお知らせです。",
      status: "draft",
      retry_key: randomUUID(),
      line_request_id: null,
      error_message: null,
      created_at: new Date().toISOString(),
      sending_started_at: null,
      sent_at: null,
      ...overrides,
    };
    this.rows.push(row);
    return row;
  }

  get(id: string): Announcement | undefined {
    return this.rows.find((row) => row.id === id);
  }

  client() {
    return {
      from: (table: string) => {
        if (table !== "announcements") {
          throw new Error(`unexpected table: ${table}`);
        }
        return new FakeQuery(this);
      },
    };
  }
}

class FakeQuery {
  private operation: Operation | null = null;
  private payload: Partial<Announcement> | null = null;
  private columns: string | null = null;
  private filters: Filter[] = [];
  private ordering: { column: keyof Announcement; ascending: boolean } | null = null;
  private maxRows: number | null = null;

  constructor(private readonly db: FakeAnnouncementsDb) {}

  select(columns = "*") {
    this.operation ??= "select";
    this.columns = columns;
    return this;
  }

  insert(payload: Partial<Announcement>) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Partial<Announcement>) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  eq(column: keyof Announcement, value: unknown) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  in(column: keyof Announcement, values: unknown[]) {
    this.filters.push({ op: "in", column, values });
    return this;
  }

  gte(column: keyof Announcement, value: string) {
    this.filters.push({ op: "gte", column, value });
    return this;
  }

  order(column: keyof Announcement, options: { ascending: boolean }) {
    this.ordering = { column, ascending: options.ascending };
    return this;
  }

  limit(count: number) {
    this.maxRows = count;
    return this;
  }

  /** 一覧取得(order/limitで終わるクエリ)をawaitしたときの結果。 */
  then<T>(onFulfilled: (result: DbResult) => T): Promise<T> {
    if (this.db.failWhen?.("select", null)) {
      return Promise.resolve(onFulfilled({ data: null, error: { message: "simulated database error" } }));
    }
    let rows = this.db.rows.filter((row) => this.matches(row)).map((row) => ({ ...row }));
    if (this.ordering) {
      const { column, ascending } = this.ordering;
      rows.sort((a, b) => {
        const compared = String(a[column]).localeCompare(String(b[column]));
        return ascending ? compared : -compared;
      });
    }
    if (this.maxRows !== null) {
      rows = rows.slice(0, this.maxRows);
    }
    return Promise.resolve(onFulfilled({ data: rows, error: null }));
  }

  maybeSingle(): Promise<DbResult> {
    return this.run(false);
  }

  single(): Promise<DbResult> {
    return this.run(true);
  }

  private run(requireOne: boolean): Promise<DbResult> {
    const result = this.finish(requireOne);
    this.db.afterOperation?.(this.operation ?? "select");
    return Promise.resolve(result);
  }

  private matches(row: Announcement): boolean {
    return this.filters.every((filter) => {
      const actual = row[filter.column];
      if (filter.op === "eq") return actual === filter.value;
      if (filter.op === "in") return filter.values.includes(actual);
      return typeof actual === "string" && Date.parse(actual) >= Date.parse(filter.value);
    });
  }

  private project(row: Announcement): unknown {
    if (this.columns === null || this.columns === "*") {
      return { ...row };
    }
    const keys = this.columns.split(",").map((key) => key.trim()) as Array<keyof Announcement>;
    return Object.fromEntries(keys.map((key) => [key, row[key]]));
  }

  private finish(requireOne: boolean): DbResult {
    if (this.db.failWhen?.(this.operation ?? "select", this.payload)) {
      return { data: null, error: { message: "simulated database error" } };
    }

    let affected: Announcement[];
    if (this.operation === "insert") {
      const row = this.db.addRow({ ...(this.payload ?? {}) });
      const violation = checkAnnouncementConstraints(row);
      if (violation) {
        this.db.rows = this.db.rows.filter((candidate) => candidate !== row);
        return { data: null, error: { message: violation } };
      }
      affected = [row];
    } else if (this.operation === "update") {
      const targets = this.db.rows.filter((row) => this.matches(row));
      const updated = targets.map((row) => ({ ...row, ...this.payload }));
      for (const row of updated) {
        const violation = checkAnnouncementConstraints(row);
        if (violation) {
          return { data: null, error: { message: violation } };
        }
      }
      for (const row of updated) {
        const index = this.db.rows.findIndex((candidate) => candidate.id === row.id);
        this.db.rows[index] = row;
        this.db.updates.push({ ...this.payload });
      }
      affected = updated;
    } else {
      affected = this.db.rows.filter((row) => this.matches(row));
    }

    if (affected.length > 1) {
      return { data: null, error: { message: "multiple rows returned" } };
    }
    if (affected.length === 0) {
      return requireOne
        ? { data: null, error: { message: "no rows returned" } }
        : { data: null, error: null };
    }
    return { data: this.project(affected[0]), error: null };
  }
}
