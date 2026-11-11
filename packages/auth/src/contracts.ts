import { z } from "zod";

export const ROLE_CODES = [
  "DEAN",
  "PMO",
  "KEY_SUB_I",
  "CRC",
  "STATISTICIAN",
  "COLLABORATION_LEAD",
] as const;

export const roleCodeSchema = z.enum(ROLE_CODES);
export type RoleCode = z.infer<typeof roleCodeSchema>;

export const ACCOUNT_STATUSES = [
  "INVITED",
  "ACTIVE",
  "LOCKED",
  "DISABLED",
] as const;

export const accountStatusSchema = z.enum(ACCOUNT_STATUSES);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

export const CREDENTIAL_TOKEN_PURPOSES = [
  "ACTIVATION",
  "PASSWORD_RESET",
] as const;
export const credentialTokenPurposeSchema = z.enum(CREDENTIAL_TOKEN_PURPOSES);
export type CredentialTokenPurpose = z.infer<
  typeof credentialTokenPurposeSchema
>;

export const credentialTokenSchema = z
  .object({
    purpose: credentialTokenPurposeSchema,
    expiresAt: z.date(),
    consumedAt: z.date().nullable(),
    revokedAt: z.date().nullable(),
  })
  .strict();
export type CredentialToken = z.infer<typeof credentialTokenSchema>;

const normalizedLoginNameSchema = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9](?:[a-z0-9]|[._-](?![._-])){1,48}[a-z0-9]$/);

export const loginNameInputSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(normalizedLoginNameSchema);

export const passwordInputSchema = z.string().refine(
  (value) => {
    const length = Array.from(value).length;
    return length >= 12 && length <= 128;
  },
  { message: "INVALID_PASSWORD_LENGTH" },
);

export const SESSION_FAILURE_CODES = [
  "SESSION_REVOKED",
  "ACCOUNT_NOT_ACTIVE",
  "SESSION_EXPIRED",
  "SESSION_IDLE_TIMEOUT",
] as const;

export const sessionFailureCodeSchema = z.enum(SESSION_FAILURE_CODES);
export type SessionFailureCode = z.infer<typeof sessionFailureCodeSchema>;

export const sessionRecordSchema = z
  .object({
    accountStatus: accountStatusSchema,
    lockedUntil: z.date().nullable(),
    expiresAt: z.date(),
    lastSeenAt: z.date(),
    revokedAt: z.date().nullable(),
    activeRoleCode: roleCodeSchema.nullable(),
  })
  .strict();
export type SessionRecord = z.infer<typeof sessionRecordSchema>;

export const roleContextSchema = z
  .object({
    activeRoleCode: roleCodeSchema.nullable(),
    availableRoleCodes: z.array(roleCodeSchema),
  })
  .strict()
  .superRefine(({ activeRoleCode, availableRoleCodes }, context) => {
    if (
      activeRoleCode !== null &&
      !availableRoleCodes.includes(activeRoleCode)
    ) {
      context.addIssue({
        code: "custom",
        message: "ACTIVE_ROLE_NOT_AVAILABLE",
        path: ["activeRoleCode"],
      });
    }
  });
export type RoleContext = z.infer<typeof roleContextSchema>;

export const ROLE_ACTIONS = [
  "VIEW_PROJECT",
  "CREATE_PROJECT_APPLICATION",
  "ESTABLISH_PROJECT",
  "MANAGE_ACCESS",
  "SUBMIT_PROJECT_UPDATE",
  "REQUEST_WORKFLOW_COMPLETION",
  "REVIEW_WORKFLOW_COMPLETION",
  "CREATE_ISSUE",
  "PMO_ISSUE_HANDLING",
  "DEAN_ISSUE_DECISION",
  "REPORTER_CONFIRMATION",
  "REQUEST_PLAN_OR_FIELD_CHANGE",
  "REVIEW_PLAN_CHANGE",
  "REVIEW_PROJECT_FIELD_CHANGE",
  "REQUEST_PROJECT_COMPLETION",
  "REVIEW_PROJECT_COMPLETION",
  "EXPORT_PROJECT_DATA",
  "VIEW_AUDIT_CENTER",
] as const;

export const roleActionSchema = z.enum(ROLE_ACTIONS);
export type RoleAction = z.infer<typeof roleActionSchema>;

export const ROLE_ACTION_DECISIONS = ["ALLOW", "CONDITIONAL", "DENY"] as const;
export const roleActionDecisionSchema = z.enum(ROLE_ACTION_DECISIONS);
export type RoleActionDecision = z.infer<typeof roleActionDecisionSchema>;

export const AUTHORIZATION_DENIAL_CODES = [
  "UNAUTHENTICATED",
  "ACCOUNT_NOT_ACTIVE",
  "SESSION_INVALID",
  "ROLE_NOT_ACTIVE",
  "ACTION_FORBIDDEN",
  "PROJECT_OUT_OF_SCOPE",
  "FIELD_OR_STATE_FORBIDDEN",
] as const;
export const authorizationDenialCodeSchema = z.enum(
  AUTHORIZATION_DENIAL_CODES,
);
export type AuthorizationDenialCode = z.infer<
  typeof authorizationDenialCodeSchema
>;

export const authorizationResultSchema = z.discriminatedUnion("allowed", [
  z.object({ allowed: z.literal(true) }).strict(),
  z
    .object({
      allowed: z.literal(false),
      code: authorizationDenialCodeSchema,
    })
    .strict(),
]);
export type AuthorizationResult = z.infer<typeof authorizationResultSchema>;

export const AUTHENTICATION_PUBLIC_FAILURE_CODE = "AUTHENTICATION_FAILED";
