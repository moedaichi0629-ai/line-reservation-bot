"use client";

import { useActionState } from "react";
import { FlashMessage } from "@/components/admin/flash-message";
import { FormField, inputClassName, textareaClassName } from "@/components/admin/form-field";
import { SubmitButton } from "@/components/admin/submit-button";
import {
  FAQ_ANSWER_MAX_LENGTH,
  FAQ_CATEGORY_MAX_LENGTH,
  FAQ_QUESTION_MAX_LENGTH,
} from "@/lib/admin/input-limits";
import { createFaqAction, updateFaqAction, type FaqFormState } from "./actions";

type FaqFormValues = {
  question: string;
  answer: string;
  category: string | null;
};

type FaqFormProps =
  | { mode: "create" }
  | { mode: "edit"; faqId: string; initialValues: FaqFormValues };

const EMPTY_VALUES: FaqFormValues = { question: "", answer: "", category: "" };

export function FaqForm(props: FaqFormProps) {
  const action =
    props.mode === "create" ? createFaqAction : updateFaqAction.bind(null, props.faqId);
  const [state, formAction] = useActionState<FaqFormState, FormData>(action, null);
  const initial = props.mode === "edit" ? props.initialValues : EMPTY_VALUES;

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state?.error ? <FlashMessage variant="error">{state.error}</FlashMessage> : null}

      <FormField label="質問" htmlFor="question" hint={`${FAQ_QUESTION_MAX_LENGTH}文字以内`}>
        <input
          id="question"
          name="question"
          type="text"
          required
          maxLength={FAQ_QUESTION_MAX_LENGTH}
          defaultValue={initial.question}
          className={inputClassName}
        />
      </FormField>

      <FormField label="回答" htmlFor="answer" hint={`${FAQ_ANSWER_MAX_LENGTH}文字以内`}>
        <textarea
          id="answer"
          name="answer"
          required
          rows={6}
          maxLength={FAQ_ANSWER_MAX_LENGTH}
          defaultValue={initial.answer}
          className={textareaClassName}
        />
      </FormField>

      <FormField
        label="カテゴリ(任意)"
        htmlFor="category"
        hint={`${FAQ_CATEGORY_MAX_LENGTH}文字以内。未入力可`}
      >
        <input
          id="category"
          name="category"
          type="text"
          maxLength={FAQ_CATEGORY_MAX_LENGTH}
          defaultValue={initial.category ?? ""}
          className={inputClassName}
        />
      </FormField>

      <SubmitButton pendingLabel="保存中…">
        {props.mode === "create" ? "追加する" : "保存する"}
      </SubmitButton>
    </form>
  );
}
