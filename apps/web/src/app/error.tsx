"use client";

import { StatePanel } from "@/components/feedback/state-panel";

type ErrorPageProps = {
  reset: () => void;
};

export default function ErrorPage({ reset }: ErrorPageProps) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <StatePanel
        label="页面错误"
        title="暂时无法显示此页面"
        description="错误详情不会暴露在页面中。可以重试；若问题持续，请记录发生时间并联系维护人员。"
        action={
          <button
            type="button"
            onClick={reset}
            className="min-h-11 rounded-lg bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            重新加载
          </button>
        }
      />
    </main>
  );
}
