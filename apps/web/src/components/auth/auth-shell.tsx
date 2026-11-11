import type { ReactNode } from "react";

export function AuthShell({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-5 py-10"><section className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><p className="text-sm font-semibold text-teal-700">{eyebrow}</p><h1 className="mt-2 text-2xl font-semibold">{title}</h1><p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>{children}</section></main>;
}
