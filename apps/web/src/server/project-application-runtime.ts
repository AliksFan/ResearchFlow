import { ProjectApplicationQueryService, ProjectApplicationService } from "@researchflow/project-application";
import { PrismaProjectApplicationGateway } from "@researchflow/db";

import { getApplicationPrismaClient } from "./auth-runtime";

const runtimeState = globalThis as typeof globalThis & {
  researchFlowProjectApplicationRuntime?: {
    commands: ProjectApplicationService;
    queries: ProjectApplicationQueryService;
    gateway: PrismaProjectApplicationGateway;
  };
};

export function getProjectApplicationRuntime() {
  runtimeState.researchFlowProjectApplicationRuntime ??= createRuntime();
  return runtimeState.researchFlowProjectApplicationRuntime;
}

function createRuntime() {
  const gateway = new PrismaProjectApplicationGateway(getApplicationPrismaClient());
  return {
    commands: new ProjectApplicationService(gateway),
    queries: new ProjectApplicationQueryService(gateway),
    gateway,
  };
}
