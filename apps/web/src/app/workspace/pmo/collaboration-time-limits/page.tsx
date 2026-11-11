import { redirect } from "next/navigation";

import { saveGlobalCollaborationTimeLimits } from "@/app/workspace/collaboration-actions";
import { ExecutionShell } from "@/components/collaboration/execution-shell";
import {
  GlobalCollaborationTimeLimitEditor,
} from "@/components/collaboration/time-limit-settings";
import { getCollaborationRuntime } from "@/server/collaboration-runtime";
import { requireCollaborationActor } from "@/server/collaboration-session";

export default async function GlobalCollaborationTimeLimitsPage({
}: Record<string, never>) {
  const actor = await requireCollaborationActor();
  if (actor.roleCode !== "PMO") redirect("/forbidden");
  const settings = await getCollaborationRuntime().listGlobalTimeLimits(actor);
  return (
    <ExecutionShell eyebrow="PMO 工作区" title="全局协作时限" backHref={null}>
      <p className="mt-6 text-sm text-slate-600">
        采用自然日。项目未配置覆盖值时使用这里的全局默认；修改只影响之后进入责任状态的业务轮次。
      </p>
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <GlobalCollaborationTimeLimitEditor settings={settings} saveAction={saveGlobalCollaborationTimeLimits} />
      </section>
    </ExecutionShell>
  );
}
