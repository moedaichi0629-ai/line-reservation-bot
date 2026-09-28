import Link from "next/link";
import { ADMIN_HOME_PATH } from "@/lib/admin/constants";

// ポートフォリオ用の紹介ページ。秘密情報・Webhook URL・管理画面の認証情報はここに載せない。

const FEATURES = [
  {
    title: "FAQ自動回答",
    description: "LINEで届いた質問に、登録済みのFAQをもとに自動で返信します。",
  },
  {
    title: "AIによる回答判定",
    description: "AIの回答を確かさ（高い・ふつう・低い）と根拠のFAQで判定し、根拠が無い回答は送りません。",
  },
  {
    title: "スタッフ確認通知",
    description: "確実に答えられない質問は、お客様へ確認中の案内を返し、オーナーのLINEへ通知します。",
  },
  {
    title: "会話ログ",
    description: "お客様とBotのやり取り、回答の確かさ、参考にしたFAQを管理画面で確認できます。",
  },
  {
    title: "FAQ管理",
    description: "FAQの追加・編集・公開/非公開・並び替えを管理画面から行えます。",
  },
  {
    title: "お知らせ配信",
    description: "下書き保存と管理者へのテスト送信を経て、LINEの友だち全員へお知らせを配信できます。",
  },
] as const;

const TECH_STACK = [
  "Next.js",
  "TypeScript",
  "Supabase",
  "LINE Messaging API",
  "Claude API",
  "Vercel",
] as const;

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-4 py-12">
      <section className="flex flex-col gap-4">
        <p className="text-sm font-bold text-foreground/60">ポートフォリオ</p>
        <h1 className="text-3xl font-bold leading-tight">美容室向け LINE 問い合わせBot</h1>
        <p className="text-base leading-7 text-foreground/80">
          LINEからのよくある質問に自動回答し、FAQ管理・会話ログ・お知らせ配信を管理画面から行えるシステムです。
        </p>
      </section>

      <section aria-labelledby="features-heading" className="flex flex-col gap-4">
        <h2 id="features-heading" className="text-xl font-bold">
          主な機能
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="flex flex-col gap-1 rounded-2xl border border-foreground/20 p-5"
            >
              <p className="text-lg font-bold">{feature.title}</p>
              <p className="text-sm leading-6 text-foreground/70">{feature.description}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="tech-heading" className="flex flex-col gap-4">
        <h2 id="tech-heading" className="text-xl font-bold">
          技術
        </h2>
        <ul className="flex flex-wrap gap-2">
          {TECH_STACK.map((tech) => (
            <li
              key={tech}
              className="rounded-full border border-foreground/20 px-3 py-1 text-sm text-foreground/80"
            >
              {tech}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl bg-foreground/5 p-5 text-sm leading-6 text-foreground/70">
        <p>このサイトはポートフォリオ用デモです。</p>
        <p>管理画面はパスワードで保護されています。</p>
      </section>

      <footer className="mt-auto border-t border-foreground/15 pt-6 text-xs text-foreground/50">
        <Link href={ADMIN_HOME_PATH} className="underline underline-offset-2">
          管理者ログイン
        </Link>
      </footer>
    </main>
  );
}
