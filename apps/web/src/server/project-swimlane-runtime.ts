import { ProjectSwimlaneService } from "@researchflow/collaboration";
import { PrismaProjectSwimlaneRepository } from "@researchflow/db";

import { getApplicationPrismaClient } from "./auth-runtime";

export function getProjectSwimlaneRuntime(): ProjectSwimlaneService {
  return new ProjectSwimlaneService(new PrismaProjectSwimlaneRepository(getApplicationPrismaClient()));
}
