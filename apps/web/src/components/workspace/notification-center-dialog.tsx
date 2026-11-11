"use client";

import type { NotificationCenterState, NotificationListItem } from "@researchflow/collaboration";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  markAllNotificationsRead,
  markNotificationRead,
  openNotification,
} from "@/app/workspace/notifications/actions";
import {
  filterNotifications,
  formatNotificationTime,
  notificationKindLabel,
  notificationWorkflowLabel,
  type NotificationView,
} from "@/app/workspace/notifications/presentation";

export function NotificationCenterDialog({
  state,
}: {
  state: NotificationCenterState;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<NotificationView>("unread");
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const triggerButton = triggerButtonRef.current;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
      triggerButton?.focus();
    };
  }, [open]);

  return <>
    <button
      type="button"
      ref={triggerButtonRef}
      aria-label={`消息中心，${state.counts.unread} 条未读`}
      aria-expanded={open}
      aria-controls="notification-center-dialog"
      onClick={() => setOpen(true)}
      className="relative grid size-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:border-teal-400 hover:text-teal-800"
    >
      <BellIcon />
      {state.counts.unread > 0 ? <span aria-hidden="true" className="absolute -right-1 -top-1 min-w-5 rounded-full bg-rose-600 px-1 text-center text-[10px] font-bold leading-5 text-white">{state.counts.unread > 99 ? "99+" : state.counts.unread}</span> : null}
    </button>

    {open ? createPortal(<div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-0 sm:p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) setOpen(false);
      }}
    >
      <section
        id="notification-center-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-center-title"
        className="flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[82vh] sm:max-w-4xl sm:rounded-2xl"
      >
        <header className="shrink-0 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h2 id="notification-center-title" className="text-lg font-semibold text-slate-950">消息中心</h2>
              <p className="mt-0.5 text-xs text-slate-500">已读状态与待办完成状态相互独立</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {state.counts.unread > 0 ? <form action={markAllNotificationsRead}>
                <button className="rounded-lg px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50">全部标为已读</button>
              </form> : null}
              <button ref={closeButtonRef} type="button" aria-label="关闭消息中心" onClick={() => setOpen(false)} className="grid size-9 place-items-center rounded-lg text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-800">×</button>
            </div>
          </div>

          <nav className="mt-3 flex gap-1" aria-label="消息筛选">
            <FilterButton active={view === "unread"} onClick={() => setView("unread")}>未读 {state.counts.unread}</FilterButton>
            <FilterButton active={view === "pending"} onClick={() => setView("pending")}>待处理 {state.counts.pendingAction}</FilterButton>
            <FilterButton active={view === "all"} onClick={() => setView("all")}>全部 {state.items.length}</FilterButton>
          </nav>
        </header>

        <NotificationRows state={state} view={view} />
      </section>
    </div>, document.body) : null}
  </>;
}

function NotificationRows({ state, view }: { state: NotificationCenterState; view: NotificationView }) {
  const items = filterNotifications(state.items, view);
  if (items.length === 0) {
    return <p className="m-4 rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center text-sm text-slate-500">
      {view === "unread" ? "当前没有未读消息。" : view === "pending" ? "当前没有待处理消息。" : "暂无消息。"}
    </p>;
  }

  return <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
    <div className="grid gap-2">
      {items.map((item) => <NotificationRow key={item.id} item={item} />)}
    </div>
  </div>;
}

function NotificationRow({ item }: { item: NotificationListItem }) {
  const action = item.navigation ? openNotification : markNotificationRead;
  return <form action={action}>
    <input type="hidden" name="notificationId" value={item.id} />
    <button
      type="submit"
      aria-label={`${item.title}，${item.navigation ? "打开关联内容" : "标记已读"}`}
      className={`group w-full rounded-xl border px-4 py-3 text-left transition hover:border-teal-400 hover:bg-teal-50/60 hover:shadow-sm ${item.readStatus === "UNREAD" ? "border-teal-200 bg-teal-50/70" : "border-slate-200 bg-white"}`}
    >
      <span className="flex items-start gap-3">
        <span aria-hidden="true" className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readStatus === "UNREAD" ? "bg-teal-600" : "bg-slate-300"}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <strong className="min-w-0 text-sm font-semibold text-slate-900 group-hover:text-teal-900">{item.title}</strong>
            <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
              <StatusBadge item={item} />
              <time dateTime={item.createdAt}>{formatNotificationTime(item.createdAt)}</time>
            </span>
          </span>
          <span className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm leading-5 text-slate-600">{item.content}</span>
          <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
            <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">工作流：{notificationWorkflowLabel(item)}</span>
            <span>项目：{item.projectCode ?? "系统"}</span>
            {item.actionCompletionReason ? <span>完成说明：{item.actionCompletionReason}</span> : null}
          </span>
        </span>
      </span>
    </button>
  </form>;
}

function StatusBadge({ item }: { item: NotificationListItem }) {
  const pending = item.messageKind === "ACTION" && item.actionStatus === "PENDING";
  return <span className={`rounded-full px-2 py-0.5 font-semibold ${pending ? "bg-amber-100 text-amber-800" : item.readStatus === "UNREAD" ? "bg-teal-100 text-teal-800" : "bg-slate-100 text-slate-600"}`}>
    {item.readStatus === "UNREAD" ? "未读" : "已读"} · {notificationKindLabel(item)}
  </span>;
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${active ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>{children}</button>;
}

function BellIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z" /><path d="M10 21h4" /></svg>;
}
