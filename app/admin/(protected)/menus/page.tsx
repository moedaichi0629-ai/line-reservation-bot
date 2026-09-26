import type { Metadata } from "next";
import Link from "next/link";
import {
  addLinkClassName,
  smallDangerButtonClassName,
  smallOutlineButtonClassName,
} from "@/components/admin/button-styles";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { FlashMessage } from "@/components/admin/flash-message";
import { StatusBadge } from "@/components/admin/status-badge";
import { SubmitButton } from "@/components/admin/submit-button";
import { ADMIN_MENUS_PATH } from "@/lib/admin/constants";
import { listMenusForAdmin } from "@/lib/admin/menu-repository";
import { deleteMenuAction, moveMenuAction, togglePublishAction } from "./actions";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "メニュー・料金管理",
};

type MenuListPageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

function formatYen(priceYen: number): string {
  return `${priceYen.toLocaleString("ja-JP")}円`;
}

export default async function MenuListPage({ searchParams }: MenuListPageProps) {
  await requireAdmin();
  const { success, error } = await searchParams;
  const menus = await listMenusForAdmin();

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">メニュー・料金管理</h1>
        <Link href={`${ADMIN_MENUS_PATH}/new`} className={addLinkClassName}>
          ＋ 追加
        </Link>
      </div>

      <p className="rounded-xl border border-foreground/20 bg-foreground/5 px-4 py-3 text-sm text-foreground/70">
        ※ ここで登録した内容は、現在Botの自動応答には反映されません。
      </p>

      {success ? <FlashMessage variant="success">{success}</FlashMessage> : null}
      {error ? <FlashMessage variant="error">{error}</FlashMessage> : null}

      {menus.length === 0 ? (
        <p className="text-sm text-foreground/70">
          メニューがまだ登録されていません。「＋ 追加」から登録してください。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {menus.map((menu, index) => (
            <li
              key={menu.id}
              className="flex flex-col gap-3 rounded-2xl border border-foreground/20 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={menu.is_published ? "success" : "neutral"}>
                  {menu.is_published ? "公開中" : "非公開"}
                </StatusBadge>
              </div>

              <div className="flex flex-col gap-1">
                <p className="font-bold">{menu.name}</p>
                {menu.description ? (
                  <p className="whitespace-pre-wrap text-sm text-foreground/80">{menu.description}</p>
                ) : null}
                <p className="text-sm text-foreground/70">
                  {formatYen(menu.price_yen)}・{menu.duration_minutes}分
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link href={`${ADMIN_MENUS_PATH}/${menu.id}`} className={smallOutlineButtonClassName}>
                  編集
                </Link>

                <form action={moveMenuAction}>
                  <input type="hidden" name="id" value={menu.id} />
                  <input type="hidden" name="direction" value="up" />
                  <SubmitButton
                    pendingLabel="移動中…"
                    disabled={index === 0}
                    className={smallOutlineButtonClassName}
                  >
                    ↑ 上へ
                  </SubmitButton>
                </form>

                <form action={moveMenuAction}>
                  <input type="hidden" name="id" value={menu.id} />
                  <input type="hidden" name="direction" value="down" />
                  <SubmitButton
                    pendingLabel="移動中…"
                    disabled={index === menus.length - 1}
                    className={smallOutlineButtonClassName}
                  >
                    ↓ 下へ
                  </SubmitButton>
                </form>

                <form action={togglePublishAction}>
                  <input type="hidden" name="id" value={menu.id} />
                  <input type="hidden" name="nextPublished" value={(!menu.is_published).toString()} />
                  <SubmitButton pendingLabel="変更中…" className={smallOutlineButtonClassName}>
                    {menu.is_published ? "非公開にする" : "公開する"}
                  </SubmitButton>
                </form>

                <ConfirmDialog
                  triggerLabel="削除"
                  triggerClassName={smallDangerButtonClassName}
                  title="このメニューを削除しますか？"
                  description="削除すると元に戻せません。念のため、削除の代わりに「非公開」にすることもできます。"
                  action={deleteMenuAction}
                  hiddenFields={{ id: menu.id }}
                  submitLabel="削除する"
                  pendingLabel="削除中…"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
