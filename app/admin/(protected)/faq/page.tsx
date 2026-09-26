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
import { ADMIN_FAQ_PATH } from "@/lib/admin/constants";
import { listFaqsForAdmin } from "@/lib/admin/faq-repository";
import { deleteFaqAction, moveFaqAction, togglePublishAction } from "./actions";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "FAQ管理",
};

type FaqListPageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

export default async function FaqListPage({ searchParams }: FaqListPageProps) {
  await requireAdmin();
  const { success, error } = await searchParams;
  const faqs = await listFaqsForAdmin();
  const publishedCount = faqs.filter((faq) => faq.is_published).length;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">FAQ管理</h1>
        <Link href={`${ADMIN_FAQ_PATH}/new`} className={addLinkClassName}>
          ＋ 追加
        </Link>
      </div>

      {success ? <FlashMessage variant="success">{success}</FlashMessage> : null}
      {error ? <FlashMessage variant="error">{error}</FlashMessage> : null}

      {faqs.length === 0 ? (
        <p className="text-sm text-foreground/70">
          FAQがまだ登録されていません。「＋ 追加」から登録してください。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {faqs.map((faq, index) => {
            // 非公開にする/削除すると公開FAQが0件になり、Botが全問をスタッフ確認に回すケース。
            const isLastPublished = faq.is_published && publishedCount === 1;

            return (
              <li
                key={faq.id}
                className="flex flex-col gap-3 rounded-2xl border border-foreground/20 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={faq.is_published ? "success" : "neutral"}>
                    {faq.is_published ? "公開中" : "非公開"}
                  </StatusBadge>
                  {faq.category ? (
                    <span className="rounded-full border border-foreground/20 px-2 py-0.5 text-xs text-foreground/70">
                      {faq.category}
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-col gap-1">
                  <p className="font-bold">{faq.question}</p>
                  <p className="whitespace-pre-wrap text-sm text-foreground/80">{faq.answer}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href={`${ADMIN_FAQ_PATH}/${faq.id}`} className={smallOutlineButtonClassName}>
                    編集
                  </Link>

                  <form action={moveFaqAction}>
                    <input type="hidden" name="id" value={faq.id} />
                    <input type="hidden" name="direction" value="up" />
                    <SubmitButton
                      pendingLabel="移動中…"
                      disabled={index === 0}
                      className={smallOutlineButtonClassName}
                    >
                      ↑ 上へ
                    </SubmitButton>
                  </form>

                  <form action={moveFaqAction}>
                    <input type="hidden" name="id" value={faq.id} />
                    <input type="hidden" name="direction" value="down" />
                    <SubmitButton
                      pendingLabel="移動中…"
                      disabled={index === faqs.length - 1}
                      className={smallOutlineButtonClassName}
                    >
                      ↓ 下へ
                    </SubmitButton>
                  </form>

                  {isLastPublished ? (
                    <ConfirmDialog
                      triggerLabel="非公開にする"
                      triggerClassName={smallOutlineButtonClassName}
                      title="最後の公開FAQです"
                      description="これを非公開にすると公開中のFAQが0件になり、Botはすべての質問をスタッフ確認(エスカレーション)に回します。よろしいですか？"
                      action={togglePublishAction}
                      hiddenFields={{ id: faq.id, nextPublished: "false" }}
                      submitLabel="非公開にする"
                      pendingLabel="変更中…"
                    />
                  ) : (
                    <form action={togglePublishAction}>
                      <input type="hidden" name="id" value={faq.id} />
                      <input
                        type="hidden"
                        name="nextPublished"
                        value={(!faq.is_published).toString()}
                      />
                      <SubmitButton pendingLabel="変更中…" className={smallOutlineButtonClassName}>
                        {faq.is_published ? "非公開にする" : "公開する"}
                      </SubmitButton>
                    </form>
                  )}

                  <ConfirmDialog
                    triggerLabel="削除"
                    triggerClassName={smallDangerButtonClassName}
                    title="このFAQを削除しますか？"
                    description={
                      <>
                        <p>
                          過去の会話ログに残っているFAQ参照が無効になります。削除の代わりに「非公開」にすることをおすすめします。
                        </p>
                        {isLastPublished ? (
                          <p className="mt-2 font-bold text-red-700 dark:text-red-300">
                            ⚠️
                            これは最後に公開されているFAQです。削除するとBotはすべての質問をスタッフ確認に回します。
                          </p>
                        ) : null}
                      </>
                    }
                    action={deleteFaqAction}
                    hiddenFields={{ id: faq.id }}
                    submitLabel="削除する"
                    pendingLabel="削除中…"
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
