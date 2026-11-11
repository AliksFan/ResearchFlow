import { requireCollaborationActor } from "@/server/collaboration-session";
import { getNotificationRuntime } from "@/server/notification-runtime";

export default async function DeliveryStatusPage() {
  const actor = await requireCollaborationActor();
  const items = await getNotificationRuntime().listDeliveryStatus(actor);
  return <><Header title="提醒邮件投递状态" />
    <p className="mt-4 text-sm text-slate-600">只显示最小投递元数据；不显示邮箱原文、邮件正文、密钥或内部存储信息。</p>
    <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-slate-600"><tr>{["项目", "接收人", "事件", "状态", "尝试", "错误码", "创建时间"].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-4 py-3">{item.projectCode ?? "系统"}</td><td className="px-4 py-3">{item.recipientDisplayName}<span className="ml-2 text-xs text-slate-400">{item.recipientEmailPresent ? "已快照邮箱" : "缺邮箱"}</span></td><td className="px-4 py-3 font-mono text-xs">{item.eventCode}</td><td className="px-4 py-3 font-semibold">{statusLabel(item.status)}</td><td className="px-4 py-3">{item.attemptCount}/{item.maxAttempts}</td><td className="px-4 py-3 font-mono text-xs">{item.lastErrorCode ?? "—"}</td><td className="px-4 py-3">{formatTime(item.createdAt)}</td></tr>)}</tbody></table>{items.length === 0 ? <p className="p-6 text-sm text-slate-500">暂无投递记录。</p> : null}</div>
  </>;
}

function Header({ title }: { title: string }) { return <header className="border-b border-slate-200 pb-6"><p className="text-sm font-semibold text-teal-700">PMO</p><h1 className="mt-1 text-2xl font-semibold">{title}</h1></header>; }
function statusLabel(value: string) { const labels: Record<string, string> = { PENDING: "待投递", PROCESSING: "投递中", SENT: "已发送", SKIPPED_NO_ADDRESS: "缺邮箱已跳过", FAILED_FINAL: "最终失败" }; return labels[value] ?? value; }
function formatTime(value: string) { return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
