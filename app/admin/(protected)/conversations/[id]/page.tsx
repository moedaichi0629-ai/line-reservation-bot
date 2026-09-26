import type { Metadata } from "next";
import Link from "next/link";
import { outlineButtonClassName } from "@/components/admin/button-styles";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/admin/status-badge";
import { requireAdmin } from "@/lib/admin/auth";
import { ADMIN_CONVERSATIONS_PATH } from "@/lib/admin/constants";
import {
  describeBotReply,
  describeConfidence,
  describeCustomerMessage,
  formatDateTimeJst,
} from "@/lib/admin/conversation-labels";
import {
  getConversationThread,
  type BotReply,
  type CustomerMessage,
} from "@/lib/admin/conversation-repository";
import { isValidUuid } from "@/lib/admin/schemas";

export const metadata: Metadata = {
  title: "会話の詳細",
};

type ConversationDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ before?: string | string[] }>;
};

function CustomerBubble({ message }: { message: CustomerMessage }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-bold text-foreground/70">
        お客様・{formatDateTimeJst(message.createdAt)}
      </p>
      <p className="mr-8 whitespace-pre-wrap break-words rounded-2xl rounded-tl-sm bg-foreground/10 px-4 py-3 text-base">
        {describeCustomerMessage(message.messageType, message.messageText)}
      </p>
    </div>
  );
}

function BotReplyBubble({ reply }: { reply: BotReply }) {
  const replyLabel = describeBotReply({
    confidence: reply.confidence,
    escalated: reply.escalated,
    messageText: reply.messageText,
  });
  const confidenceLabel = describeConfidence(reply.confidence);

  return (
    <div className="ml-8 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-bold text-foreground/70">
          Botの返信・{formatDateTimeJst(reply.createdAt)}
        </p>
        <StatusBadge tone={replyLabel.tone}>{replyLabel.label}</StatusBadge>
      </div>
      <p className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-sm border border-foreground/20 px-4 py-3 text-base">
        {reply.messageText ?? "（内容なし）"}
      </p>
      <div className="flex flex-col gap-1 rounded-xl bg-foreground/5 px-3 py-2 text-sm text-foreground/80">
        <p>{replyLabel.description}</p>
        {confidenceLabel ? <p>回答の確かさ：{confidenceLabel}</p> : null}
        {reply.matchedFaqs.length > 0 ? (
          <div>
            <p>参考にしたFAQ：</p>
            <ul className="list-disc pl-5">
              {reply.matchedFaqs.map((faq) => (
                <li key={faq.id} className="break-words">
                  {faq.question ?? "（削除されたFAQ）"}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default async function ConversationDetailPage({
  params,
  searchParams,
}: ConversationDetailPageProps) {
  await requireAdmin();

  const { id } = await params;
  // 不正な形式のidをそのままSupabaseに渡すと例外になるため、その前に404として扱う。
  if (!isValidUuid(id)) {
    notFound();
  }

  const { before } = await searchParams;
  const isOlderPage = typeof before === "string";
  const thread = await getConversationThread(id, isOlderPage ? before : undefined);

  if (!thread) {
    notFound();
  }

  const detailPath = `${ADMIN_CONVERSATIONS_PATH}/${id}`;

  return (
    <main className="flex flex-col gap-6">
      <Link
        href={ADMIN_CONVERSATIONS_PATH}
        className="inline-flex min-h-11 items-center self-start text-sm font-bold text-foreground/80"
      >
        ← 会話ログ一覧へ
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">{thread.customerLabel}</h1>
        <p className="text-sm text-foreground/70">新しいやり取りが上に表示されます。</p>
      </div>

      {isOlderPage ? (
        <Link href={detailPath} className={outlineButtonClassName}>
          最新のやり取りに戻る
        </Link>
      ) : null}

      {thread.exchanges.length === 0 ? (
        <p className="rounded-xl border border-foreground/20 bg-foreground/5 px-4 py-6 text-center text-sm text-foreground/70">
          表示できるやり取りはありません。
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {thread.exchanges.map((exchange) => (
            <li
              key={exchange.customerMessage?.id ?? exchange.botReplies[0]?.id}
              className="flex flex-col gap-3 rounded-2xl border border-foreground/20 p-4"
            >
              {exchange.customerMessage ? (
                <CustomerBubble message={exchange.customerMessage} />
              ) : (
                <p className="text-xs text-foreground/60">
                  （お客様のメッセージは、さらに前のやり取りに表示されます）
                </p>
              )}
              {exchange.botReplies.length > 0 ? (
                exchange.botReplies.map((reply) => <BotReplyBubble key={reply.id} reply={reply} />)
              ) : (
                <p className="ml-8 text-sm text-foreground/60">（Botの返信は記録されていません）</p>
              )}
            </li>
          ))}
        </ol>
      )}

      {thread.olderCursor ? (
        <Link
          href={{ pathname: detailPath, query: { before: thread.olderCursor } }}
          className={outlineButtonClassName}
        >
          さらに前のやり取りを見る
        </Link>
      ) : null}
    </main>
  );
}
