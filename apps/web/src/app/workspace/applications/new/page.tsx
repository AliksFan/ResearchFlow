import { randomUUID } from "node:crypto";

import { createApplication } from "@/app/workspace/project-application-actions";
import {
  ApplicationShell,
  Feedback,
} from "@/components/project-application/application-shell";
import { requireProjectApplicationActor } from "@/server/project-application-session";

export default async function NewApplicationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireProjectApplicationActor("KEY_SUB_I");
  const query = await searchParams;
  return (
    <ApplicationShell eyebrow="我的项目下钻" title="新建项目申请" actions={<a href="/workspace/projects#applications" className="button-secondary">← 返回我的项目</a>}>
      <Feedback error={query.error} />
      <form
        action={createApplication}
        className="mt-6 max-w-2xl rounded-xl border border-slate-200 bg-white p-6"
      >
        <input type="hidden" name="commandId" value={randomUUID()} />
        <label>
          <span className="field-label">项目名称</span>
          <input
            name="projectName"
            required
            maxLength={200}
            autoFocus
            className="field-control"
          />
        </label>
        <p className="mt-3 text-sm text-slate-600">
          首次保存仅要求项目名称；保存后再填写完整申请。只允许项目级内容。
        </p>
        <button className="button-primary mt-5" type="submit">
          保存草稿
        </button>
      </form>
    </ApplicationShell>
  );
}
