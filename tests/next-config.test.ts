import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

describe("next.config headers", () => {
  it("セキュリティヘッダは /admin 配下にのみ付与し、Webhookなど他のパスへ影響しない", async () => {
    const rules = await nextConfig.headers?.();

    expect(rules).toHaveLength(1);
    expect(rules?.[0].source).toBe("/admin/:path*");
  });

  it("キャッシュ禁止・クリックジャッキング防止・インデックス拒否のヘッダを含む", async () => {
    const rules = await nextConfig.headers?.();
    const headers = Object.fromEntries((rules?.[0].headers ?? []).map((h) => [h.key, h.value]));

    expect(headers["Cache-Control"]).toBe("no-store");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("no-referrer");
    expect(headers["X-Robots-Tag"]).toContain("noindex");
  });
});
