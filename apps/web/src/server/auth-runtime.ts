import {
  Argon2idPasswordHasher,
  AuthenticationService,
  AuthorizationService,
  CredentialService,
  HmacAuthKeyHasher,
  PmoManagementService,
  Sha256SessionTokenCodec,
} from "@researchflow/auth";
import {
  createPrismaClient,
  PrismaAuthUnitOfWork,
  type ApplicationPrismaClient,
} from "@researchflow/db";

interface AuthRuntime {
  authentication: AuthenticationService;
  authorization: AuthorizationService;
  pmoManagement: PmoManagementService;
  credentials: CredentialService;
}

const runtimeState = globalThis as typeof globalThis & {
  researchFlowAuthRuntime?: Promise<AuthRuntime>;
  researchFlowPrismaClient?: ApplicationPrismaClient;
};

export function getAuthRuntime(): Promise<AuthRuntime> {
  runtimeState.researchFlowAuthRuntime ??= createRuntime();
  return runtimeState.researchFlowAuthRuntime;
}

export function getApplicationPrismaClient(): ApplicationPrismaClient {
  runtimeState.researchFlowPrismaClient ??= createPrismaClient(requiredEnvironment("DATABASE_URL"));
  return runtimeState.researchFlowPrismaClient;
}

async function createRuntime(): Promise<AuthRuntime> {
  const hmacSecret = requiredEnvironment("AUTH_HMAC_SECRET");
  const prismaClient = getApplicationPrismaClient();
  const unitOfWork = new PrismaAuthUnitOfWork(prismaClient);
  const passwordHasher = new Argon2idPasswordHasher();
  const keyHasher = new HmacAuthKeyHasher(hmacSecret);
  const tokenCodec = new Sha256SessionTokenCodec();
  const authentication = new AuthenticationService({
    unitOfWork,
    passwordHasher,
    keyHasher,
    tokenCodec,
    dummyPasswordHash: await passwordHasher.hash(
      "虚拟恒定时间认证占位安全口令 2026",
    ),
  });
  return {
    authentication,
    authorization: new AuthorizationService({ unitOfWork, tokenCodec }),
    pmoManagement: new PmoManagementService({ unitOfWork, tokenCodec }),
    credentials: new CredentialService({
      unitOfWork,
      passwordHasher,
      keyHasher,
      tokenCodec,
    }),
  };
}

export function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
