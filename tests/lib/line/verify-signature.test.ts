import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyLineSignature } from "@/lib/line/verify-signature";

const CHANNEL_SECRET = "test-channel-secret";

function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

describe("verifyLineSignature", () => {
  it("正しい署名を渡すとtrueを返す", () => {
    const body = JSON.stringify({ events: [] });
    const signature = signBody(body, CHANNEL_SECRET);

    expect(verifyLineSignature(body, signature, CHANNEL_SECRET)).toBe(true);
  });

  it("bodyが改ざんされているとfalseを返す", () => {
    const body = JSON.stringify({ events: [] });
    const signature = signBody(body, CHANNEL_SECRET);
    const tamperedBody = JSON.stringify({ events: [{ type: "message" }] });

    expect(verifyLineSignature(tamperedBody, signature, CHANNEL_SECRET)).toBe(
      false
    );
  });

  it("署名が不正だとfalseを返す", () => {
    const body = JSON.stringify({ events: [] });

    expect(verifyLineSignature(body, "invalid-signature", CHANNEL_SECRET)).toBe(
      false
    );
  });

  it("signatureヘッダーがnullだとfalseを返す", () => {
    const body = JSON.stringify({ events: [] });

    expect(verifyLineSignature(body, null, CHANNEL_SECRET)).toBe(false);
  });

  it("チャネルシークレットが異なるとfalseを返す", () => {
    const body = JSON.stringify({ events: [] });
    const signature = signBody(body, CHANNEL_SECRET);

    expect(verifyLineSignature(body, signature, "different-secret")).toBe(
      false
    );
  });
});
