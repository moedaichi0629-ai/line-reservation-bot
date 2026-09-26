import type { ReactNode } from "react";

export const inputClassName =
  "block min-h-12 w-full rounded-xl border border-foreground/30 bg-background px-4 text-base text-foreground placeholder:text-foreground/40 focus:border-foreground focus:outline-2 focus:outline-offset-2 focus:outline-foreground";

export const textareaClassName =
  "block w-full rounded-xl border border-foreground/30 bg-background px-4 py-3 text-base text-foreground placeholder:text-foreground/40 focus:border-foreground focus:outline-2 focus:outline-offset-2 focus:outline-foreground";

type FormFieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
};

export function FormField({ label, htmlFor, hint, children }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="text-base font-bold">
        {label}
      </label>
      {children}
      {hint ? <p className="text-sm text-foreground/70">{hint}</p> : null}
    </div>
  );
}
