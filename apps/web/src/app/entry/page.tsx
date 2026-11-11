import { redirect } from "next/navigation";

import { isWorkspaceRole } from "@/components/workspace/workspace-navigation";
import { getAuthRuntime } from "@/server/auth-runtime";
import { getRawSessionCarrier } from "@/server/session-carrier";

export default async function EntryPage() {
  const carrier = await getRawSessionCarrier();
  if (!carrier) redirect("/login");
  const session = await (await getAuthRuntime()).authentication.validateSession(carrier, new Date());
  if (!session.authenticated) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");
  if (session.activeRoleCode && session.availableRoleCodes.includes(session.activeRoleCode)) {
    redirect(isWorkspaceRole(session.activeRoleCode) ? "/workspace" : "/no-access");
  }
  if (session.availableRoleCodes.length === 0) redirect("/no-access");
  redirect("/select-role");
}
