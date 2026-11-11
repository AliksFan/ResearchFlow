import type { CollaborationActor, CollaborationRoleCode } from "@researchflow/collaboration";
import { redirect } from "next/navigation";

import { getAuthRuntime } from "./auth-runtime";
import { getRawSessionCarrier } from "./session-carrier";

export async function requireCollaborationActor(): Promise<CollaborationActor> {
  const carrier = await getRawSessionCarrier();
  if (!carrier) redirect("/login");
  const session = await (await getAuthRuntime()).authentication.validateSession(carrier, new Date());
  if (!session.authenticated) redirect("/login");
  if (session.mustChangePassword || !isCollaborationRole(session.activeRoleCode)) {
    redirect("/forbidden");
  }
  return {
    personId: session.personId,
    sessionId: session.sessionId,
    roleCode: session.activeRoleCode,
  };
}

function isCollaborationRole(roleCode: string | null): roleCode is CollaborationRoleCode {
  return roleCode === "PMO" || roleCode === "DEAN" || roleCode === "KEY_SUB_I";
}
