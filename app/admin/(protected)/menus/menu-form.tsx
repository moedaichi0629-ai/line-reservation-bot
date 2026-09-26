"use client";

import { useActionState } from "react";
import { FlashMessage } from "@/components/admin/flash-message";
import { FormField, inputClassName, textareaClassName } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import {
  MENU_DESCRIPTION_MAX_LENGTH,
  MENU_DURATION_MAX_MINUTES,
  MENU_DURATION_MIN_MINUTES,
  MENU_NAME_MAX_LENGTH,
  MENU_PRICE_MAX_YEN,
  MENU_PRICE_MIN_YEN,
} from "@/lib/admin/input-limits";
import { createMenuAction, updateMenuAction, type MenuFormState } from "./actions";

type MenuFormValues = {
  name: string;
  description: string | null;
  price_yen: number;
  duration_minutes: number;
};

type MenuFormProps = { mode: "create" } | { mode: "edit"; menuId: string; initialValues: MenuFormValues };

const EMPTY_VALUES: MenuFormValues = {
  name: "",
  description: "",
  price_yen: 0,
  duration_minutes: 0,
};

export function MenuForm(props: MenuFormProps) {
  const action =
    props.mode === "create" ? createMenuAction : updateMenuAction.bind(null, props.menuId);
  const [state, formAction] = useActionState<MenuFormState, FormData>(action, null);
  const initial = props.mode === "edit" ? props.initialValues : EMPTY_VALUES;
  const isCreate = props.mode === "create";

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state?.error ? <FlashMessage variant="error">{state.error}</FlashMessage> : null}

      <p className="rounded-xl border border-foreground/20 bg-foreground/5 px-4 py-3 text-sm text-foreground/70">
        ※ ここで登録した内容は、現在Botの自動応答には反映されません。
      </p>

      <FormField label="メニュー名" htmlFor="name" hint={`${MENU_NAME_MAX_LENGTH}文字以内`}>
        <input
          id="name"
          name="name"
          type="text"
          required
          maxLength={MENU_NAME_MAX_LENGTH}
          defaultValue={initial.name}
          className={inputClassName}
        />
      </FormField>

      <FormField
        label="説明(任意)"
        htmlFor="description"
        hint={`${MENU_DESCRIPTION_MAX_LENGTH}文字以内。未入力可`}
      >
        <textarea
          id="description"
          name="description"
          rows={4}
          maxLength={MENU_DESCRIPTION_MAX_LENGTH}
          defaultValue={initial.description ?? ""}
          className={textareaClassName}
        />
      </FormField>

      <FormField
        label="料金(円)"
        htmlFor="price_yen"
        hint={`半角数字のみ。${MENU_PRICE_MIN_YEN}〜${MENU_PRICE_MAX_YEN}`}
      >
        <input
          id="price_yen"
          name="price_yen"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          required
          defaultValue={isCreate ? "" : initial.price_yen.toString()}
          className={inputClassName}
        />
      </FormField>

      <FormField
        label="所要時間(分)"
        htmlFor="duration_minutes"
        hint={`半角数字のみ。${MENU_DURATION_MIN_MINUTES}〜${MENU_DURATION_MAX_MINUTES}`}
      >
        <input
          id="duration_minutes"
          name="duration_minutes"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          required
          defaultValue={isCreate ? "" : initial.duration_minutes.toString()}
          className={inputClassName}
        />
      </FormField>

      <SubmitButton pendingLabel="保存中…">{isCreate ? "追加する" : "保存する"}</SubmitButton>
    </form>
  );
}
