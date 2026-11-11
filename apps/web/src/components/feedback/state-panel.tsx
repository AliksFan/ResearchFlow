import type { ReactNode } from "react";

type StatePanelProps = {
  label: string;
  title: string;
  description: string;
  action?: ReactNode;
};

export function StatePanel({ label, title, description, action }: StatePanelProps) {
  return (
    <section
      aria-labelledby="state-panel-title"
      className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center shadow-sm sm:px-10"
    >
      <p className="text-xs font-semibold tracking-widest text-slate-500">{label}</p>
      <h2 id="state-panel-title" className="mt-3 text-xl font-semibold text-slate-900">
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-600">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </section>
  );
}
