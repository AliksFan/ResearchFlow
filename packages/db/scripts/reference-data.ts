import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "../src/index.js";
import { createPrismaClient } from "../src/index.js";

const OTHER_OPTION = { optionCode: "OTHER", displayName: "其它", sortOrder: 9999 } as const;

export const ISSUE_TYPE_REFERENCE_DATA = {
  dictionaryCode: "ISSUE_TYPE",
  dictionaryName: "问题类型",
  description: "项目问题分类",
  options: [
    { optionCode: "SCHEDULE_DELAY", displayName: "进度延误", sortOrder: 10 },
    { optionCode: "RESOURCE_COORDINATION", displayName: "资源协调", sortOrder: 20 },
    { optionCode: "COMPLIANCE_RISK", displayName: "合规风险", sortOrder: 30 },
    { optionCode: "DATA_QUALITY", displayName: "数据质量", sortOrder: 40 },
    OTHER_OPTION,
  ],
} as const;

export const PRODUCTION_DICTIONARY_REFERENCE_DATA = [
  { dictionaryCode: "DISEASE_AREA", dictionaryName: "疾病方向", description: "项目疾病方向", options: [OTHER_OPTION] },
  { dictionaryCode: "RESEARCH_TYPE", dictionaryName: "研究类型", description: "项目研究类型", options: [OTHER_OPTION] },
  ISSUE_TYPE_REFERENCE_DATA,
] as const;

type ReferenceDictionaryCode = (typeof PRODUCTION_DICTIONARY_REFERENCE_DATA)[number]["dictionaryCode"];
type CurrentDictionary = {
  dictionaryCode: string;
  dictionaryName: string;
  options: Array<{
    id: string;
    optionCode: string;
    displayName: string;
    sortOrder: number;
    enabled: boolean;
    referenceCount: number;
  }>;
};

export function planProductionReferenceDataReconciliation(current: CurrentDictionary[]) {
  const currentByCode = new Map(current.map((dictionary) => [dictionary.dictionaryCode, dictionary]));
  const missingDictionaryCodes: ReferenceDictionaryCode[] = [];
  const missingOptions: Array<{ dictionaryCode: ReferenceDictionaryCode; optionCode: string; displayName: string; sortOrder: number }> = [];
  const optionsToNormalize: Array<{ dictionaryCode: ReferenceDictionaryCode; optionCode: "OTHER"; displayName: "其它"; sortOrder: 9999; enabled: true }> = [];
  const legacyOptionsToDelete: Array<{ dictionaryCode: ReferenceDictionaryCode; id: string; optionCode: string; displayName: string }> = [];
  const blockers: Array<{ dictionaryCode: ReferenceDictionaryCode; optionCode: string; reason: "LEGACY_OTHER_IN_USE"; referenceCount: number }> = [];
  const conflicts: Array<{ dictionaryCode: ReferenceDictionaryCode; optionCode: string; expected: string; actual: string }> = [];

  for (const expectedDictionary of PRODUCTION_DICTIONARY_REFERENCE_DATA) {
    const dictionary = currentByCode.get(expectedDictionary.dictionaryCode);
    if (!dictionary) missingDictionaryCodes.push(expectedDictionary.dictionaryCode);
    const currentOptions = dictionary?.options ?? [];
    const currentOptionsByCode = new Map(currentOptions.map((option) => [option.optionCode, option]));

    for (const option of currentOptions.filter((candidate) => candidate.optionCode !== "OTHER" && isOtherLabel(candidate.displayName))) {
      if (option.referenceCount > 0) {
        blockers.push({ dictionaryCode: expectedDictionary.dictionaryCode, optionCode: option.optionCode, reason: "LEGACY_OTHER_IN_USE", referenceCount: option.referenceCount });
      } else {
        legacyOptionsToDelete.push({ dictionaryCode: expectedDictionary.dictionaryCode, id: option.id, optionCode: option.optionCode, displayName: option.displayName });
      }
    }

    for (const expectedOption of expectedDictionary.options) {
      const found = currentOptionsByCode.get(expectedOption.optionCode);
      if (!found) {
        missingOptions.push({ dictionaryCode: expectedDictionary.dictionaryCode, ...expectedOption });
      } else if (expectedOption.optionCode === "OTHER") {
        if (!isOtherLabel(found.displayName)) {
          conflicts.push({ dictionaryCode: expectedDictionary.dictionaryCode, optionCode: found.optionCode, expected: expectedOption.displayName, actual: found.displayName });
        } else if (found.displayName !== expectedOption.displayName || found.sortOrder !== expectedOption.sortOrder || !found.enabled) {
          optionsToNormalize.push({ dictionaryCode: expectedDictionary.dictionaryCode, optionCode: "OTHER", displayName: "其它", sortOrder: 9999, enabled: true });
        }
      } else if (found.displayName !== expectedOption.displayName) {
        conflicts.push({ dictionaryCode: expectedDictionary.dictionaryCode, optionCode: found.optionCode, expected: expectedOption.displayName, actual: found.displayName });
      }
    }
  }

  return { missingDictionaryCodes, missingOptions, optionsToNormalize, legacyOptionsToDelete, blockers, conflicts };
}

