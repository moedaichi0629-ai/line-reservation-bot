import Link from "next/link";
import { ADMIN_HOME_PATH } from "@/lib/admin/constants";
import { secondaryButtonClassName } from "./button-styles";

type AdminHeaderProps = {
  logoutAction: () => Promise<void>;
};

export function AdminHeader({ logoutAction }: AdminHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-foreground/15 bg-background">
      <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 py-2">
        <Link
          href={ADMIN_HOME_PATH}
          className="flex min-h-11 items-center text-lg font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
        >
          管理画面
        </Link>
        <form action={logoutAction}>
          <button type="submit" className={secondaryButtonClassName}>
            ログアウト
          </button>
        </form>
      </div>
    </header>
  );
}
