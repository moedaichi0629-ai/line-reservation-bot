import { describe, expect, it } from "vitest";
import {
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  isUsableSessionSecret,
  verifySessionToken,
} from "@/lib/admin/session-token";

const SECRET = "test-secret-that-is-at-least-32-characters-long";
const OTHER_SECRET = "another-secret-that-is-at-least-32-characters";
const NOW = 1_800_000_000_000;

describe("createSessionToken / verifySessionToken", () => {
  it("作成直後のトークンは有効と判定される", () => {
    const token = createSessionToken(SECRET, NOW);

    expect(verifySessionToken(token, SECRET, NOW)).toBe(true);
  });

  it("有効期限の直前までは有効で、期限ちょうどで無効になる", () => {
    const token = createSessionToken(SECRET, NOW);
    const expiresAtMs = NOW + SESSION_MAX_AGE_SECONDS * 1000;

    expect(verifySessionToken(token, SECRET, expiresAtMs - 1)).toBe(true);
    expect(verifySessionToken(token, SECRET, expiresAtMs)).toBe(false);
  });

  it("別のシークレットで署名されたトークンは無効", () => {
    const token = createSessionToken(OTHER_SECRET, NOW);

    expect(verifySessionToken(token, SECRET, NOW)).toBe(false);
  });

  it("有効期限を書き換えたトークンは無効(署名が一致しない)", () => {
    const token = createSessionToken(SECRET, NOW);
    const [expiry, signature] = token.split(".");
    const forged = `${Number(expiry) + 100_000}.${signature}`;

    expect(verifySessionToken(forged, SECRET, NOW)).toBe(false);
  });

  it("署名の一部を書き換えたトークンは無効", () => {
    const token = createSessionToken(SECRET, NOW);
    const tampered = `${token.slice(0, -2)}${token.endsWith("AA") ? "BB" : "AA"}`;

    expect(verifySessionToken(tampered, SECRET, NOW)).toBe(false);
  });

  it("先頭ゼロ付きの有効期限など、正規形でない表記は署名が有効でも拒否する", () => {
    const token = createSessionToken(SECRET, NOW);
    const [expiry, signature] = token.split(".");

    expect(verifySessionToken(`000${expiry}.${signature}`, SECRET, NOW)).toBe(false);
  });

  it("署名の未使用ビットの変更や不正文字の付加など、正規形でないbase64urlは拒否する", () => {
    const token = createSessionToken(SECRET, NOW);
    const [expiry, signature] = token.split(".");
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const last = signature.at(-1) as string;
    const sameBytesVariant = signature.slice(0, -1) + alphabet[alphabet.indexOf(last) ^ 1];

    expect(Buffer.from(sameBytesVariant, "base64url").equals(Buffer.from(signature, "base64url"))).toBe(true);
    expect(verifySessionToken(`${expiry}.${sameBytesVariant}`, SECRET, NOW)).toBe(false);
    expect(verifySessionToken(`${expiry}.${signature}!`, SECRET, NOW)).toBe(false);
    expect(verifySessionToken(`${expiry}.${signature}=`, SECRET, NOW)).toBe(false);
    expect(verifySessionToken(`${expiry}.${signature}`, SECRET, NOW)).toBe(true);
  });

  it.each([
    ["undefined", undefined],
    ["空文字", ""],
    ["区切り無し", "abc"],
    ["区切りが多い", "1.2.3"],
    ["期限が数字でない", "abc.def"],
    ["署名が空", "1800000000."],
    ["期限が長すぎる", "1234567890123.abc"],
  ])("不正な形式(%s)は無効", (_label, token) => {
    expect(verifySessionToken(token, SECRET, NOW)).toBe(false);
  });

  it("シークレットが未設定または短い場合は、正しく作られたトークンでも無効(fail closed)", () => {
    const token = createSessionToken(SECRET, NOW);

    expect(verifySessionToken(token, undefined, NOW)).toBe(false);
    expect(verifySessionToken(token, "", NOW)).toBe(false);
    expect(verifySessionToken(token, "short", NOW)).toBe(false);
  });
});

describe("isUsableSessionSecret", () => {
  it("32文字以上のみ使用可能と判定する", () => {
    expect(isUsableSessionSecret("a".repeat(32))).toBe(true);
    expect(isUsableSessionSecret("a".repeat(31))).toBe(false);
    expect(isUsableSessionSecret(undefined)).toBe(false);
  });
});
