import Link from "next/link";
import { StatePanel } from "@/components/feedback/state-panel";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <StatePanel
        label="无权限"
        title="无法访问当前内容"
        description="此页面只是状态骨架；真实角色和项目范围校验将在认证授权任务中由服务端实现。"
        action={
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            返回入口
          </Link>
        }
      />
    </main>
  );
}
