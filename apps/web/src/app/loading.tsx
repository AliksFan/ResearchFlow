import { StatePanel } from "@/components/feedback/state-panel";

export default function Loading() {
  return (
    <main aria-live="polite" className="mx-auto min-h-screen w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <StatePanel label="加载中" title="正在准备页面" description="请稍候，不要重复提交操作。" />
    </main>
  );
}
