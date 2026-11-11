import { CollaborationService, DeanDashboardQueryService, PmoDashboardQueryService } from "@researchflow/collaboration";
import { PrismaCollaborationRepository, PrismaDeanDashboardRepository, PrismaPmoDashboardRepository } from "@researchflow/db";

import { getApplicationPrismaClient } from "./auth-runtime";

const runtimeState = globalThis as typeof globalThis & {
  researchFlowCollaborationRuntime?: CollaborationService;
};

export function getCollaborationRuntime(): CollaborationService {
  runtimeState.researchFlowCollaborationRuntime ??= new CollaborationService(
    new PrismaCollaborationRepository(getApplicationPrismaClient()),
  );
  return runtimeState.researchFlowCollaborationRuntime;
}

export function getPmoDashboardRuntime(): PmoDashboardQueryService {
  return new PmoDashboardQueryService(
    new PrismaPmoDashboardRepository(getApplicationPrismaClient()),
  );
}

export function getDeanDashboardRuntime(): DeanDashboardQueryService {
  return new DeanDashboardQueryService(
    new PrismaDeanDashboardRepository(getApplicationPrismaClient()),
  );
}
