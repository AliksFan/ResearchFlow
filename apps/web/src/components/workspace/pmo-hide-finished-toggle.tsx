"use client";

import type { PmoDashboardQuery } from "@researchflow/collaboration";

import { InfoTip } from "./info-tip";

export function PmoHideFinishedToggle({ query }: { query: PmoDashboardQuery }) {
  return <form action="/workspace/projects" className="flex items-center gap-1"><input type="hidden" name="focus" value={query.focus} />{query.focus === "applications" ? <input type="hidden" name="applicationView" value={query.applicationView} /> : null}<input type="hidden" name="sort" value={query.sort} /><input type="hidden" name="order" value={query.order} />{query.q ? <input type="hidden" name="q" value={query.q} /> : null}<label className="inline-flex min-h-11 cursor-pointer items-center gap-2"><input type="checkbox" name="hideFinished" value="1" defaultChecked={query.hideFinished} onChange={(event) => event.currentTarget.form?.requestSubmit()} className="size-4 accent-teal-700" /><span>隐藏已完成</span></label><InfoTip label="隐藏已完成说明">勾选后隐藏已完成、已归档、已拒绝和已撤回记录</InfoTip></form>;
}
