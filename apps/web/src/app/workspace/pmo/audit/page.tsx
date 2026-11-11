import { requireCollaborationActor } from "@/server/collaboration-session";
import { getNotificationRuntime } from "@/server/notification-runtime";

export default async function AuditPage() {
  const actor = await requireCollaborationActor();
  const items = await getNotificationRuntime().listAuditTrail(actor);
  return <><header className="border-b border-slate-200 pb-6"><p className="text-sm font-semibold text-teal-700">PMO</p><h1 className="mt-1 text-2xl font-semibold">全链路审计查询</h1></header>
    <p className="mt-4 text-sm text-slate-600">仅返回审计白名单摘要，不返回凭证、Cookie、连接串、邮件正文或完整快照。</p>
    <div className="mt-6 grid gap-3">{items.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex flex-wrap justify-between gap-3"><p className="font-semibold">{item.actionCode} · {item.result}</p><time className="text-xs text-slate-500">{formatTime(item.occurredAt)}</time></div><p className="mt-2 text-sm text-slate-700">{item.summary}</p><p className="mt-2 text-xs text-slate-500">操作人：{item.actorDisplayName ?? "系统"} {item.actorRoleCode ? `(${item.actorRoleCode})` : ""} · 项目：{item.projectCode ?? "无"} · 对象：{item.entityType}{item.failureCode ? ` · 失败码：${item.failureCode}` : ""}</p></article>)}{items.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">暂无审计记录。</p> : null}</div>
  </>;
}

function formatTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
