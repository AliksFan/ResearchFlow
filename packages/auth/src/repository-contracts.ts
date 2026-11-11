import type {
  AccountStatus,
  CredentialTokenPurpose,
  RoleCode,
} from "./contracts.js";

export type AuditResult = "SUCCESS" | "FAILURE";
export type RateLimitDimension = "LOGIN_NAME" | "SOURCE_IP";
export type AssignmentStatus = "PROPOSED" | "ACTIVE" | "ENDED";
export type GrantSource = "SYSTEM_BOOTSTRAP" | "PMO_ACTION";

export class AuthRepositoryError extends Error {
  constructor(readonly code: "LOGIN_NAME_DUPLICATE") {
    super(code);
    this.name = "AuthRepositoryError";
  }
}

export interface PersonAuthRecord {
  id: string;
  loginName: string;
  displayName: string;
  passwordHash: string | null;
  accountStatus: AccountStatus;
  mustChangePassword: boolean;
  failedLoginCount: number;
  failedLoginWindowStartedAt: Date | null;
  lockedUntil: Date | null;
  passwordChangedAt: Date | null;
}

export interface ManagedPersonRecord {
  id: string;
  loginName: string;
  displayName: string;
  accountStatus: AccountStatus;
  mustChangePassword: boolean;
  passwordSet: boolean;
}

export interface CredentialTokenRecord {
  id: string;
  personId: string;
  purpose: CredentialTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
}

export interface SessionAuthRecord {
  id: string;
  personId: string;
  tokenHash: string;
  activeRoleCode: RoleCode | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  lastSeenAt: Date;
}

export interface RoleAssignmentRecord {
  id: string;
  personId: string;
  roleCode: RoleCode;
  projectId: string | null;
  assignmentStatus: AssignmentStatus;
  isPrimary: boolean;
}

export interface RoleEligibilityRecord {
  id: string;
  personId: string;
  roleCode: "KEY_SUB_I";
  status: "ACTIVE" | "ENDED";
  reason: string;
}

export interface RateLimitRecord {
  id: string;
  dimension: RateLimitDimension;
  keyHash: string;
  failureCount: number;
  windowStartedAt: Date | null;
  lockedUntil: Date | null;
}

