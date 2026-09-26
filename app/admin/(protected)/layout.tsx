import type { ReactNode } from "react";
import { AdminHeader } from "@/components/admin/admin-header";
import { requireAdmin } from "@/lib/admin/auth";
import { logoutAction } from "../login/actions";

// 管理画面のページとServer Action(お知らせ配信を含む)の最大実行時間(秒)。Vercel上ではこれを超えると
// 処理が打ち切られる。お知らせの「状態確認が必要」の判定(lib/admin/announcement-policy.tsの
// STALE_SENDING_THRESHOLD_MS)はこの値を前提にしているため、変更する場合は両方を見直すこと。
// (route segment configは静的に解析されるため、定数のimportではなく数値リテラルで書く)
export const maxDuration = 60;

// Layouts do not re-render on client-side navigation, so every page must also call requireAdmin().
export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin();

  return (
    <>
      <AdminHeader logoutAction={logoutAction} />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-6">{children}</div>
    </>
  );
}
