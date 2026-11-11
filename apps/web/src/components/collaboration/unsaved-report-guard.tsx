"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

const CONFIRM_MESSAGE = "当前填报内容尚未提交，离开后将丢失。是否继续？";

export function UnsavedReportGuard({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!enabled || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, enabled]);

  return <div
    className="contents"
    onInputCapture={() => enabled && setDirty(true)}
    onChangeCapture={() => enabled && setDirty(true)}
    onSubmitCapture={() => setDirty(false)}
    onClickCapture={(event) => {
      if (!enabled || !dirty) return;
      const target = event.target;
      const link = target instanceof Element ? target.closest("a[href]") : null;
      if (!link) return;
      if (!window.confirm(CONFIRM_MESSAGE)) event.preventDefault();
      else setDirty(false);
    }}
  >{children}</div>;
}
