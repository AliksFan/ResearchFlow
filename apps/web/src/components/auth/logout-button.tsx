"use client";

import { signOut } from "next-auth/react";

export function LogoutButton({ menu = false }: { menu?: boolean }) {
  return <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} className={menu ? "block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50" : "text-sm font-medium text-slate-600 underline underline-offset-4"}>退出登录</button>;
}
