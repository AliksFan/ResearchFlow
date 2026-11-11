import type { PmoDashboardQuery, PmoProjectDashboardResult } from "@researchflow/collaboration";
import Link from "next/link";

import { dashboardHref } from "./pmo-project-summary";

const cards = [
  { key: "all", label: "全部", count: "allItems", border: "border-t-teal-700", number: "text-teal-700" },
  { key: "applications", label: "项目申请", count: "applicationItems", border: "border-t-violet-600", number: "text-violet-600" },
  { key: "pmo", label: "待 PMO 处理", count: "pendingPmoProjects", border: "border-t-sky-700", number: "text-sky-700" },
  { key: "dean", label: "待院长决策", count: "pendingDeanProjects", border: "border-t-violet-700", number: "text-violet-700" },
  { key: "implementation", label: "院长已决策待落实", count: "implementationProjects", border: "border-t-amber-700", number: "text-amber-700" },
  { key: "confirmation_closure", label: "待确认与结题", count: "confirmationClosureProjects", border: "border-t-emerald-700", number: "text-emerald-700" },
] as const;

export function PmoDashboardStatCards({
  counts,
  query,
}: {
  counts: PmoProjectDashboardResult["counts"];
  query: PmoDashboardQuery;
}) {
  return <section aria-labelledby="dashboard-stat-title"><h2 id="dashboard-stat-title" className="sr-only">项目组合统计</h2><div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
    {cards.map((card) => {
      const isApplication = card.key === "applications";
      const count = counts[card.count];
      const selected = query.focus === card.key;
      const href = dashboardHref(query, { focus: card.key, applicationView: isApplication ? "in_review" : query.applicationView, page: 1 });
      const accessibleValue = `${count} 项`;
      return <Link key={card.key} href={href} aria-current={selected ? "page" : undefined} aria-label={`${card.label}，${accessibleValue}`} className={`min-h-32 rounded-2xl border border-t-4 p-4 shadow-sm transition hover:border-teal-300 sm:p-5 ${card.border} ${selected ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white"}`}>
        <span className="block text-sm font-semibold leading-6 text-slate-700">{card.label}</span>
        <span className="mt-2 flex items-end gap-1"><strong className={`text-[32px] leading-[38px] ${card.number}`}>{count}</strong><span className="pb-1 text-[13px] text-slate-500">项</span></span>
      </Link>;
    })}
  </div></section>;
}
