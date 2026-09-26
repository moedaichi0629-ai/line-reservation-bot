/**
 * ログに残すエラーの種類名。メッセージ本文には外部APIの応答や入力値が含まれ得るため、
 * 秘密情報・個人情報を扱う処理では名前だけを残す。
 */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}
