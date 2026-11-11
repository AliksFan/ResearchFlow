import type { AccountStatus, RoleCode, SessionFailureCode } from "./contracts.js";

export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
export const MAX_ACTIVE_SESSIONS = 5;

export function getReenabledAccountStatus(hasPassword: boolean): AccountStatus {
  return hasPassword ? "ACTIVE" : "INVITED";
}

export type InitialRoleSelection =
  | { kind: "NO_ROLE" }
  | { kind: "SELECTED"; roleCode: RoleCode }
  | { kind: "SELECTION_REQUIRED"; roleCodes: RoleCode[] };

export function selectInitialRole(roleCodes: readonly RoleCode[]): InitialRoleSelection {
  const distinctRoleCodes = [...new Set(roleCodes)];
  if (distinctRoleCodes.length === 0) {
    return { kind: "NO_ROLE" };
  }
  if (distinctRoleCodes.length === 1) {
    return { kind: "SELECTED", roleCode: distinctRoleCodes[0] };
  }

  return { kind: "SELECTION_REQUIRED", roleCodes: distinctRoleCodes };
}

export interface SessionPolicyInput {
  accountStatus: AccountStatus;
  lockedUntil: Date | null;
  expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

export type SessionPolicyDecision =
  | { valid: true }
  | { valid: false; code: SessionFailureCode };

export function evaluateSession(
  session: SessionPolicyInput,
  now: Date,
): SessionPolicyDecision {
  if (session.revokedAt !== null) {
    return { valid: false, code: "SESSION_REVOKED" };
  }
  if (
    session.accountStatus !== "ACTIVE" ||
    (session.lockedUntil !== null && session.lockedUntil.getTime() > now.getTime())
  ) {
    return { valid: false, code: "ACCOUNT_NOT_ACTIVE" };
  }
  if (session.expiresAt.getTime() <= now.getTime()) {
    return { valid: false, code: "SESSION_EXPIRED" };
  }
  if (now.getTime() - session.lastSeenAt.getTime() >= SESSION_IDLE_TIMEOUT_MS) {
    return { valid: false, code: "SESSION_IDLE_TIMEOUT" };
  }

  return { valid: true };
}
