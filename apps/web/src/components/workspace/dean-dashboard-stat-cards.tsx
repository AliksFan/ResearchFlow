import type { DeanDashboardQuery, DeanProjectDashboardResult } from "@researchflow/collaboration";
import Link from "next/link";
import { deanDashboardHref } from "./dean-project-summary";

const cards = [
  { key: "all", label: "全部项目", count: "allProjects", border: "border-t-teal-700", number: "text-teal-700" },
  { key: "decision", label: "待我决策", count: "decisionProjects", border: "border-t-violet-700", number: "text-violet-700" },
  { key: "implementation", label: "PMO 落实中", count: "implementationProjects", border: "border-t-sky-700", number: "text-sky-700" },
  { key: "confirmation", label: "待我确认落实", count: "confirmationProjects", border: "border-t-violet-600", number: "text-violet-600" },
  { key: "reporter_feedback", label: "待负责人反馈", count: "reporterFeedbackProjects", border: "border-t-emerald-700", number: "text-emerald-700" },
] as const;

export function DeanDashboardStatCards({ counts, query }: { counts: DeanProjectDashboardResult["counts"]; query: DeanDashboardQuery }) {
  return <section aria-labelledby="dean-stat-title"><h2 id="dean-stat-title" className="sr-only">院长项目组合统计</h2><div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">{cards.map((card) => { const count = counts[card.count]; const selected = query.focus === card.key; return <Link key={card.key} href={deanDashboardHref(query, { focus: card.key, page: 1 })} aria-current={selected ? "page" : undefined} aria-label={`${card.label}，${count} 项`} className={`min-h-32 rounded-2xl border border-t-4 p-4 shadow-sm transition hover:border-teal-300 sm:p-5 ${card.border} ${selected ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white"}`}><span className="block text-sm font-semibold leading-6 text-slate-700">{card.label}</span><span className="mt-2 flex items-end gap-1"><strong className={`text-[32px] leading-[38px] ${card.number}`}>{count}</strong><span className="pb-1 text-[13px] text-slate-500">项</span></span></Link>; })}</div></section>;
}
