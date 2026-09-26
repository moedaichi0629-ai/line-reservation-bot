import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const MIN_SESSION_SECRET_LENGTH = 32;

const TOKEN_CONTEXT = "admin-session.v1";
const EXPIRY_PATTERN = /^\d{1,12}$/;

function sign(secret: string, expiresAtSeconds: number): Buffer {
  return createHmac("sha256", secret)
    .update(`${TOKEN_CONTEXT}.${expiresAtSeconds}`)
    .digest();
}

export function isUsableSessionSecret(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= MIN_SESSION_SECRET_LENGTH;
}

export function createSessionToken(
  secret: string,
  nowMs: number = Date.now(),
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS,
): string {
  const expiresAtSeconds = Math.floor(nowMs / 1000) + maxAgeSeconds;
  return `${expiresAtSeconds}.${sign(secret, expiresAtSeconds).toString("base64url")}`;
}

export function verifySessionToken(
  token: string | undefined,
  secret: string | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!token || !isUsableSessionSecret(secret)) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return false;
  }

  const [expiryText, signatureText] = parts;
  if (!EXPIRY_PATTERN.test(expiryText)) {
    return false;
  }

  const expiresAtSeconds = Number(expiryText);
  // Reject non-canonical encodings (e.g. leading zeros) so each valid token has exactly one form.
  if (String(expiresAtSeconds) !== expiryText) {
    return false;
  }

  const expected = sign(secret, expiresAtSeconds);
  const actual = Buffer.from(signatureText, "base64url");
  if (
    actual.toString("base64url") !== signatureText ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  ) {
    return false;
  }

  return expiresAtSeconds * 1000 > nowMs;
}
