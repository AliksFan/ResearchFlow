"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";

const subscribeToHydration = () => () => undefined;

export function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    const result = await signIn("credentials", {
      loginName: data.get("loginName"),
      password: data.get("password"),
      redirect: false,
    });
    setPending(false);
    if (!result?.ok) {
      setMessage("登录未成功，请检查凭据或稍后再试。");
      return;
    }
    router.replace("/entry");
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-5">
      <Field label="登录名" name="loginName" type="text" autoComplete="username" />
      <Field label="密码" name="password" type="password" autoComplete="current-password" />
      {message ? <p role="alert" className="text-sm text-rose-700">{message}</p> : null}
      <button disabled={!hydrated || pending} className="w-full rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "正在验证…" : hydrated ? "登录" : "正在准备安全登录…"}
      </button>
    </form>
  );
}

function Field(props: {
  label: string;
  name: string;
  type: string;
  autoComplete: string;
}) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {props.label}
      <input
        {...props}
        required
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base shadow-sm"
      />
    </label>
  );
}
