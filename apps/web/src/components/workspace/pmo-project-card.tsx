import type { PmoDashboardItem } from "@researchflow/collaboration";
import Link from "next/link";

import { ActionSummary, ExceptionSummary, OwnerSummary, ProjectIdentity, StageSummary } from "./pmo-project-table";
import { applicationDetailHref, projectDetailHref } from "./pmo-project-summary";

export function PmoProjectCards({ items, generatedAt, returnTo }: { items: PmoDashboardItem[]; generatedAt: string; returnTo: string }) {
  return <div className="grid gap-4 p-4 lg:hidden">{items.map((item) => <article key={item.projectId} className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h3 className="sr-only">{item.projectName}</h3><ProjectIdentity item={item} returnTo={returnTo} /><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="mb-1 text-xs font-semibold text-slate-500">负责人</dt><dd><OwnerSummary item={item} /></dd></div><div><dt className="mb-1 text-xs font-semibold text-slate-500">{item.itemType === "FORMAL_PROJECT" ? "当前主阶段" : "申请状态"}</dt><dd><StageSummary item={item} /></dd></div><div><dt className="mb-1 text-xs font-semibold text-slate-500">异常</dt><dd><ExceptionSummary item={item} /></dd></div><div><dt className="mb-1 text-xs font-semibold text-slate-500">处置</dt><dd><ActionSummary item={item} generatedAt={generatedAt} returnTo={returnTo} limit={2} /></dd></div></dl><Link href={item.itemType === "FORMAL_PROJECT" ? projectDetailHref(item.projectId, returnTo) : applicationDetailHref(item.projectId, returnTo)} className="button-primary mt-5 inline-flex min-h-11 items-center justify-center max-sm:w-full">{item.itemType === "FORMAL_PROJECT" ? "进入项目" : "查看申请"}</Link></article>)}</div>;
}