export async function reconcileProductionReferenceData(client: ApplicationPrismaClient, apply: boolean) {
  const current = await readCurrent(client);
  const beforeOptionCount = current.reduce((count, dictionary) => count + dictionary.options.length, 0);
  const plan = planProductionReferenceDataReconciliation(current);
  const blocked = plan.blockers.length > 0 || plan.conflicts.length > 0;
  if (blocked || !apply || !hasChanges(plan)) return result(false, null, beforeOptionCount, beforeOptionCount, plan);

  const correlationId = randomUUID();
  await client.$transaction(async (transaction) => {
    const lockedPlan = planProductionReferenceDataReconciliation(await readCurrent(transaction));
    if (lockedPlan.blockers.length > 0 || lockedPlan.conflicts.length > 0) throw new Error("PRODUCTION_REFERENCE_DATA_CONFLICT");
    for (const option of lockedPlan.legacyOptionsToDelete) await transaction.dictionaryOption.delete({ where: { id: option.id } });
    for (const expected of PRODUCTION_DICTIONARY_REFERENCE_DATA) {
      await transaction.dictionary.upsert({ where: { dictionaryCode: expected.dictionaryCode }, create: { dictionaryCode: expected.dictionaryCode, dictionaryName: expected.dictionaryName, description: expected.description }, update: {} });
    }
    for (const option of lockedPlan.missingOptions) {
      const dictionary = await transaction.dictionary.findUniqueOrThrow({ where: { dictionaryCode: option.dictionaryCode }, select: { id: true } });
      await transaction.dictionaryOption.create({ data: { dictionaryId: dictionary.id, dictionaryCode: option.dictionaryCode, optionCode: option.optionCode, displayName: option.displayName, sortOrder: option.sortOrder, enabled: true } });
    }
    for (const option of lockedPlan.optionsToNormalize) {
      await transaction.dictionaryOption.updateMany({ where: { dictionaryCode: option.dictionaryCode, optionCode: option.optionCode }, data: { displayName: option.displayName, sortOrder: option.sortOrder, enabled: option.enabled } });
    }
    await transaction.auditLog.create({ data: {
      actorIdentifierMasked: "production-ops",
      actionCode: "PRODUCTION_REFERENCE_DATA_RECONCILED",
      result: "SUCCESS",
      entityType: "DICTIONARY",
      entityBusinessCode: "DICTIONARY_OTHER",
      summary: "补齐系统保留字典末项",
      changedFields: ["dictionary_code", "option_code", "display_name", "sort_order", "enabled"],
      afterSnapshot: {
        addedOptionCodes: lockedPlan.missingOptions.map(({ dictionaryCode, optionCode }) => `${dictionaryCode}:${optionCode}`),
        normalizedOptionCodes: lockedPlan.optionsToNormalize.map(({ dictionaryCode, optionCode }) => `${dictionaryCode}:${optionCode}`),
        deletedLegacyOptionCodes: lockedPlan.legacyOptionsToDelete.map(({ dictionaryCode, optionCode }) => `${dictionaryCode}:${optionCode}`),
      },
      correlationId,
    } });
  }, { isolationLevel: "Serializable" });

  const finalCurrent = await readCurrent(client);
  return result(true, correlationId, beforeOptionCount, finalCurrent.reduce((count, dictionary) => count + dictionary.options.length, 0), planProductionReferenceDataReconciliation(finalCurrent));
}

