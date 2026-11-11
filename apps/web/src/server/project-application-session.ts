import type { ProjectApplicationActor } from "@researchflow/project-application";
import { redirect } from "next/navigation";

import { getAuthRuntime } from "./auth-runtime";
import { getRawSessionCarrier } from "./session-carrier";

export async function requireProjectApplicationActor(
  roleCode: "KEY_SUB_I" | "PMO",
): Promise<ProjectApplicationActor> {
  const carrier = await getRawSessionCarrier();
  if (!carrier) redirect("/login");
  const session = await (await getAuthRuntime()).authentication.validateSession(carrier, new Date());
  if (!session.authenticated) redirect("/login");
  if (session.mustChangePassword || session.activeRoleCode !== roleCode) redirect("/forbidden");
  return { personId: session.personId, sessionId: session.sessionId, roleCode };
}
