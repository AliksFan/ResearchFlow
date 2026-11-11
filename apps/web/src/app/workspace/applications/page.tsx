import Link from "next/link";

import { ApplicationList } from "@/components/project-application/application-list";
import { ApplicationShell } from "@/components/project-application/application-shell";
import type { ApplicationView } from "@/components/workspace/workspace-list-view";
import { getProjectApplicationRuntime } from "@/server/project-application-runtime";
import { requireProjectApplicationActor } from "@/server/project-application-session";

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string }> }) {
  const actor = await requireProjectApplicationActor("KEY_SUB_I");
  const [applications, query] = await Promise.all([getProjectApplicationRuntime().queries.listMyProjectWorkspace(actor), searchParams]);
  const view = isApplicationView(query.view) ? query.view : "all";
  return <ApplicationShell eyebrow="我的项目下钻" title="申请历史" actions={<><Link href="/workspace/projects#applications" className="button-secondary">← 返回我的项目</Link><Link href="/workspace/applications/new" className="button-primary">＋ 项目申请</Link></>}><ApplicationList applications={applications} view={view} search={query.q?.trim() ?? ""} /></ApplicationShell>;
}

function isApplicationView(value: string | undefined): value is ApplicationView {
  return value === "all" || value === "editing" || value === "in_review" || value === "finished";
}
