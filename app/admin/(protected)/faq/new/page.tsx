import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { FaqForm } from "../faq-form";

export const metadata: Metadata = {
  title: "FAQを追加",
};

export default async function NewFaqPage() {
  // このページはFAQを取得しないため、layout頼みにせず自分でも確認する(他ページと同じ多層防御)。
  await requireAdmin();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">FAQを追加</h1>
      <FaqForm mode="create" />
    </main>
  );
}
