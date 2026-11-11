"use client";

import { useActionState } from "react";

import { changePasswordAction, type FormResult } from "@/app/auth-actions";

const initialState: FormResult = { ok: false, message: "" };

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initialState);
  return (
    <form action={action} className="mt-8 space-y-5">
      <PasswordField label="当前密码" name="currentPassword" autoComplete="current-password" />
      <PasswordField label="新密码" name="newPassword" autoComplete="new-password" />
      {state.message ? <p role="status" className={state.ok ? "text-sm text-teal-700" : "text-sm text-rose-700"}>{state.message}</p> : null}
      {state.ok ? <a href="/entry" className="block text-center text-sm font-semibold text-teal-700">继续</a> : (
        <button disabled={pending} className="w-full rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "正在保存…" : "修改密码"}
        </button>
      )}
    </form>
  );
}

function PasswordField({ label, name, autoComplete }: { label: string; name: string; autoComplete: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input required name={name} type="password" minLength={12} maxLength={128} autoComplete={autoComplete} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>;
}
