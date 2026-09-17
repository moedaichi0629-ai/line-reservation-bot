/**
 * LINE Messaging APIのテキストメッセージは、UTF-16コード単位で数えて最大5000文字まで
 * （LINE Developers公式ドキュメント準拠）。JS文字列の`.length`/`.slice()`は
 * もともとUTF-16コード単位で動作するため、この上限とカウント方法が一致する。
 *
 * ただし単純に`slice(0, 5000)`で切ると、絵文字などサロゲートペア（2コード単位で
 * 1文字を表す）の境界をちょうど跨ぐ場合に、下位サロゲートを失った不正な文字列
 * （孤立した上位サロゲート）を生成してしまう。境界がサロゲートペアの間に
 * 来る場合は、ペアごと切り捨てる。
 */
export const LINE_TEXT_MESSAGE_MAX_LENGTH = 5000;

export function truncateForLineText(
  text: string,
  maxLength: number = LINE_TEXT_MESSAGE_MAX_LENGTH
): string {
  if (text.length <= maxLength) {
    return text;
  }

  let end = maxLength;
  const charCodeBeforeBoundary = text.charCodeAt(end - 1);
  const isHighSurrogate =
    charCodeBeforeBoundary >= 0xd800 && charCodeBeforeBoundary <= 0xdbff;

  if (isHighSurrogate) {
    end -= 1;
  }

  return text.slice(0, end);
}
