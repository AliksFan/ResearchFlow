import { AuthShell } from "@/components/auth/auth-shell";
import { CredentialForm } from "@/components/auth/credential-form";

export default function ActivatePage() {
  return <AuthShell eyebrow="账号激活" title="设置首次密码" description="激活凭证只能使用一次，有效期为 72 小时。"><CredentialForm purpose="ACTIVATION" /></AuthShell>;
}
