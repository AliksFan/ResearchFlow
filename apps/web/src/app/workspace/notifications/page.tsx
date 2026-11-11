import { markAllNotificationsRead, markNotificationRead, openNotification } from "./actions";
import {
  filterNotifications,
  formatNotificationTime,
  notificationKindLabel,
  notificationWorkflowLabel,
  type NotificationView,
} from "./presentation";

import { InfoTip } from "@/components/workspace/info-tip";
import { requireCollaborationActor } from "@/server/collaboration-session";
import { getNotificationRuntime } from "@/server/notification-runtime";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const actor = await requireCollaborationActor();
  const state = await getNotificationRuntime().list(actor);
  const view = notificationView((await searchParams).view);
  const items = filterNotifications(state.items, view);
  return <>
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6"><div><p className="text-sm font-semibold text-teal-700">当前角色：{actor.roleCode}</p><h1 className="mt-1 text-2xl font-semibold">消息中心</h1><p className="mt-2 flex items-center gap-2 text-sm text-slate-600">阅读状态与待办完成状态相互独立；消息不作为项目授权来源。<InfoTip label="了解消息状态规则">已读只表示当前角色查看过消息，不代表关联审核、补充、决策或确认事项已处理。</InfoTip></p></div>{state.counts.unread > 0 ? <form action={markAllNotificationsRead}><button className="button-secondary">全部标为已读</button></form> : null}</header>
    <section className="mt-6 grid gap-3 sm:grid-cols-3">
      <Count label="未读" value={state.counts.unread} />
      <Count label="待处理" value={state.counts.pendingAction} />
      <Count label="信息" value={state.counts.informational} />
    </section>
    <nav className="mt-6 flex gap-1 border-b border-slate-200" aria-label="消息筛选"><ViewLink view="unread" current={view}>未读 {state.counts.unread}</ViewLink><ViewLink view="pending" current={view}>待处理 {state.counts.pendingAction}</ViewLink><ViewLink view="all" current={view}>全部 {state.items.length}</ViewLink></nav>
    <section className="mt-4 grid gap-3">
      {items.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{view === "unread" ? "当前没有未读消息。" : view === "pending" ? "当前没有待处理消息。" : "暂无消息。"}</p> : items.map((item) => <form key={item.id} action={item.navigation ? openNotification : markNotificationRead}>
        <input type="hidden" name="notificationId" value={item.id} />
        <button className={`w-full rounded-xl border px-4 py-3 text-left hover:border-teal-400 hover:bg-teal-50/60 ${item.readStatus === "UNREAD" ? "border-teal-300 bg-teal-50" : "border-slate-200 bg-white"}`}>
          <span className="flex flex-wrap items-start justify-between gap-2"><strong className="text-sm text-slate-900">{item.title}</strong><span className="text-xs text-slate-500">{notificationKindLabel(item)} · {formatNotificationTime(item.createdAt)}</span></span>
          <span className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm leading-5 text-slate-600">{item.content}</span>
          <span className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500"><span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700">工作流：{notificationWorkflowLabel(item)}</span><span>项目：{item.projectCode ?? "系统"}</span>{item.actionCompletionReason ? <span>完成说明：{item.actionCompletionReason}</span> : null}</span>
        </button>
      </form>)}
    </section>
  </>;
}

function ViewLink({ view, current, children }: { view: NotificationView; current: NotificationView; children: React.ReactNode }) { return <a href={`?view=${view}`} aria-current={view === current ? "page" : undefined} className={`border-b-2 px-4 py-3 text-sm font-semibold ${view === current ? "border-teal-700 text-teal-700" : "border-transparent text-slate-500"}`}>{children}</a>; }
function notificationView(value?: string): NotificationView { return value === "pending" || value === "all" ? value : "unread"; }
function Count({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>; }
