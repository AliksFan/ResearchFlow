import type { AccountStatus } from "./contracts.js";

export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_TEMPORARY_LOCK_MS = 15 * 60 * 1000;
export const ACTIVATION_TOKEN_TTL_MS = 72 * 60 * 60 * 1000;
export const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export const ACCOUNT_TRANSITION_EVENTS = [
  "ACTIVATE",
  "MANUAL_LOCK",
  "UNLOCK",
  "DISABLE",
  "REENABLE",
] as const;

export type AccountTransitionEvent = (typeof ACCOUNT_TRANSITION_EVENTS)[number];

export type AccountTransitionDecision =
  | { allowed: true; status: AccountStatus }
  | { allowed: false; code: "INVALID_ACCOUNT_TRANSITION" };

export function transitionAccountStatus(
  currentStatus: AccountStatus,
  event: AccountTransitionEvent,
  hasPassword: boolean,
): AccountTransitionDecision {
  if (currentStatus === "INVITED" && event === "ACTIVATE") {
    return { allowed: true, status: "ACTIVE" };
  }
  if (currentStatus === "ACTIVE" && event === "MANUAL_LOCK") {
    return { allowed: true, status: "LOCKED" };
  }
  if (currentStatus === "LOCKED" && event === "UNLOCK") {
    return { allowed: true, status: "ACTIVE" };
  }
  if (
    event === "DISABLE" &&
    (currentStatus === "INVITED" ||
      currentStatus === "ACTIVE" ||
      currentStatus === "LOCKED")
  ) {
    return { allowed: true, status: "DISABLED" };
  }
  if (currentStatus === "DISABLED" && event === "REENABLE") {
    return { allowed: true, status: hasPassword ? "ACTIVE" : "INVITED" };
  }

  return { allowed: false, code: "INVALID_ACCOUNT_TRANSITION" };
}
