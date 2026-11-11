import { ProjectBasicInformationService } from "@researchflow/collaboration";
import { PrismaProjectBasicInformationRepository } from "@researchflow/db";
import { getApplicationPrismaClient } from "./auth-runtime";

export function getProjectBasicInformationRuntime() { return new ProjectBasicInformationService(new PrismaProjectBasicInformationRepository(getApplicationPrismaClient())); }
