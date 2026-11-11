import { redirect } from "next/navigation";

import { defaultWorkspaceHref } from "@/components/workspace/workspace-navigation";
import { requireWorkspaceSession } from "@/components/workspace/workspace-shell";

export default async function WorkspacePage() {
  const session = await requireWorkspaceSession();
  redirect(defaultWorkspaceHref(session.activeRoleCode));
}
