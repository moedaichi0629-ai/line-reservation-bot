/**
 * 入力途中のお知らせ本文を、入力欄の部品の外(モジュール内)に保持する小さなストア。
 *
 * Server Actionがredirect()で終わると、Next.jsはページ(ルートセグメント)の部品を作り直すため、
 * 部品のstate(useState)に持つと、履歴側で配信・テスト送信をしただけで入力途中の本文が空に戻ってしまう。
 * モジュール内の値は部品が作り直されても残るので、useSyncExternalStoreで読み書きする。
 * (ページを再読み込みした場合は空に戻る)
 */

export type DraftStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => string;
  setBody: (body: string) => void;
  /** 下書き保存の成功(新しい?saved=の値)を受けたら一度だけ空にする。同じ値では二度空にしない。 */
  clearForSavedToken: (savedToken: string | null) => void;
};

export function createDraftStore(): DraftStore {
  let body = "";
  let lastClearedToken: string | null = null;
  const listeners = new Set<() => void>();

  function update(next: string) {
    if (next === body) {
      return;
    }
    body = next;
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => body,
    setBody: update,
    clearForSavedToken(savedToken) {
      if (savedToken === null || savedToken === lastClearedToken) {
        return;
      }
      lastClearedToken = savedToken;
      update("");
    },
  };
}

export const announcementDraftStore = createDraftStore();
