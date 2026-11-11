import type { ReactNode } from "react";

export function ExecutionShell({
  eyebrow,
  title,
  status,
  actions,
  children,
  backHref = "/workspace/projects",
}: {
  eyebrow: string;
  title: string;
  status?: string;
  actions?: ReactNode;
  children: ReactNode;
  backHref?: string | null;
}) {
  return (
    <>
      {backHref ? <a href={backHref} className="mb-4 inline-flex text-sm font-semibold text-teal-700">← 返回项目列表</a> : null}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm font-semibold text-teal-700">{eyebrow}</p>
          <div className="mt-1 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-semibold text-slate-950">{title}</h1>{status ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{status}</span> : null}</div>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>
      {children}
    </>
  );
}
