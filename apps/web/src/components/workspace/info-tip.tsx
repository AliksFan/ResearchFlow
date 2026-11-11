export function InfoTip({ label, children }: { label: string; children: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label}
        className="grid size-5 place-items-center rounded-full border border-slate-300 bg-white text-[11px] font-bold text-slate-600 hover:border-teal-500 hover:text-teal-800"
      >
        i
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-7 z-50 hidden w-64 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-5 text-white shadow-xl group-hover:block group-focus-within:block"
      >
        {children}
      </span>
    </span>
  );
}
