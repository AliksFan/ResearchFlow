import { randomUUID } from "node:crypto";

import { notFound } from "next/navigation";

import { ApplicationEditor } from "@/components/project-application/application-editor";
import { ApplicationHeaderActions } from "@/components/project-application/application-header-actions";
import {
  ApplicationShell,
  Feedback,
} from "@/components/project-application/application-shell";
import { getProjectApplicationRuntime } from "@/server/project-application-runtime";
import { requireProjectApplicationActor } from "@/server/project-application-session";

export default async function ApplicationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    error?: string;
    returnTo?: string;
  }>;
}) {
  const actor = await requireProjectApplicationActor("KEY_SUB_I");
  const { projectId } = await params;
  const runtime = getProjectApplicationRuntime();
  const detail = await runtime.queries.getMyApplicationDetail(actor, projectId);
  const options = await runtime.gateway.getFormOptions(actor);
  const query = await searchParams;
  const returnHref = applicationReturnHref(query.returnTo);
  if (!detail) notFound();
  return (
    <ApplicationShell
      eyebrow="项目申请"
      title={detail.projectName}
      actions={<ApplicationHeaderActions detail={detail} commandId={randomUUID()} returnHref={returnHref} />}
    >
      <Feedback error={query.error} />
      <ApplicationEditor
        detail={detail}
        options={options}
        commandIds={{
          save: randomUUID(),
          submitSave: randomUUID(),
          submit: randomUUID(),
        }}
      />
    </ApplicationShell>
  );
}

function applicationReturnHref(value: string | undefined) {
  if (!value) return "/workspace/projects#applications";
  return value.startsWith("/workspace/projects") && !value.startsWith("//") ? value : "/workspace/projects#applications";
}
