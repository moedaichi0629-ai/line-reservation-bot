import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_HOME_PATH, ADMIN_LOGIN_PATH } from "./constants";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  isUsableSessionSecret,
  verifySessionToken,
} from "./session-token";

export const MIN_ADMIN_PASSWORD_LENGTH = 12;

// Messages name the environment variables only, never their values.
export class AdminConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminConfigError";
  }
}

function readAdminPassword(): string {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    throw new AdminConfigError(
      `ADMIN_PASSWORD must be set to at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`,
    );
  }
  return password;
}

function readSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!isUsableSessionSecret(secret)) {
    throw new AdminConfigError(
      "ADMIN_SESSION_SECRET must be set to a random string of at least 32 characters.",
    );
  }
  return secret;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function verifyAdminPassword(input: string): boolean {
  const expected = readAdminPassword();
  return timingSafeEqual(digest(input), digest(expected));
}

export async function createAdminSession(): Promise<void> {
  const token = createSessionToken(readSessionSecret());
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: ADMIN_HOME_PATH,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroyAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: SESSION_COOKIE_NAME, path: ADMIN_HOME_PATH });
}

// Fails closed: a missing or weak secret means nobody is authenticated.
export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token, process.env.ADMIN_SESSION_SECRET);
}

export async function requireAdmin(): Promise<void> {
  if (!(await isAdminAuthenticated())) {
    redirect(ADMIN_LOGIN_PATH);
  }
}
