import Link from "next/link";
import { StatePanel } from "@/components/feedback/state-panel";

export default function NotFound() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <StatePanel
        label="404"
        title="页面不存在"
        description="请检查访问地址，或返回应用入口。"
        action={
          <Link
            href="/"
            className="inline-flex min-h-11 items-center rounded-lg bg-teal-700 px-5 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            返回入口
          </Link>
        }
      />
    </main>
  );
}
