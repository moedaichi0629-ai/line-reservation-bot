"use client";

import { useActionState } from "react";
import { FlashMessage } from "@/components/admin/flash-message";
import { FormField, inputClassName } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import { MAX_PASSWORD_LENGTH } from "@/lib/admin/constants";
import { loginAction, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, null);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state?.error ? <FlashMessage variant="error">{state.error}</FlashMessage> : null}

      <FormField label="パスワード" htmlFor="password">
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={MAX_PASSWORD_LENGTH}
          className={inputClassName}
        />
      </FormField>

      <SubmitButton pendingLabel="ログイン中…">ログイン</SubmitButton>
    </form>
  );
}
