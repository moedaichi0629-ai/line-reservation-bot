import type { Metadata } from "next";
import { FlashMessage } from "@/components/admin/flash-message";
import { Notice } from "@/components/admin/notice";
import {
  ANNOUNCEMENT_HISTORY_LIMIT,
  listAnnouncementsForAdmin,
} from "@/lib/admin/announcement-repository";
import { requireAdmin } from "@/lib/admin/auth";
import { AnnouncementForm } from "./announcement-form";
import { AnnouncementHistoryItem } from "./announcement-history-item";

export const metadata: Metadata = {
  title: "お知らせ配信",
};

// このページのServer Action(配信・テスト送信)の最大実行時間(秒)。Next.jsのドキュメント上、Server Actionの
// maxDurationはページ単位で設定するため、レイアウトの値に頼らずここにも書く。「状態確認が必要」の判定
// (lib/admin/announcement-policy.tsのSTALE_SENDING_THRESHOLD_MS)はこの値を前提にしている。
// (route segment configは静的に解析されるため、定数のimportではなく数値リテラルで書く)
export const maxDuration = 60;

type AnnouncementsPageProps = {
  searchParams: Promise<{ success?: string; error?: string; warning?: string; saved?: string }>;
};

/**
 * 料金プランごとの配信可能数は変わり得るため、具体的な通数・料金は画面に書かない
 * (LINEの利用状況取得APIは未実装。確認はLINE Official Account Managerで行ってもらう)。
 */
function PlanLimitNotice() {
  return (
    <Notice tone="warning" title="⚠ 配信できる通数には上限があります">
      <p>
        現在のLINE公式アカウントの料金プランによって、一斉配信できる通数に上限があります。配信前にLINE
        Official Account Managerで残りの配信可能数をご確認ください。
      </p>
      <p className="mt-1">友だち全員への配信は、友だちの人数分の通数を使います。</p>
    </Notice>
  );
}

export default async function AnnouncementsPage({ searchParams }: AnnouncementsPageProps) {
  await requireAdmin();
  const { success, error, warning, saved } = await searchParams;
  const announcements = await listAnnouncementsForAdmin();
  const now = new Date();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">お知らせ配信</h1>

      <PlanLimitNotice />

      {success ? <FlashMessage variant="success">{success}</FlashMessage> : null}
      {warning ? <FlashMessage variant="warning">{warning}</FlashMessage> : null}
      {error ? <FlashMessage variant="error">{error}</FlashMessage> : null}

      <section aria-labelledby="new-announcement-heading" className="flex flex-col gap-4">
        <h2 id="new-announcement-heading" className="text-xl font-bold">
          新しいお知らせ
        </h2>
        <AnnouncementForm savedToken={saved ?? null} />
      </section>

      <section aria-labelledby="history-heading" className="flex flex-col gap-4">
        <h2 id="history-heading" className="text-xl font-bold">
          配信履歴
        </h2>
        {announcements.length === 0 ? (
          <p className="text-sm text-foreground/70">まだお知らせはありません。</p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {announcements.map((announcement) => (
                <AnnouncementHistoryItem key={announcement.id} announcement={announcement} now={now} />
              ))}
            </ul>
            {announcements.length >= ANNOUNCEMENT_HISTORY_LIMIT ? (
              <p className="text-sm text-foreground/70">
                新しい順に{ANNOUNCEMENT_HISTORY_LIMIT}件まで表示しています。
              </p>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
