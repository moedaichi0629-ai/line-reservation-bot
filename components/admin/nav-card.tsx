import Link from "next/link";

type NavCardProps = {
  title: string;
  description: string;
  href: string;
  ready: boolean;
};

const CARD_BASE = "flex min-h-24 flex-col justify-center gap-1 rounded-2xl border border-foreground/20 p-5";

export function NavCard({ title, description, href, ready }: NavCardProps) {
  if (!ready) {
    return (
      <div className={`${CARD_BASE} bg-foreground/5 text-foreground/60`}>
        <p className="flex items-center gap-2 text-lg font-bold">
          {title}
          <span className="rounded-full border border-foreground/30 px-2 py-0.5 text-xs font-normal">
            準備中
          </span>
        </p>
        <p className="text-sm">{description}</p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={`${CARD_BASE} bg-background active:bg-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground`}
    >
      <p className="text-lg font-bold">{title}</p>
      <p className="text-sm text-foreground/70">{description}</p>
    </Link>
  );
}
