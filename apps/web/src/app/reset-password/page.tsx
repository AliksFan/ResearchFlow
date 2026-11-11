import { AuthShell } from "@/components/auth/auth-shell";
import { CredentialForm } from "@/components/auth/credential-form";

export default function ResetPasswordPage() {
  return <AuthShell eyebrow="密码重置" title="设置新密码" description="重置凭证只能使用一次，有效期为 30 分钟。"><CredentialForm purpose="PASSWORD_RESET" /></AuthShell>;
}
