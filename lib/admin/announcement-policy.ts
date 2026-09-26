import type { Flash } from "@/lib/admin/flash";
import type { SendAnnouncementResult } from "@/lib/admin/send-announcement";
import type { Tone } from "@/lib/admin/tone";
import type { Announcement, AnnouncementStatus } from "@/types/database";

/**
 * お知らせ配信の「いつ送れるか」「画面にどう出すか」の判定。DBアクセスを行わない純粋関数のみを置く
 * (サーバー側の送信処理と画面表示の両方がこの判定を使い、両者の基準がずれないようにする)。
 */

/**
 * 送信(draft→sending / failed→sending)を許可する期間。LINEのretry keyは受付から24時間で失効し、
 * 失効後に同じキーで再送すると二重配信を防げない。最初の送信開始は必ずcreated_at以降なので、
 * created_atから24時間より短い期間に限れば、retry keyが有効な間だけ送信・再送できる
 * (時計のずれを見込んで1時間の余裕を持たせる)。期限切れの場合は新しいお知らせとして作り直す。
 */
export const ANNOUNCEMENT_SEND_WINDOW_MS = 23 * 60 * 60 * 1000;

/**
 * sendingのまま「状態確認が必要」と警告するまでの時間(10分)。
 * 送信処理はServer Actionの1回の実行の中で完了し、管理画面のServer Actionは
 * お知らせ配信ページ(app/admin/(protected)/announcements/page.tsx)の maxDuration(60秒)で打ち切られる。10分(上限の10倍)を過ぎても
 * sendingのままなら、処理は途中で止まって結果を記録できなかったと判断できる。
 * 短すぎると実行中の送信に誤って警告を出すため、上限に十分な余裕を持たせている(値はテストで検証)。
 */
export const STALE_SENDING_THRESHOLD_MS = 10 * 60 * 1000;

export function getAnnouncementSendCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - ANNOUNCEMENT_SEND_WINDOW_MS).toISOString();
}

/** 送信可能期間内か。日時を解釈できない場合は安全側(期間外)に倒す。 */
export function isWithinSendWindow(createdAt: string, now: Date = new Date()): boolean {
  const created = Date.parse(createdAt);
  return !Number.isNaN(created) && created >= now.getTime() - ANNOUNCEMENT_SEND_WINDOW_MS;
}

/** sendingのまま長時間経過しているか。開始日時が無い・解釈できない場合も確認が必要として扱う。 */
export function isStaleSending(
  announcement: Pick<Announcement, "status" | "sending_started_at">,
  now: Date = new Date(),
): boolean {
  if (announcement.status !== "sending") {
    return false;
  }
  const started = announcement.sending_started_at ? Date.parse(announcement.sending_started_at) : NaN;
  return Number.isNaN(started) || now.getTime() - started >= STALE_SENDING_THRESHOLD_MS;
}

export const ANNOUNCEMENT_STATUS_LABELS: Record<AnnouncementStatus, string> = {
  draft: "下書き",
  sending: "配信処理中",
  sent: "配信済み",
  failed: "配信失敗",
};

const STATUS_TONES: Record<AnnouncementStatus, Tone> = {
  draft: "neutral",
  sending: "warning",
  sent: "success",
  failed: "danger",
};

export type AnnouncementNotice = { tone: Tone; title: string; text: string };

export type AnnouncementView = {
  statusLabel: string;
  tone: Tone;
  /** 友だち全員への配信ボタン。nullならボタンを出さない(sent / sending / 期限切れ)。 */
  sendAction: "send" | "retry" | null;
  /** 管理者だけへのテスト送信ボタンを出すか(まだ本番配信できる状態のときだけ)。 */
  canTestSend: boolean;
  notices: AnnouncementNotice[];
};

export const EXPIRED_DRAFT_TEXT =
  "安全な送信期限（作成から23時間）を過ぎています。内容を確認して新しいお知らせとして作成してください。";
export const EXPIRED_FAILED_TEXT =
  "安全な再送期限を過ぎています。内容を確認して新しいお知らせとして作成してください。";
