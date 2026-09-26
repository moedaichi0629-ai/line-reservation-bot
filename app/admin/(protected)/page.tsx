import { NavCard } from "@/components/admin/nav-card";
import { requireAdmin } from "@/lib/admin/auth";

const MENU_ITEMS = [
  {
    title: "FAQ管理",
    description: "よくある質問と回答を編集します",
    href: "/admin/faq",
    ready: true,
  },
  {
    title: "メニュー・料金",
    description: "メニューと料金を編集します",
    href: "/admin/menus",
    ready: true,
  },
  {
    title: "会話ログ",
    description: "お客様とBotのやり取りを確認します",
    href: "/admin/conversations",
    ready: true,
  },
  {
    title: "お知らせ配信",
    description: "LINEの友だちへお知らせを送ります",
    href: "/admin/announcements",
    ready: true,
  },
] as const;

export default async function AdminDashboardPage() {
  await requireAdmin();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">管理メニュー</h1>
      <nav aria-label="管理メニュー">
        <ul className="flex flex-col gap-3">
          {MENU_ITEMS.map((item) => (
            <li key={item.href}>
              <NavCard {...item} />
            </li>
          ))}
        </ul>
      </nav>
    </main>
  );
}
