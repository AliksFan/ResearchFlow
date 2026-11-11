import { randomUUID } from "node:crypto";

import {
  CollaborationError,
  DICTIONARY_OTHER_SORT_ORDER,
  type CollaborationActor,
  type DictionaryOptionChange,
  type DictionaryRepository,
  type DictionarySuggestionDecision,
  type DictionaryWorkspace,
  type ManagedDictionaryCode,
} from "@researchflow/collaboration";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";

type Transaction = Prisma.TransactionClient;

export class PrismaDictionaryRepository implements DictionaryRepository {
  constructor(private readonly client: ApplicationPrismaClient) {}

  listWorkspace(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode): Promise<DictionaryWorkspace> {
    return this.client.$transaction(async (transaction) => {
      await requirePmo(transaction, actor);
      const dictionary = await transaction.dictionary.findUnique({
        where: { dictionaryCode },
        include: {
          options: {
            orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }],
            include: { _count: { select: optionReferenceCountSelect } },
          },
          suggestions: {
            where: { status: "PENDING" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            include: { sources: { select: { createdAt: true } } },
          },
        },
      });
      if (!dictionary) throw new CollaborationError("DICTIONARY_INVALID_INPUT");
      return {
        dictionaryCode,
        dictionaryName: dictionary.dictionaryName,
        options: dictionary.options.map((option) => ({
          id: option.id,
          optionCode: option.optionCode,
          displayName: option.displayName,
          sortOrder: option.sortOrder,
          enabled: option.enabled,
          systemReserved: option.optionCode === "OTHER",
          referenceCount: referenceCount(option._count),
          expectedUpdatedAt: option.updatedAt.toISOString(),
        })),
        suggestions: dictionary.suggestions.map((suggestion) => {
          const times = suggestion.sources.map(({ createdAt }) => createdAt.valueOf());
          return {
            id: suggestion.id,
            proposedDisplayName: suggestion.proposedDisplayName,
            status: suggestion.status,
            usageCount: times.length,
            firstSubmittedAt: new Date(Math.min(...times)).toISOString(),
            lastSubmittedAt: new Date(Math.max(...times)).toISOString(),
            rowVersion: suggestion.rowVersion,
          };
        }),
      };
    }, { isolationLevel: "Serializable" });
  }

  async saveOptions(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode, changes: DictionaryOptionChange[]): Promise<void> {
    await this.run(async (transaction) => {
      await requirePmo(transaction, actor);
      for (const change of changes) {
        const current = await transaction.dictionaryOption.findFirst({
          where: { id: change.id, dictionaryCode },
        });
        if (!current || current.updatedAt.toISOString() !== change.expectedUpdatedAt) conflict();
        if (current.optionCode !== "OTHER" && change.sortOrder >= DICTIONARY_OTHER_SORT_ORDER) invalid();
        if (current.optionCode === "OTHER" && (
          change.displayName !== current.displayName ||
          change.enabled !== true ||
          change.sortOrder !== current.sortOrder
        )) invalid();
        await transaction.dictionaryOption.update({
          where: { id: change.id },
          data: {
            displayName: change.displayName,
            sortOrder: change.sortOrder,
            enabled: change.enabled,
          },
        });
      }
      await audit(transaction, actor, dictionaryCode, "DICTIONARY_OPTIONS_UPDATED", ["display_name", "sort_order", "enabled"]);
    });
  }

  async createOption(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode, displayName: string): Promise<void> {
    await this.run(async (transaction) => {
      await requirePmo(transaction, actor);
      await ensureDisplayNameAvailable(transaction, dictionaryCode, displayName);
      const dictionary = await transaction.dictionary.findUnique({ where: { dictionaryCode }, select: { id: true } });
      if (!dictionary) invalid();
      const maxSort = await transaction.dictionaryOption.aggregate({ where: { dictionaryCode, optionCode: { not: "OTHER" } }, _max: { sortOrder: true } });
      const option = await transaction.dictionaryOption.create({
        data: {
          dictionaryId: dictionary.id,
          dictionaryCode,
          optionCode: `OPT-${randomUUID().slice(0, 8).toUpperCase()}`,
          displayName,
          sortOrder: Math.min((maxSort._max.sortOrder ?? 0) + 10, DICTIONARY_OTHER_SORT_ORDER - 1),
          enabled: true,
        },
      });
      await audit(transaction, actor, option.id, "DICTIONARY_OPTION_CREATED", ["option_code", "display_name"]);
    });
  }

  async deleteOption(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode, optionId: string, expectedUpdatedAt: string): Promise<void> {
    await this.run(async (transaction) => {
      await requirePmo(transaction, actor);
      const current = await transaction.dictionaryOption.findFirst({
        where: { id: optionId, dictionaryCode },
        include: { _count: { select: optionReferenceCountSelect } },
      });
      if (!current || current.updatedAt.toISOString() !== expectedUpdatedAt) conflict();
      if (current.optionCode === "OTHER") throw new CollaborationError("DICTIONARY_OPTION_RESERVED");
      if (referenceCount(current._count) > 0) throw new CollaborationError("DICTIONARY_OPTION_IN_USE");
      await transaction.dictionaryOption.delete({ where: { id: current.id } });
      await transaction.auditLog.create({ data: {
        actorPersonId: actor.personId,
        actorRoleCode: actor.roleCode,
        sessionId: actor.sessionId,
        actionCode: "DICTIONARY_OPTION_DELETED",
        result: "SUCCESS",
        entityType: "DICTIONARY",
        entityId: current.id,
        entityBusinessCode: `${dictionaryCode}:${current.optionCode}`,
        summary: "删除未引用的字典选项",
        changedFields: ["option_code", "display_name"],
        beforeSnapshot: { dictionaryCode, optionCode: current.optionCode, displayName: current.displayName },
        correlationId: randomUUID(),
      } });
    }, "DICTIONARY_OPTION_IN_USE");
  }

  async reviewSuggestion(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode, suggestionId: string, expectedRowVersion: number, decision: DictionarySuggestionDecision): Promise<void> {
    await this.run(async (transaction) => {
      await requirePmo(transaction, actor);
      const suggestion = await transaction.dictionaryOptionSuggestion.findFirst({
        where: { id: suggestionId, dictionaryCode, status: "PENDING", rowVersion: expectedRowVersion },
      });
      if (!suggestion) conflict();
      let targetOptionId: string | null = null;
      let actionCode: string;
      let reviewComment: string | null = null;
      if (decision.action === "PROMOTE") {
        await ensureDisplayNameAvailable(transaction, dictionaryCode, decision.displayName);
        const dictionary = await transaction.dictionary.findUnique({ where: { dictionaryCode }, select: { id: true } });
        if (!dictionary) invalid();
        const maxSort = await transaction.dictionaryOption.aggregate({ where: { dictionaryCode, optionCode: { not: "OTHER" } }, _max: { sortOrder: true } });
        const target = await transaction.dictionaryOption.create({ data: {
          dictionaryId: dictionary.id,
          dictionaryCode,
          optionCode: `OPT-${randomUUID().slice(0, 8).toUpperCase()}`,
          displayName: decision.displayName.normalize("NFKC").trim(),
          sortOrder: Math.min((maxSort._max.sortOrder ?? 0) + 10, DICTIONARY_OTHER_SORT_ORDER - 1),
        } });
        targetOptionId = target.id;
        actionCode = "DICTIONARY_SUGGESTION_PROMOTED";
      } else if (decision.action === "MERGE") {
        const target = await transaction.dictionaryOption.findFirst({ where: { id: decision.targetOptionId, dictionaryCode, enabled: true, optionCode: { not: "OTHER" } }, select: { id: true } });
        if (!target) invalid();
        targetOptionId = target.id;
        actionCode = "DICTIONARY_SUGGESTION_MERGED";
      } else {
        reviewComment = decision.comment.normalize("NFKC").trim();
        actionCode = "DICTIONARY_SUGGESTION_REJECTED";
      }
      await transaction.dictionaryOptionSuggestion.update({
        where: { id: suggestion.id },
        data: {
          status: decision.action === "PROMOTE" ? "PROMOTED" : decision.action === "MERGE" ? "MERGED" : "REJECTED",
          targetOptionId,
          reviewedByPersonId: actor.personId,
          reviewedAt: new Date(),
          reviewComment,
          rowVersion: { increment: 1 },
        },
      });
      await audit(transaction, actor, suggestion.id, actionCode, ["status", "target_option_id", "review_comment"]);
    });
  }

  private async run(operation: (transaction: Transaction) => Promise<void>, foreignKeyCode?: "DICTIONARY_OPTION_IN_USE"): Promise<void> {
    try {
      await this.client.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof CollaborationError) throw error;
      if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") conflict();
      if (foreignKeyCode && typeof error === "object" && error !== null && "code" in error && error.code === "P2003") throw new CollaborationError(foreignKeyCode);
      throw error;
    }
  }
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

