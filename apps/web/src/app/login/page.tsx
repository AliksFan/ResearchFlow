import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return <AuthShell eyebrow="ResearchFlow" title="登录" description="使用 PMO 分配的登录名和密码。"><LoginForm /></AuthShell>;
}
