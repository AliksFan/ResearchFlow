"use client";

import type { RoleCode } from "@researchflow/auth";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { switchRoleAction } from "@/app/auth-actions";

const labels: Record<RoleCode, string> = {
  DEAN: "院长",
  PMO: "PMO",
  KEY_SUB_I: "Key Sub-I",
  CRC: "CRC",
  STATISTICIAN: "统计师",
  COLLABORATION_LEAD: "协作负责人",
};

export function RoleSelectionForm({ roles }: { roles: RoleCode[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(switchRoleAction, { ok: false, message: "" });
  useEffect(() => {
    if (state.ok) {
      router.replace("/workspace");
      router.refresh();
    }
  }, [router, state.ok]);
  return (
    <form action={action} className="mt-8 space-y-4">
      <fieldset className="space-y-3">
        <legend className="sr-only">选择角色</legend>
        {roles.map((role, index) => (
          <label key={role} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-300 p-4">
            <input required type="radio" name="roleCode" value={role} defaultChecked={index === 0} />
            <span className="font-medium">{labels[role]}</span>
          </label>
        ))}
      </fieldset>
      {state.message && !state.ok ? <p role="alert" className="text-sm text-rose-700">{state.message}</p> : null}
      <button disabled={pending} className="w-full rounded-lg bg-teal-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "正在切换…" : "进入系统"}
      </button>
    </form>
  );
}
