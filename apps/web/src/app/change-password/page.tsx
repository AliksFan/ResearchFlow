import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { getAuthRuntime } from "@/server/auth-runtime";
import { getRawSessionCarrier } from "@/server/session-carrier";

export default async function ChangePasswordPage() {
  const carrier = await getRawSessionCarrier();
  if (!carrier) redirect("/login");
  const session = await (await getAuthRuntime()).authentication.validateSession(carrier, new Date());
  if (!session.authenticated) redirect("/login");
  return <AuthShell eyebrow="账号安全" title="修改密码" description="密码长度 12–128 个字符，不得使用当前或最近 5 个密码。"><ChangePasswordForm /></AuthShell>;
}
