export function KeySubIWorkspaceLoading() {
  return (
    <div aria-live="polite" aria-busy="true">
      <header className="border-b border-slate-200 pb-7">
        <h1 className="text-[26px] font-bold leading-[34px] text-slate-950 sm:text-[32px] sm:leading-10">我的项目</h1>
        <div className="mt-3 h-5 w-full max-w-xl animate-pulse rounded bg-slate-200" />
        <div className="mt-6 h-11 w-full max-w-[760px] animate-pulse rounded-lg bg-slate-200" />
      </header>
      <SkeletonSection title="当前正式项目" large />
      <SkeletonSection title="我的未建档申请" />
      <div className="mt-8 h-28 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}

function SkeletonSection({ title, large = false }: { title: string; large?: boolean }) {
  return <section className="mt-8"><h2 className="text-xl font-bold text-slate-950">{title}</h2><div className="mt-4 grid gap-4 min-[1200px]:grid-cols-2">{[0, 1].map((item) => <div key={item} className={`${large ? "h-[360px]" : "h-64"} animate-pulse rounded-2xl border border-slate-200 bg-white`} />)}</div></section>;
}
