import { vi } from "vitest";

// "server-only"はNext.jsのバンドラー(webpack/turbopack)がreact-server条件を
// 解決することで初めて安全に無害化されるパッケージ。vitestは素のNode.js解決を
// 使うため、テスト環境でのみ空モジュールとして扱う（本番のガード自体は変更しない）。
vi.mock("server-only", () => ({}));
