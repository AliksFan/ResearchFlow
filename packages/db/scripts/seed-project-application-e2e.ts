import { Argon2idPasswordHasher } from "@researchflow/auth";

import { createPrismaClient } from "../src/client.js";

const databaseUrl = process.env.DATABASE_URL;
const password = process.env.RF_E2E_PASSWORD;
if (!databaseUrl || !password) throw new Error("E2E_DATABASE_AND_PASSWORD_REQUIRED");

const parsed = new URL(databaseUrl);
const schema = parsed.searchParams.get("schema");
if (!/(test|validation|scratch)/iu.test(parsed.pathname) || schema !== "project_application_empty_20260818") {
  throw new Error("REFUSING_NON_ISOLATED_E2E_DATABASE");
}

const prisma = createPrismaClient(databaseUrl);
const hasher = new Argon2idPasswordHasher();
const passwordHash = await hasher.hash(password);
const ids = {
  pmo: "e1000000-0000-4000-8000-000000000001",
  applicant: "e1000000-0000-4000-8000-000000000002",
  lifecycle: "e2000000-0000-4000-8000-000000000001",
  version: "e2000000-0000-4000-8000-000000000002",
  stage: "e2000000-0000-4000-8000-000000000003",
  workflow: "e2000000-0000-4000-8000-000000000004",
  workflowStage: "e2000000-0000-4000-8000-000000000005",
};

try {
  await prisma.$transaction(async (transaction) => {
    await transaction.person.createMany({ data: [
      { id: ids.pmo, loginName: "e2e-pmo", displayName: "虚构 E2E PMO", passwordHash, accountStatus: "ACTIVE", mustChangePassword: false },
      { id: ids.applicant, loginName: "e2e-applicant", displayName: "虚构 E2E 申请人", passwordHash, accountStatus: "ACTIVE", mustChangePassword: false },
    ] });
    await transaction.roleAssignment.create({ data: {
      personId: ids.pmo, roleCode: "PMO", projectId: null, assignmentStatus: "ACTIVE", isPrimary: false,
      grantSource: "PMO_ACTION", grantedByPersonId: ids.pmo, activatedAt: new Date(),
    } });
    await transaction.roleEligibility.create({ data: {
      personId: ids.applicant, roleCode: "KEY_SUB_I", status: "ACTIVE", grantedByPersonId: ids.pmo,
      reason: "虚构 E2E 自主申请资格",
    } });
    for (const [index, code] of ["DISEASE_AREA", "RESEARCH_TYPE"].entries()) {
      await transaction.dictionary.create({ data: {
        id: `e3000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        dictionaryCode: code,
        dictionaryName: `虚构 ${code}`,
        description: "项目申请 E2E",
        options: { create: {
          id: `e4000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          optionCode: "VIRTUAL",
          displayName: "虚构选项",
          sortOrder: 1,
        } },
      } });
    }
    await transaction.lifecycleTemplate.create({ data: {
      id: ids.lifecycle, templateCode: "E2E_PROJECT", templateName: "虚构 E2E 生命周期", status: "ACTIVE",
      versions: { create: {
        id: ids.version, versionNo: 1, status: "PUBLISHED", publishedByPersonId: ids.pmo, publishedAt: new Date(),
        stageTemplates: { create: { id: ids.stage, stageCode: "START", stageName: "启动", sortOrder: 1 } },
        workflowTemplates: { create: {
          id: ids.workflow, workflowCode: "PREPARE", workflowName: "准备", description: "虚构 E2E 工作流",
          workflowStageTemplates: { create: { id: ids.workflowStage, templateVersionId: ids.version, stageTemplateId: ids.stage, sortOrder: 1, defaultTask: "完成准备", defaultOwnerRole: "KEY_SUB_I" } },
        } },
      } },
    } });
  });
} finally {
  await prisma.$disconnect();
}
