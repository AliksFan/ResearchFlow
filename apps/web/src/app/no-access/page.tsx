import { redirect } from "next/navigation";
import Link from "next/link";

import { LogoutButton } from "@/components/auth/logout-button";
import { StatePanel } from "@/components/feedback/state-panel";
import { isWorkspaceRole } from "@/components/workspace/workspace-navigation";
import { getAuthRuntime } from "@/server/auth-runtime";
import { getRawSessionCarrier } from "@/server/session-carrier";

export default async function NoAccessPage() {
  const carrier = await getRawSessionCarrier();
  if (!carrier) redirect("/login");
  const session = await (await getAuthRuntime()).authentication.validateSession(carrier, new Date());
  if (!session.authenticated) redirect("/login");
  const activeRoleAvailable = session.activeRoleCode
    ? session.availableRoleCodes.includes(session.activeRoleCode)
    : false;
  if (session.activeRoleCode && activeRoleAvailable && isWorkspaceRole(session.activeRoleCode)) redirect("/entry");
  if (!activeRoleAvailable && session.availableRoleCodes.length > 0) redirect("/select-role");
  if (session.activeRoleCode && activeRoleAvailable) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-12">
        <StatePanel
          label={`当前角色：${session.activeRoleCode}`}
          title="当前角色暂无工作区"
          description="本期正式 Web 尚未开放该支持角色的独立工作区；角色授权仍由服务端用于项目协作与集成校验。"
          action={
            <div className="flex flex-wrap justify-center gap-3">
              {session.availableRoleCodes.length > 1 ? <Link href="/select-role" className="button-primary">切换角色</Link> : null}
              <LogoutButton />
            </div>
          }
        />
      </main>
    );
  }
  return <main className="mx-auto max-w-3xl px-5 py-12"><StatePanel label="已登录" title="暂无可用角色" description="账号已激活，但尚未获得有效角色授权。请联系 PMO。" action={<LogoutButton />} /></main>;
}
