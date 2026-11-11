import { redirect } from "next/navigation";

import { PmoManagementPanel } from "@/components/auth/pmo-management-panel";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { getAuthRuntime } from "@/server/auth-runtime";
import { getRawSessionCarrier } from "@/server/session-carrier";

export default async function AccessManagementPage() {
  const carrier = await getRawSessionCarrier();
  if (!carrier) redirect("/login");
  let snapshot;
  try {
    snapshot = await (await getAuthRuntime()).pmoManagement.list(carrier, new Date());
  } catch {
    redirect("/forbidden");
  }
  return <WorkspaceShell requiredRole="PMO"><header className="mb-8 border-b border-slate-200 pb-6"><p className="text-sm font-semibold text-teal-700">管理配置</p><h1 className="mt-1 text-2xl font-semibold">账号与角色</h1><p className="mt-2 text-sm text-slate-600">一次性链接关闭后不可回读；密码不在本页显示。</p></header><PmoManagementPanel snapshot={snapshot} /></WorkspaceShell>;
}
