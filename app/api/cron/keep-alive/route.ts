import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** 推測されにくさを担保するため、これより短いCRON_SECRETは設定ミスとして扱う。 */
const MIN_CRON_SECRET_LENGTH = 16;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/** 長さの違いも含めて比較時間から情報が漏れないよう、ダイジェスト同士を定数時間で比較する。 */
function isAuthorized(authorization: string | null, secret: string): boolean {
  if (!authorization) {
    return false;
  }
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}

/** 生のerrorオブジェクトには接続情報等が含まれ得るため、ログへは名前/型のみを出す。 */
function safeErrorLogValue(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/**
 * Supabase無料プランの一時停止（7日間アクセスなし）を防ぐため、Vercel Cronから1日1回呼ばれる。
 * CRON_SECRETを設定するとVercelが `Authorization: Bearer <CRON_SECRET>` を付けて呼び出す。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;

  // 未設定・短すぎる場合に誰でも呼べる状態にしないよう、DBへ触れずに失敗させる（fail-closed）。
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) {
    console.error("CRON_SECRET is not set or too short.");
    return NextResponse.json(
      { error: "server misconfigured" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    // 不正アクセスの試行をLogsで追えるよう固定文言だけ残す（ヘッダーの値は出さない）。
    console.warn("Keep-alive request rejected: unauthorized.");
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  try {
    // 読み取りのみ・1行だけの軽いクエリ。取得したデータはレスポンスへ含めない。
    const { error } = await createSupabaseServerClient().from("faq").select("id").limit(1);

    if (error) {
      console.error("Keep-alive query failed", error.code ?? "unknown");
      return NextResponse.json(
        { error: "keep-alive failed" },
        { status: 500, headers: NO_STORE_HEADERS }
      );
    }
  } catch (error) {
    console.error("Keep-alive query threw", safeErrorLogValue(error));
    return NextResponse.json(
      { error: "keep-alive failed" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
}
