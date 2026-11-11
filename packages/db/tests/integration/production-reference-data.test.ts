import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PRODUCTION_DICTIONARY_REFERENCE_DATA,
  reconcileProductionReferenceData,
} from "../../scripts/reference-data.js";
import { createPrismaClient, type ApplicationPrismaClient } from "../../src/index.js";

const enabled = process.env.RF_PRODUCTION_REFERENCE_DATA_TEST_DATABASE === "1";
const expectedSchema = "formal_web_dictionary_other_delete_v1";

describe.runIf(enabled)("production reference data reconciliation", () => {
  let client: ApplicationPrismaClient;

  beforeAll(async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is required");
    const url = new URL(databaseUrl);
    if (
      url.hostname !== "127.0.0.1" ||
      url.port !== "55434" ||
      url.pathname !== "/researchflow_validation_2" ||
      url.searchParams.get("schema") !== expectedSchema
    ) throw new Error("Refusing production reference data test outside its isolated validation schema");
    client = createPrismaClient(databaseUrl);
    await resetFixture(client);
  });

  afterAll(async () => {
    if (client) {
      await resetFixture(client);
      await client.$disconnect();
    }
  });

  it("deletes an unreferenced legacy other, normalizes all reserved items, and is auditable and idempotent", async () => {
    await seedLegacyFixture(client);
    const applied = await reconcileProductionReferenceData(client, true);
    expect(applied).toMatchObject({
      applied: true,
      beforeOptionCount: 6,
      afterOptionCount: 7,
      missingDictionaryCodes: [],
      missingOptions: [],
      optionsToNormalize: [],
      legacyOptionsToDelete: [],
      blockers: [],
      conflicts: [],
    });

    const result = await reconcileProductionReferenceData(client, false);
    expect(result).toMatchObject({
      applied: false,
      beforeOptionCount: 7,
      afterOptionCount: 7,
      missingDictionaryCodes: [],
      missingOptions: [],
      optionsToNormalize: [],
      legacyOptionsToDelete: [],
      blockers: [],
      conflicts: [],
    });

    const dictionaries = await client.dictionary.findMany({
      where: { dictionaryCode: { in: PRODUCTION_DICTIONARY_REFERENCE_DATA.map(({ dictionaryCode }) => dictionaryCode) } },
      include: { options: { orderBy: { sortOrder: "asc" } } },
      orderBy: { dictionaryCode: "asc" },
    });
    for (const dictionary of dictionaries) {
      expect(dictionary.options.at(-1)).toMatchObject({ optionCode: "OTHER", displayName: "其它", sortOrder: 9999, enabled: true });
    }
    await expect(client.dictionaryOption.count({ where: { optionCode: "OPT-LEGACY-OTHER" } })).resolves.toBe(0);

    await expect(client.auditLog.count({
      where: {
        actionCode: "PRODUCTION_REFERENCE_DATA_RECONCILED",
        result: "SUCCESS",
        entityType: "DICTIONARY",
        entityBusinessCode: "DICTIONARY_OTHER",
      },
    })).resolves.toBe(1);
  });
});

async function seedLegacyFixture(client: ApplicationPrismaClient) {
  await client.dictionary.createMany({ data: [
    { dictionaryCode: "DISEASE_AREA", dictionaryName: "疾病方向", description: "虚构生产参考数据测试" },
    { dictionaryCode: "RESEARCH_TYPE", dictionaryName: "研究类型", description: "虚构生产参考数据测试" },
    { dictionaryCode: "ISSUE_TYPE", dictionaryName: "问题类型", description: "虚构生产参考数据测试" },
  ] });
  const dictionaries = await client.dictionary.findMany({ where: { dictionaryCode: { in: ["DISEASE_AREA", "RESEARCH_TYPE", "ISSUE_TYPE"] } } });
  const ids = new Map(dictionaries.map(({ dictionaryCode, id }) => [dictionaryCode, id]));
  await client.dictionaryOption.createMany({ data: [
    { dictionaryId: ids.get("RESEARCH_TYPE")!, dictionaryCode: "RESEARCH_TYPE", optionCode: "OPT-LEGACY-OTHER", displayName: "其它", sortOrder: 9999 },
    { dictionaryId: ids.get("ISSUE_TYPE")!, dictionaryCode: "ISSUE_TYPE", optionCode: "SCHEDULE_DELAY", displayName: "进度延误", sortOrder: 10 },
    { dictionaryId: ids.get("ISSUE_TYPE")!, dictionaryCode: "ISSUE_TYPE", optionCode: "RESOURCE_COORDINATION", displayName: "资源协调", sortOrder: 20 },
    { dictionaryId: ids.get("ISSUE_TYPE")!, dictionaryCode: "ISSUE_TYPE", optionCode: "COMPLIANCE_RISK", displayName: "合规风险", sortOrder: 30 },
    { dictionaryId: ids.get("ISSUE_TYPE")!, dictionaryCode: "ISSUE_TYPE", optionCode: "DATA_QUALITY", displayName: "数据质量", sortOrder: 40 },
    { dictionaryId: ids.get("ISSUE_TYPE")!, dictionaryCode: "ISSUE_TYPE", optionCode: "OTHER", displayName: "其他", sortOrder: 50 },
  ] });
}

async function resetFixture(client: ApplicationPrismaClient) {
  await client.auditLog.deleteMany({ where: { actionCode: "PRODUCTION_REFERENCE_DATA_RECONCILED", entityBusinessCode: "DICTIONARY_OTHER" } });
  await client.dictionaryOption.deleteMany({ where: { dictionaryCode: { in: ["DISEASE_AREA", "RESEARCH_TYPE", "ISSUE_TYPE"] } } });
  await client.dictionary.deleteMany({ where: { dictionaryCode: { in: ["DISEASE_AREA", "RESEARCH_TYPE", "ISSUE_TYPE"] } } });
}
