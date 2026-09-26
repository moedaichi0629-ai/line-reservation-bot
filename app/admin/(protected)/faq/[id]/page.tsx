import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFaqById } from "@/lib/admin/faq-repository";
import { isValidUuid } from "@/lib/admin/schemas";
import { FaqForm } from "../faq-form";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "FAQを編集",
};

type EditFaqPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditFaqPage({ params }: EditFaqPageProps) {
  await requireAdmin();
  const { id } = await params;

  // 不正な形式のidをそのままSupabaseに渡すと例外になりエラー画面になってしまうため、
  // その前に404として扱う。
  if (!isValidUuid(id)) {
    notFound();
  }

  const faq = await getFaqById(id);

  if (!faq) {
    notFound();
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">FAQを編集</h1>
      <FaqForm
        mode="edit"
        faqId={faq.id}
        initialValues={{ question: faq.question, answer: faq.answer, category: faq.category }}
      />
    </main>
  );
}
