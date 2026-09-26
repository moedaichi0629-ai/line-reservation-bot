// No "use server" here: Server Action files may only export async functions.

export type FlashKind = "success" | "error" | "warning";
export type Flash = { kind: FlashKind; message: string };

/**
 * 操作結果を一覧画面に表示するためのリダイレクト先URL(?success= / ?error= / ?warning=)。
 * extraParamsは画面側の追加の合図(例: お知らせの下書き保存時に入力欄を空にするsaved)に使う。
 */
export function buildFlashUrl(
  basePath: string,
  { kind, message }: Flash,
  extraParams: Record<string, string> = {},
): string {
  const query = Object.entries({ [kind]: message, ...extraParams })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `${basePath}?${query}`;
}
