"use server";

import { redirect } from "next/navigation";
import {
  AdminConfigError,
  createAdminSession,
  destroyAdminSession,
  verifyAdminPassword,
} from "@/lib/admin/auth";
import { ADMIN_HOME_PATH, ADMIN_LOGIN_PATH, MAX_PASSWORD_LENGTH } from "@/lib/admin/constants";

export type LoginState = { error: string } | null;

const FAILURE_DELAY_MS = 800;

const WRONG_PASSWORD_MESSAGE = "パスワードが正しくありません。もう一度入力してください。";
const UNAVAILABLE_MESSAGE =
  "ログインできません。しばらくしてからもう一度お試しください。改善しない場合は制作担当へご連絡ください。";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loginAction(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const password = formData.get("password");

  let authenticated = false;
  try {
    authenticated =
      typeof password === "string" &&
      password.length > 0 &&
      password.length <= MAX_PASSWORD_LENGTH &&
      verifyAdminPassword(password);
    if (authenticated) {
      await createAdminSession();
    }
  } catch (error) {
    if (error instanceof AdminConfigError) {
      console.error("[admin-login] configuration error:", error.message);
    } else {
      console.error("[admin-login] unexpected error:", error instanceof Error ? error.name : "unknown");
    }
    return { error: UNAVAILABLE_MESSAGE };
  }

  if (!authenticated) {
    await wait(FAILURE_DELAY_MS);
    return { error: WRONG_PASSWORD_MESSAGE };
  }

  redirect(ADMIN_HOME_PATH);
}

export async function logoutAction(): Promise<void> {
  await destroyAdminSession();
  redirect(ADMIN_LOGIN_PATH);
}
