"use client";

import { useActionState, useEffect, useRef } from "react";

import { consumeCredentialAction, type FormResult } from "@/app/auth-actions";

const initialState: FormResult = { ok: false, message: "" };

export function CredentialForm({ purpose }: { purpose: "ACTIVATION" | "PASSWORD_RESET" }) {
  const tokenInput = useRef<HTMLInputElement>(null);
  const [state, action, pending] = useActionState(consumeCredentialAction, initialState);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (tokenInput.current) tokenInput.current.value = params.get("token") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  return (
    <form action={action} className="mt-8 space-y-5">
      <input ref={tokenInput} type="hidden" name="token" />
      <input type="hidden" name="purpose" value={purpose} />
      <label className="block text-sm font-medium text-slate-700">
        新密码
        <input required name="newPassword" type="password" minLength={12} maxLength={128} autoComplete="new-password" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
      </label>
      {state.message ? <p role="status" className={state.ok ? "text-sm text-teal-700" : "text-sm text-rose-700"}>{state.message}</p> : null}
      {state.ok ? <a href="/login" className="block text-center text-sm font-semibold text-teal-700">返回登录</a> : (
        <button disabled={pending} className="w-full rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "正在提交…" : purpose === "ACTIVATION" ? "激活账号" : "重置密码"}
        </button>
      )}
    </form>
  );
}
