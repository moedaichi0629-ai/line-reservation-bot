import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { MenuForm } from "../menu-form";

export const metadata: Metadata = {
  title: "メニューを追加",
};

export default async function NewMenuPage() {
  // このページはメニューを取得しないため、layout頼みにせず自分でも確認する(他ページと同じ多層防御)。
  await requireAdmin();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">メニューを追加</h1>
      <MenuForm mode="create" />
    </main>
  );
}
