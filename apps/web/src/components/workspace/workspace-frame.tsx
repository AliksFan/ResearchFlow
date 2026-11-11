"use client";

import type { RoleCode } from "@researchflow/auth";
import type { NotificationCenterState } from "@researchflow/collaboration";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useActionState, useEffect, useState } from "react";

import { switchRoleAction } from "@/app/auth-actions";
import { LogoutButton } from "@/components/auth/logout-button";
import { InfoTip } from "@/components/workspace/info-tip";
import { NotificationCenterDialog } from "@/components/workspace/notification-center-dialog";
import {
  defaultWorkspaceHref,
  isNavigationHrefActive,
  type WorkspaceNavigationArea,
  type WorkspaceRole,
} from "@/components/workspace/workspace-navigation";

const ROLE_LABELS: Record<RoleCode, string> = {
  DEAN: "院长",
  PMO: "PMO",
  KEY_SUB_I: "Key Sub-I",
  CRC: "CRC",
  STATISTICIAN: "统计师",
  COLLABORATION_LEAD: "协作负责人",
};

export function WorkspaceFrame({
  role,
  availableRoles,
  navigation,
  notificationState,
  children,
}: {
  role: WorkspaceRole;
  availableRoles: RoleCode[];
  navigation: WorkspaceNavigationArea[];
  notificationState: NotificationCenterState;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const activeArea = navigation.find((area) =>
    area.items.some((item) => isNavigationHrefActive(pathname, item.href)),
  ) ?? navigation[0]!;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-[0_4px_18px_rgba(27,65,88,0.05)] backdrop-blur">
        <div className="mx-auto flex min-h-18 max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link href={defaultWorkspaceHref(role)} className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-700 text-sm font-black tracking-wide text-white shadow-sm">RF</span>
            <span className="min-w-0">
              <strong className="block truncate text-sm text-slate-900 sm:text-base">ResearchFlow 项目管理</strong>
              <span className="mt-0.5 hidden truncate text-xs text-slate-500 sm:block">{activeArea.label}</span>
            </span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationCenterDialog state={notificationState} />
            <RoleSwitcher activeRole={role} availableRoles={availableRoles} />
            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 hover:border-teal-400">
                <span className="grid size-8 place-items-center rounded-full bg-slate-800 text-xs font-bold text-white">{role === "KEY_SUB_I" ? "K" : role[0]}</span>
                <span className="hidden text-left sm:block"><span className="block text-xs font-semibold text-slate-800">当前用户</span><span className="block text-[11px] text-slate-500">{ROLE_LABELS[role]}</span></span>
                <span aria-hidden="true" className="text-xs text-slate-400">▾</span>
              </summary>
              <div className="absolute right-0 mt-2 w-52 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-xl">
                {availableRoles.length > 1 ? <Link href="/select-role" className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">切换角色</Link> : null}
                <Link href="/change-password" className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50">修改密码</Link>
                <div className="mt-1 border-t border-slate-100 pt-1"><LogoutButton menu /></div>
              </div>
            </details>
          </div>
        </div>

        {role === "PMO" ? <nav aria-label="工作区" className="border-t border-slate-100">
          <div className="mx-auto flex max-w-[1440px] items-center gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
            {navigation.map((area) => {
              const active = area === activeArea;
              return <Link key={area.href} href={area.href} aria-current={active ? "page" : undefined} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold ${active ? "border-teal-700 text-teal-800" : "border-transparent text-slate-600 hover:text-slate-900"}`}>{area.label}</Link>;
            })}
          </div>
        </nav> : null}

        {activeArea.items.length > 1 ? <nav aria-label={`${activeArea.label}二级导航`} className="border-t border-slate-100 bg-slate-50/90"><div className="mx-auto flex max-w-[1440px] gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">{activeArea.items.map((item) => { const active = isNavigationHrefActive(pathname, item.href); return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${active ? "bg-white text-teal-800 shadow-sm ring-1 ring-slate-200" : "text-slate-600 hover:bg-white hover:text-slate-900"}`}>{item.label}</Link>; })}</div></nav> : null}
      </header>

      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</main>
    </div>
  );
}

function RoleSwitcher({ activeRole, availableRoles }: { activeRole: WorkspaceRole; availableRoles: RoleCode[] }) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<RoleCode>(activeRole);
  const [state, action, pending] = useActionState(switchRoleAction, { ok: false, message: "" });

  useEffect(() => {
    if (state.ok) {
      const href = selectedRole === "PMO" || selectedRole === "DEAN" || selectedRole === "KEY_SUB_I"
        ? defaultWorkspaceHref(selectedRole)
        : "/no-access";
      router.replace(href);
      router.refresh();
    }
  }, [router, selectedRole, state.ok]);

  return (
    <div className="relative hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 md:flex">
      <label htmlFor="workspace-role" className="text-[11px] text-slate-500">当前角色</label>
      {availableRoles.length > 1 ? <form action={action}><select id="workspace-role" name="roleCode" value={selectedRole} disabled={pending} onChange={(event) => { setSelectedRole(event.target.value as RoleCode); event.currentTarget.form?.requestSubmit(); }} className="max-w-40 bg-transparent text-sm font-semibold text-slate-800 outline-none"><option value={activeRole}>{ROLE_LABELS[activeRole]}</option>{availableRoles.filter((item) => item !== activeRole).map((item) => <option key={item} value={item}>{ROLE_LABELS[item]}</option>)}</select></form> : <span className="text-sm font-semibold text-slate-800">{ROLE_LABELS[activeRole]}</span>}
      <InfoTip label="了解角色切换规则">切换后进入新角色默认首页，页面和数据权限按新角色重新计算。</InfoTip>
      {state.message && !state.ok ? <p role="alert" className="absolute right-0 top-12 w-64 rounded-lg bg-rose-700 px-3 py-2 text-xs text-white shadow-lg">{state.message}</p> : null}
    </div>
  );
}
