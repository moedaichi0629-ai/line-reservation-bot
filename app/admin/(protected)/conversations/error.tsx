"use client";

import Link from "next/link";
import { outlineButtonClassName, primaryButtonClassName } from "@/components/admin/button-styles";
import { FlashMessage } from "@/components/admin/flash-message";
import { ADMIN_HOME_PATH } from "@/lib/admin/constants";

type ConversationsErrorProps = {
  error: Error & { digest?: string };
  retry: () => void;
};

// エラーの詳細(DBのエラーメッセージ等)はサーバーログにのみ残し、画面には出さない。
export default function ConversationsError({ retry }: ConversationsErrorProps) {
  return (
    <main className="flex flex-col gap-4">
      <FlashMessage variant="error">
        会話ログを読み込めませんでした。時間をおいてもう一度お試しください。
      </FlashMessage>
      <button
        type="button"
        onClick={() => retry()}
        className={primaryButtonClassName}
      >
        もう一度読み込む
      </button>
      <Link
        href={ADMIN_HOME_PATH}
        className={outlineButtonClassName}
      >
        管理メニューへ戻る
      </Link>
    </main>
  );
}
