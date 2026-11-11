import type { NotificationCenterState } from "@researchflow/collaboration";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { WorkspaceFrame } from "@/components/workspace/workspace-frame";
import {
  isWorkspaceRole,
  workspaceNavigation,
  type WorkspaceRole,
} from "@/components/workspace/workspace-navigation";
import { getAuthRuntime } from "@/server/auth-runtime";
import { getNotificationRuntime } from "@/server/notification-runtime";
import { getRawSessionCarrier } from "@/server/session-carrier";

export async function requireWorkspaceSession(requiredRole?: WorkspaceRole) {
  const carrier = await getRawSessionCarrier();
  if (!carrier) redirect("/login");
  const session = await (await getAuthRuntime()).authentication.validateSession(carrier, new Date());
  if (!session.authenticated) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");
  if (!session.activeRoleCode) redirect("/entry");
  if (!session.availableRoleCodes.includes(session.activeRoleCode)) redirect("/no-access");
  if (!isWorkspaceRole(session.activeRoleCode)) redirect("/no-access");
  if (requiredRole && session.activeRoleCode !== requiredRole) redirect("/forbidden");
  return { ...session, activeRoleCode: session.activeRoleCode };
}

export async function WorkspaceShell({ children, requiredRole }: { children: ReactNode; requiredRole?: WorkspaceRole }) {
  const session = await requireWorkspaceSession(requiredRole);
  const actor = { personId: session.personId, sessionId: session.sessionId, roleCode: session.activeRoleCode };
  let notificationState: NotificationCenterState = { items: [], counts: { unread: 0, pendingAction: 0, informational: 0 } };
  try {
    notificationState = await getNotificationRuntime().list(actor);
  } catch (error) {
    if (!error || typeof error !== "object" || !("code" in error) || error.code !== "COLLABORATION_FORBIDDEN") {
      throw error;
    }
  }
  return <WorkspaceFrame role={session.activeRoleCode} availableRoles={session.availableRoleCodes} navigation={workspaceNavigation(session.activeRoleCode)} notificationState={notificationState}>{children}</WorkspaceFrame>;
}