export const STALE_SENDING_TITLE = "状態確認が必要";
export const STALE_SENDING_TEXT =
  "配信処理が完了したか確認できません。二重配信を防ぐため、自動では再送しません。LINE Official Account Managerで配信されたかどうかを確認してください。";
const SENDING_IN_PROGRESS_TEXT =
  "配信処理中です。しばらくしてから画面を再読み込みしてください。";

export function getAnnouncementView(
  announcement: Pick<Announcement, "status" | "created_at" | "sending_started_at" | "error_message">,
  now: Date = new Date(),
): AnnouncementView {
  const base = {
    statusLabel: ANNOUNCEMENT_STATUS_LABELS[announcement.status],
    tone: STATUS_TONES[announcement.status],
  };
  const withinWindow = isWithinSendWindow(announcement.created_at, now);

  switch (announcement.status) {
    case "sent":
      return { ...base, sendAction: null, canTestSend: false, notices: [] };

    case "sending":
      return {
        ...base,
        sendAction: null,
        canTestSend: false,
        notices: [
          isStaleSending(announcement, now)
            ? { tone: "warning", title: STALE_SENDING_TITLE, text: STALE_SENDING_TEXT }
            : { tone: "neutral", title: "配信処理中", text: SENDING_IN_PROGRESS_TEXT },
        ],
      };

    case "draft":
      return withinWindow
        ? { ...base, sendAction: "send", canTestSend: true, notices: [] }
        : {
            ...base,
            sendAction: null,
            canTestSend: false,
            notices: [{ tone: "warning", title: "送信期限切れ", text: EXPIRED_DRAFT_TEXT }],
          };

    case "failed": {
      const notices: AnnouncementNotice[] = [
        {
          tone: "danger",
          title: "配信に失敗しました",
          text: announcement.error_message ?? "失敗の理由を取得できませんでした。",
        },
      ];
      if (!withinWindow) {
        notices.push({ tone: "warning", title: "再送期限切れ", text: EXPIRED_FAILED_TEXT });
      }
      return {
        ...base,
        sendAction: withinWindow ? "retry" : null,
        canTestSend: withinWindow,
        notices,
      };
    }
  }
}

// 確認ダイアログの送信フォームだけが持つ値。確認を経ない送信(別フォームの誤送信等)をサーバー側でも拒否する。
export const BROADCAST_CONFIRMATION = "broadcast-to-all-friends";
export const TEST_SEND_CONFIRMATION = "test-send-to-owner";

export const SENT_MESSAGE = "お知らせを配信しました。";
export const ALREADY_ACCEPTED_MESSAGE =
  "このお知らせは前回の送信でLINEに受け付けられていました。二重に配信はせず、配信済みとして記録しました。";
export const UNRECORDED_SUCCESS_MESSAGE =
  "LINEへの配信結果を管理画面に記録できませんでした。二重配信を防ぐため、再送せずにLINE Official Account Managerで配信状況を確認してください。";
export const UNRECORDED_FAILURE_MESSAGE =
  "配信状況を確認できませんでした。LINEへの配信結果を管理画面に記録できなかったため、二重配信を防ぐため再送せず、LINE Official Account Managerで配信状況を確認してください。";

/** sendAnnouncement()の結果を、管理画面に表示するメッセージにする。 */
export function describeSendAnnouncementResult(result: SendAnnouncementResult): Flash {
  if (result.ok) {
    if (!result.recorded) {
      return { kind: "warning", message: UNRECORDED_SUCCESS_MESSAGE };
    }
    return {
      kind: "success",
      message: result.alreadyAccepted ? ALREADY_ACCEPTED_MESSAGE : SENT_MESSAGE,
    };
  }
  if (result.reason === "line_error") {
    return result.recorded
      ? { kind: "error", message: `送信に失敗しました。${result.message}` }
      : { kind: "warning", message: `${UNRECORDED_FAILURE_MESSAGE}（${result.message}）` };
  }
  return { kind: "error", message: result.message };
}
