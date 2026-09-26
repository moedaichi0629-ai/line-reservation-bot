import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getMenuById } from "@/lib/admin/menu-repository";
import { isValidUuid } from "@/lib/admin/schemas";
import { MenuForm } from "../menu-form";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata: Metadata = {
  title: "メニューを編集",
};

type EditMenuPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditMenuPage({ params }: EditMenuPageProps) {
  await requireAdmin();
  const { id } = await params;

  // 不正な形式のidをそのままSupabaseに渡すと例外になりエラー画面になってしまうため、
  // その前に404として扱う。
  if (!isValidUuid(id)) {
    notFound();
  }

  const menu = await getMenuById(id);

  if (!menu) {
    notFound();
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">メニューを編集</h1>
      <MenuForm
        mode="edit"
        menuId={menu.id}
        initialValues={{
          name: menu.name,
          description: menu.description,
          price_yen: menu.price_yen,
          duration_minutes: menu.duration_minutes,
        }}
      />
    </main>
  );
}
