import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { RoleSelectionForm } from "@/components/auth/role-selection-form";
import { getAuthRuntime } from "@/server/auth-runtime";
import { getRawSessionCarrier } from "@/server/session-carrier";

export default async function SelectRolePage() {
  const carrier = await getRawSessionCarrier();
  if (!carrier) redirect("/login");
  const session = await (await getAuthRuntime()).authentication.validateSession(carrier, new Date());
  if (!session.authenticated) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");
  if (session.availableRoleCodes.length === 0) redirect("/no-access");
  return <AuthShell eyebrow="角色上下文" title="选择本次使用的角色" description="角色只缩小当前会话的权限，可随时切换。"><RoleSelectionForm roles={session.availableRoleCodes} /></AuthShell>;
}
