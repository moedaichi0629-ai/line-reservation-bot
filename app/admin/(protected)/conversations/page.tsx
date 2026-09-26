import type { Metadata } from "next";
import Link from "next/link";
import { StatusBadge } from "@/components/admin/status-badge";
import { requireAdmin } from "@/lib/admin/auth";
import { ADMIN_CONVERSATIONS_PATH } from "@/lib/admin/constants";
import { describeCustomerMessage, formatDateTimeJst } from "@/lib/admin/conversation-labels";
import {
  CUSTOMER_LIST_SCAN_LIMIT,
  ESCALATED_SCAN_LIMIT,
  listRecentCustomers,
  type CustomerFilter,
} from "@/lib/admin/conversation-repository";

export const metadata: Metadata = {
  title: "会話ログ",
};

type ConversationListPageProps = {
  searchParams: Promise<{ filter?: string | string[] }>;
};

const FILTERS: { value: CustomerFilter; label: string; href: string }[] = [
  { value: "all", label: "すべて", href: ADMIN_CONVERSATIONS_PATH },
  {
    value: "needs-staff",
    label: "スタッフ確認あり",
    href: `${ADMIN_CONVERSATIONS_PATH}?filter=needs-staff`,
  },
];

function parseFilter(value: string | string[] | undefined): CustomerFilter {
  return value === "needs-staff" ? "needs-staff" : "all";
}

export default async function ConversationListPage({ searchParams }: ConversationListPageProps) {
  await requireAdmin();

  const filter = parseFilter((await searchParams).filter);
  const customers = await listRecentCustomers(filter);

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">会話ログ</h1>
        <p className="text-sm text-foreground/70">
          お客様とBotのやり取りを、新しい順に確認できます。この画面は閲覧専用です（編集・削除はできません）。
        </p>
      </div>

      <nav aria-label="表示の絞り込み" className="grid grid-cols-2 gap-2">
        {FILTERS.map((item) => {
          const isActive = item.value === filter;
          return (
            <Link
              key={item.value}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm font-bold ${
                isActive
                  ? "border-foreground bg-foreground text-background"
                  : "border-foreground/30 active:bg-foreground/10"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {customers.length === 0 ? (
        <p className="rounded-xl border border-foreground/20 bg-foreground/5 px-4 py-6 text-center text-sm text-foreground/70">
          {filter === "needs-staff"
            ? "スタッフ確認が必要になったやり取りはありません。"
            : "まだ会話ログがありません。お客様がLINEでメッセージを送ると、ここに表示されます。"}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {customers.map((customer) => (
            <li key={customer.key}>
              <Link
                href={`${ADMIN_CONVERSATIONS_PATH}/${customer.key}`}
                className="flex min-h-20 flex-col gap-2 rounded-2xl border border-foreground/20 p-4 active:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold">{customer.customerLabel}</p>
                  <p className="text-sm text-foreground/70">
                    {formatDateTimeJst(customer.lastActivityAt)}
                  </p>
                </div>
                <p className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-foreground/80">
                  {customer.latestCustomerMessage
                    ? describeCustomerMessage(
                        customer.latestCustomerMessage.messageType,
                        customer.latestCustomerMessage.messageText,
                      )
                    : "（お客様のメッセージは詳細画面で確認できます）"}
                </p>
                {customer.needsStaffCheck ? (
                  <div>
                    <StatusBadge tone="warning">スタッフ確認あり</StatusBadge>
                  </div>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {customers.length > 0 ? (
        <p className="text-xs text-foreground/60">
          {filter === "all"
            ? `※ 直近${CUSTOMER_LIST_SCAN_LIMIT}件のやり取りに含まれるお客様を表示しています。`
            : `※ 直近${ESCALATED_SCAN_LIMIT}件のスタッフ確認に含まれるお客様を表示しています。`}
        </p>
      ) : null}
    </main>
  );
}
