// No "use server" here: Server Action files may only export async functions.

/** フォームの必須項目(hidden inputのid等)を取り出す。無ければ例外(画面の不具合なので利用者向けの文言は出さない)。 */
export function requireStringField(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing form field: ${name}`);
  }
  return value;
}

/** フォームの項目を取り出す。無い・空の場合はnull。 */
export function readStringField(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.length > 0 ? value : null;
}
