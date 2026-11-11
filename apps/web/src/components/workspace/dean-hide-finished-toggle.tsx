"use client";

import type { DeanDashboardQuery } from "@researchflow/collaboration";
import { InfoTip } from "./info-tip";

export function DeanHideFinishedToggle({ query }: { query: DeanDashboardQuery }) { return <form action="/workspace/projects" className="flex items-center gap-1"><input type="hidden" name="focus" value={query.focus} /><input type="hidden" name="sort" value={query.sort} /><input type="hidden" name="order" value={query.order} />{query.q ? <input type="hidden" name="q" value={query.q} /> : null}<label className="inline-flex min-h-11 cursor-pointer items-center gap-2"><input type="checkbox" name="hideFinished" value="1" defaultChecked={query.hideFinished} onChange={(event) => event.currentTarget.form?.requestSubmit()} className="size-4 accent-teal-700" /><span>隐藏已完成</span></label><InfoTip label="隐藏已完成说明">勾选后隐藏已完成和已归档项目</InfoTip></form>; }