const optionReferenceCountSelect = {
  projectsByDiseaseArea: true,
  projectsByResearchType: true,
  applicationVersionsByDiseaseArea: true,
  applicationVersionsByResearchType: true,
  fieldChangeItemsOld: true,
  fieldChangeItemsNew: true,
  issuesByType: true,
  issueActivitiesFromType: true,
  issueActivitiesToType: true,
  suggestionTargets: true,
} as const;

type ReadClient = Pick<ApplicationPrismaClient, "dictionary"> | Prisma.TransactionClient;

async function readCurrent(client: ReadClient): Promise<CurrentDictionary[]> {
  const dictionaries = await client.dictionary.findMany({
    where: { dictionaryCode: { in: PRODUCTION_DICTIONARY_REFERENCE_DATA.map(({ dictionaryCode }) => dictionaryCode) } },
    select: { dictionaryCode: true, dictionaryName: true, options: { select: { id: true, optionCode: true, displayName: true, sortOrder: true, enabled: true, _count: { select: optionReferenceCountSelect } } } },
  });
  return dictionaries.map((dictionary) => ({
    dictionaryCode: dictionary.dictionaryCode,
    dictionaryName: dictionary.dictionaryName,
    options: dictionary.options.map(({ _count, ...option }) => ({ ...option, referenceCount: Object.values(_count).reduce((sum, count) => sum + count, 0) })),
  }));
}

function isOtherLabel(value: string): boolean {
  const normalized = value.normalize("NFKC").trim();
  return normalized === "其它" || normalized === "其他";
}

function hasChanges(plan: ReturnType<typeof planProductionReferenceDataReconciliation>): boolean {
  return plan.missingDictionaryCodes.length > 0 || plan.missingOptions.length > 0 || plan.optionsToNormalize.length > 0 || plan.legacyOptionsToDelete.length > 0;
}

function result(applied: boolean, correlationId: string | null, beforeOptionCount: number, afterOptionCount: number, plan: ReturnType<typeof planProductionReferenceDataReconciliation>) {
  return { applied, correlationId, beforeOptionCount, afterOptionCount, ...plan };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--check" && arg !== "--apply") || (args.includes("--check") && args.includes("--apply"))) throw new Error("Usage: reference-data.ts [--check|--apply]");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const client = createPrismaClient(databaseUrl);
  try {
    const reconciled = await reconcileProductionReferenceData(client, args.includes("--apply"));
    const complete = !hasChanges(reconciled) && reconciled.blockers.length === 0 && reconciled.conflicts.length === 0;
    process.stdout.write(`${JSON.stringify({
      mode: args.includes("--apply") ? "apply" : "check",
      applied: reconciled.applied,
      beforeOptionCount: reconciled.beforeOptionCount,
      afterOptionCount: reconciled.afterOptionCount,
      missingDictionaryCodes: reconciled.missingDictionaryCodes,
      missingOptionCodes: reconciled.missingOptions.map(({ dictionaryCode, optionCode }) => `${dictionaryCode}:${optionCode}`),
      normalizeOptionCodes: reconciled.optionsToNormalize.map(({ dictionaryCode, optionCode }) => `${dictionaryCode}:${optionCode}`),
      deleteLegacyOptionCodes: reconciled.legacyOptionsToDelete.map(({ dictionaryCode, optionCode }) => `${dictionaryCode}:${optionCode}`),
      blockers: reconciled.blockers,
      conflicts: reconciled.conflicts,
      complete,
      correlationId: reconciled.correlationId,
    })}\n`);
    if (!complete) process.exitCode = 2;
  } finally {
    await client.$disconnect();
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main().catch((error: unknown) => {
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code.slice(0, 80)
      : error instanceof Error ? error.name : "UNKNOWN_ERROR";
    process.stderr.write(`${JSON.stringify({ error: code })}\n`);
    process.exitCode = 1;
  });
}