export interface AuditEventInput {
  actorPersonId: string | null;
  actorIdentifierMasked?: string | null;
  actorRoleCode?: RoleCode | null;
  sessionId?: string | null;
  actionCode: string;
  result: AuditResult;
  entityType: string;
  entityId?: string | null;
  summary: string;
  changedFields?: string[];
  failureCode?: string | null;
  correlationId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface PersonRepository {
  findByLoginName(loginName: string): Promise<PersonAuthRecord | null>;
  findById(personId: string): Promise<PersonAuthRecord | null>;
  findByIdForUpdate(personId: string): Promise<PersonAuthRecord | null>;
  listForManagement(): Promise<ManagedPersonRecord[]>;
  create(input: {
    loginName: string;
    displayName: string;
    passwordHash: string | null;
    accountStatus: AccountStatus;
    mustChangePassword: boolean;
  }): Promise<PersonAuthRecord>;
  updateStatus(personId: string, status: AccountStatus): Promise<void>;
  updatePassword(input: {
    personId: string;
    passwordHash: string;
    mustChangePassword: boolean;
    passwordChangedAt: Date;
  }): Promise<void>;
  updateLoginProtection(input: {
    personId: string;
    failedLoginCount: number;
    failedLoginWindowStartedAt: Date | null;
    lockedUntil: Date | null;
  }): Promise<void>;
  recordLoginSuccess(personId: string, now: Date): Promise<void>;
}

export interface CredentialTokenRepository {
  revokeOpen(
    personId: string,
    purpose: CredentialTokenPurpose,
    revokedAt: Date,
  ): Promise<void>;
  create(input: {
    personId: string;
    purpose: CredentialTokenPurpose;
    tokenHash: string;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<CredentialTokenRecord>;
  findByHashForUpdate(tokenHash: string): Promise<CredentialTokenRecord | null>;
  markConsumed(tokenId: string, consumedAt: Date): Promise<void>;
}

export interface PasswordHistoryRepository {
  listRecentHashes(personId: string, limit: number): Promise<string[]>;
  add(personId: string, passwordHash: string, createdAt: Date): Promise<void>;
  keepMostRecent(personId: string, limit: number): Promise<void>;
}

export interface RateLimitRepository {
  findForUpdate(
    dimension: RateLimitDimension,
    keyHash: string,
  ): Promise<RateLimitRecord | null>;
  registerFailure(input: {
    dimension: RateLimitDimension;
    keyHash: string;
    now: Date;
    failureLimit: number;
    windowMs: number;
  }): Promise<RateLimitRecord>;
  clear(dimension: RateLimitDimension, keyHash: string): Promise<void>;
}

export interface SessionRepository {
  create(input: {
    personId: string;
    tokenHash: string;
    activeRoleCode: RoleCode | null;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<SessionAuthRecord>;
  findByTokenHash(tokenHash: string): Promise<SessionAuthRecord | null>;
  findByIdForUpdate(sessionId: string): Promise<SessionAuthRecord | null>;
  countActive(personId: string, now: Date): Promise<number>;
  revokeOldestExcess(personId: string, keep: number, revokedAt: Date): Promise<void>;
  revokeForPerson(personId: string, revokedAt: Date, exceptSessionId?: string): Promise<void>;
  revokeById(sessionId: string, revokedAt: Date): Promise<void>;
  touch(sessionId: string, lastSeenAt: Date): Promise<void>;
  setActiveRole(sessionId: string, roleCode: RoleCode | null): Promise<void>;
}

export interface RoleAssignmentRepository {
  listActiveRoleCodes(personId: string): Promise<RoleCode[]>;
  hasActiveRole(input: {
    personId: string;
    roleCode: RoleCode;
    projectId?: string | null;
  }): Promise<boolean>;
  hasProjectAccess(input: {
    personId: string;
    roleCode: RoleCode;
    projectId: string;
  }): Promise<boolean>;
  listVisibleProjectIds(personId: string, roleCode: RoleCode): Promise<string[]>;
  listForManagement(): Promise<RoleAssignmentRecord[]>;
  listAssignableProjects(): Promise<Array<{ id: string; projectCode: string | null; projectName: string }>>;
  countAvailablePmosForUpdate(now: Date): Promise<number>;
  personHasActiveGlobalPmo(personId: string): Promise<boolean>;
  personHasActivePrimaryKeySubIForUpdate(personId: string): Promise<boolean>;
  projectIsAssignableForUpdate(projectId: string): Promise<boolean>;
  create(input: {
    personId: string;
    roleCode: RoleCode;
    projectId: string | null;
    assignmentStatus: AssignmentStatus;
    isPrimary: boolean;
    grantSource: GrantSource;
    grantedByPersonId: string | null;
    proposedAt: Date;
    activatedAt: Date | null;
  }): Promise<RoleAssignmentRecord>;
  findByIdForUpdate(assignmentId: string): Promise<RoleAssignmentRecord | null>;
  findSystemBootstrapPmoForUpdate(): Promise<RoleAssignmentRecord | null>;
  end(assignmentId: string, endedAt: Date): Promise<void>;
  listEligibilityForManagement?(): Promise<RoleEligibilityRecord[]>;
  createEligibility?(input: {
    personId: string;
    grantedByPersonId: string;
    reason: string;
    grantedAt: Date;
  }): Promise<RoleEligibilityRecord>;
  findEligibilityByIdForUpdate?(eligibilityId: string): Promise<RoleEligibilityRecord | null>;
  endEligibility?(eligibilityId: string, endedByPersonId: string, endedAt: Date): Promise<void>;
}

export interface AuditRepository {
  append(event: AuditEventInput): Promise<void>;
}

export interface AuthRepositories {
  people: PersonRepository;
  credentials: CredentialTokenRepository;
  passwordHistory: PasswordHistoryRepository;
  rateLimits: RateLimitRepository;
  sessions: SessionRepository;
  roles: RoleAssignmentRepository;
  audit: AuditRepository;
}

export interface AuthUnitOfWork {
  run<T>(operation: (repositories: AuthRepositories) => Promise<T>): Promise<T>;
}
