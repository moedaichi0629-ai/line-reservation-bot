import { outlineButtonClassName, primaryButtonClassName } from "@/components/admin/button-styles";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Notice } from "@/components/admin/notice";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  BROADCAST_CONFIRMATION,
  TEST_SEND_CONFIRMATION,
  getAnnouncementView,
} from "@/lib/admin/announcement-policy";
import { formatDateTimeJst } from "@/lib/admin/conversation-labels";
import type { Announcement } from "@/types/database";
import { sendAnnouncementAction, sendTestAnnouncementAction } from "./actions";

/** 確認ダイアログ内で本文全文を表示する(長文でもダイアログが画面からはみ出さないようにスクロールさせる)。 */
function BodyPreview({ body }: { body: string }) {
  return (
    <div className="mt-3 max-h-[40vh] overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-foreground/20 bg-foreground/5 p-3 text-base text-foreground">
      {body}
    </div>
  );
}

type AnnouncementHistoryItemProps = {
  announcement: Announcement;
  now: Date;
};

export function AnnouncementHistoryItem({ announcement, now }: AnnouncementHistoryItemProps) {
  const view = getAnnouncementView(announcement, now);

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-foreground/20 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={view.tone}>{view.statusLabel}</StatusBadge>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-foreground/70">
        <dt>作成日時</dt>
        <dd>{formatDateTimeJst(announcement.created_at)}</dd>
        <dt>配信日時</dt>
        <dd>{announcement.sent_at ? formatDateTimeJst(announcement.sent_at) : "—"}</dd>
      </dl>

      <p className="whitespace-pre-wrap break-words text-base">{announcement.body}</p>

      {view.notices.map((notice) => (
        <Notice key={notice.title} tone={notice.tone} title={notice.title}>
          {notice.text}
        </Notice>
      ))}

      {view.canTestSend || view.sendAction ? (
        <div className="flex flex-col gap-2">
          {view.canTestSend ? (
            <>
              <ConfirmDialog
                triggerLabel="自分にテスト送信"
                triggerClassName={outlineButtonClassName}
                title="管理者のLINEだけにテスト送信します。"
                cancelLabel="戻る"
                description={
                  <>
                    <p className="font-bold">友だち全員には配信されません。</p>
                    <BodyPreview body={announcement.body} />
                  </>
                }
                action={sendTestAnnouncementAction}
                hiddenFields={{ id: announcement.id, confirmation: TEST_SEND_CONFIRMATION }}
                submitLabel="テスト送信する"
                pendingLabel="送信中…"
              />
              <p className="text-xs text-foreground/70">
                一斉配信する前に、管理者のLINEだけに表示確認用のメッセージを送ります。
              </p>
            </>
          ) : null}

          {view.sendAction ? (
            <ConfirmDialog
              triggerLabel={view.sendAction === "retry" ? "もう一度配信する" : "友だち全員へ配信する"}
              triggerClassName={primaryButtonClassName}
              title="この内容をLINEの友だち全員へ配信します。"
              cancelLabel="戻る"
              description={
                <>
                  <BodyPreview body={announcement.body} />
                  <p className="mt-3 font-bold text-red-700 dark:text-red-300">配信後は取り消せません。</p>
                  {view.sendAction === "retry" ? (
                    <p className="mt-2">
                      前回と同じ配信として再送します。前回の配信がLINEに受け付けられていた場合は、二重には配信されません。
                    </p>
                  ) : null}
                </>
              }
              action={sendAnnouncementAction}
              hiddenFields={{ id: announcement.id, confirmation: BROADCAST_CONFIRMATION }}
              submitLabel="配信する"
              pendingLabel="配信中…"
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
