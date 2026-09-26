import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "ログイン",
};

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">管理画面ログイン</h1>
        <p className="text-base text-foreground/70">パスワードを入力してください。</p>
      </div>
      <LoginForm />
    </main>
  );
}
