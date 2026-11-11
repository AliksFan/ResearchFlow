"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ProjectApplicationDetail } from "@researchflow/project-application";

import { withdrawApplication } from "@/app/workspace/project-application-actions";

export function ApplicationHeaderActions({ detail, commandId, returnHref }: { detail: ProjectApplicationDetail; commandId: string; returnHref: string }) {
  const [dialog, setDialog] = useState<"history" | "withdraw" | null>(null);
  const activeTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!dialog) return;
    const trigger = activeTrigger.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setDialog(null); };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); trigger?.focus(); };
  }, [dialog]);
  return <>
    <button type="button" className="button-secondary" onClick={(event) => { activeTrigger.current = event.currentTarget; setDialog("history"); }}>处理历史</button>
    {detail.canWithdraw ? <button type="button" className="button-secondary text-red-700" onClick={(event) => { activeTrigger.current = event.currentTarget; setDialog("withdraw"); }}>撤回申请</button> : null}
    <a href={returnHref}>← 返回我的项目</a>
    {dialog && typeof document !== "undefined" ? createPortal(
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.currentTarget === event.target) setDialog(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="application-action-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
          <header className="flex items-start justify-between gap-4"><h2 id="application-action-title" className="text-lg font-semibold">{dialog === "history" ? "处理历史" : "撤回申请"}</h2><button type="button" className="button-secondary" onClick={() => setDialog(null)}>关闭</button></header>
          {dialog === "history" ? <ol className="mt-5 space-y-3">{detail.activities.length ? detail.activities.map((activity, index) => <li key={`${activity.createdAt}-${index}`} className="border-l-2 border-slate-200 pl-4 text-sm"><p className="font-medium">{activity.activityType} · {activity.actorDisplayName}</p><p className="text-slate-500">{new Date(activity.createdAt).toLocaleString("zh-CN")}</p>{activity.content ? <p className="mt-1 text-slate-700">{activity.content}</p> : null}</li>) : <li className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">暂无处理历史。</li>}</ol> :
            <form action={withdrawApplication} className="mt-5 space-y-4">
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">撤回后申请不可恢复，项目名称占用将释放；处理历史和审计记录继续保留。</p>
              <input type="hidden" name="projectId" value={detail.projectId} /><input type="hidden" name="applicationVersionId" value={detail.applicationVersionId} /><input type="hidden" name="expectedRowVersion" value={detail.rowVersion} /><input type="hidden" name="reviewId" value={detail.reviewId ?? ""} /><input type="hidden" name="commandId" value={commandId} />
              <label><span className="field-label">撤回原因（{detail.status === "DRAFT" ? "选填" : "必填"}）</span><textarea name="comment" rows={4} required={detail.status !== "DRAFT"} className="field-control" /></label>
              <div className="flex justify-end gap-3"><button type="button" className="button-secondary" onClick={() => setDialog(null)}>取消</button><button type="submit" className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white">确认撤回</button></div>
            </form>}
        </section>
      </div>, document.body) : null}
  </>;
}