function referenceCount(counts: Record<string, number>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}

async function requirePmo(transaction: Transaction, actor: CollaborationActor): Promise<void> {
  if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
  const session = await transaction.session.findFirst({ where: { id: actor.sessionId, personId: actor.personId, activeRoleCode: "PMO", revokedAt: null, expiresAt: { gt: new Date() }, person: { accountStatus: "ACTIVE" } }, select: { id: true } });
  const assignment = await transaction.roleAssignment.findFirst({ where: { personId: actor.personId, roleCode: "PMO", projectId: null, assignmentStatus: "ACTIVE" }, select: { id: true } });
  if (!session || !assignment) throw new CollaborationError("COLLABORATION_FORBIDDEN");
}

async function ensureDisplayNameAvailable(transaction: Transaction, dictionaryCode: string, displayName: string): Promise<void> {
  const duplicate = await transaction.dictionaryOption.findFirst({ where: { dictionaryCode, displayName: { equals: displayName, mode: "insensitive" } }, select: { id: true } });
  if (duplicate) invalid();
}

async function audit(transaction: Transaction, actor: CollaborationActor, entityId: string, actionCode: string, changedFields: string[]): Promise<void> {
  await transaction.auditLog.create({ data: {
    actorPersonId: actor.personId,
    actorRoleCode: actor.roleCode,
    sessionId: actor.sessionId,
    actionCode,
    result: "SUCCESS",
    entityType: "DICTIONARY",
    entityId: /^[0-9a-f-]{36}$/iu.test(entityId) ? entityId : null,
    entityBusinessCode: entityId,
    summary: actionCode,
    changedFields,
    correlationId: randomUUID(),
  } });
}

function invalid(): never {
  throw new CollaborationError("DICTIONARY_INVALID_INPUT");
}

function conflict(): never {
  throw new CollaborationError("DICTIONARY_CONFLICT");
}
