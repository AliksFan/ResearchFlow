import { createHash, randomUUID } from "node:crypto";

import {
  CollaborationError,
  validateWorkflowDependencyGraph,
  type CollaborationActor,
  type LifecycleTemplateDraftCommand,
  type LifecycleTemplateRepository,
  type LifecycleTemplateVersionRecord,
} from "@researchflow/collaboration";

import type { Prisma } from "../generated/client.js";
import type { ApplicationPrismaClient } from "./client.js";

type Transaction = Prisma.TransactionClient;
type DatabaseClient = ApplicationPrismaClient | Transaction;

const versionInclude = {
  lifecycleTemplate: {
    select: {
      id: true,
      templateCode: true,
      templateName: true,
      versions: { select: { id: true, status: true } },
    },
  },
  stageTemplates: { orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }] },
  workflowTemplates: { orderBy: [{ workflowName: "asc" as const }, { id: "asc" as const }] },
  workflowStageTemplates: {
    orderBy: [{ sortOrder: "asc" as const }, { id: "asc" as const }],
    include: {
      workflowTemplate: { select: { workflowName: true } },
      stageTemplate: { select: { stageName: true } },
      successorDependencies: { select: { predecessorWorkflowStageTemplateId: true } },
    },
  },
} satisfies Prisma.LifecycleTemplateVersionInclude;

export class PrismaLifecycleTemplateRepository implements LifecycleTemplateRepository {
  constructor(private readonly client: ApplicationPrismaClient) {}

  async listVersions(actor: CollaborationActor): Promise<LifecycleTemplateVersionRecord[]> {
    return this.client.$transaction(async (transaction) => {
      await requirePmo(transaction, actor);
      const versions = await transaction.lifecycleTemplateVersion.findMany({
        where: { lifecycleTemplate: { status: "ACTIVE" }, status: { in: ["DRAFT", "PUBLISHED"] } },
        orderBy: [{ lifecycleTemplate: { templateName: "asc" } }, { versionNo: "desc" }],
        include: versionInclude,
      });
      const currentBySolution = new Map<string, (typeof versions)[number]>();
      for (const version of versions) {
        if (!currentBySolution.has(version.lifecycleTemplateId)) currentBySolution.set(version.lifecycleTemplateId, version);
      }
      return [...currentBySolution.values()].map(mapVersion);
    }, { isolationLevel: "Serializable" });
  }

  async createSolution(actor: CollaborationActor, templateName: string): Promise<string> {
    return this.runMutation(async (transaction) => {
      await requirePmo(transaction, actor);
      const normalizedName = normalizeName(templateName);
      const existing = await transaction.lifecycleTemplate.findMany({
        where: { status: "ACTIVE" },
        select: { templateName: true },
      });
      if (existing.some((item) => normalizeName(item.templateName).toLocaleLowerCase("zh-CN") === normalizedName.toLocaleLowerCase("zh-CN"))) {
        throw new CollaborationError("LIFECYCLE_TEMPLATE_NAME_DUPLICATE");
      }
      const templateId = randomUUID();
      const versionId = randomUUID();
      await transaction.lifecycleTemplate.create({ data: {
        id: templateId,
        templateCode: `WF-${randomUUID().slice(0, 8).toUpperCase()}`,
        templateName: normalizedName,
        versions: { create: { id: versionId, versionNo: 1, status: "DRAFT" } },
      } });
      await audit(transaction, actor, versionId, "WORKFLOW_SCHEME_CREATED", ["template_name"]);
      return versionId;
    });
  }

  async createDraftFromPublished(actor: CollaborationActor, sourceTemplateVersionId: string): Promise<string> {
    return this.runMutation(async (transaction) => {
      await requirePmo(transaction, actor);
      const source = await transaction.lifecycleTemplateVersion.findFirst({
        where: { id: sourceTemplateVersionId, status: "PUBLISHED", lifecycleTemplate: { status: "ACTIVE" } },
        include: {
          stageTemplates: true,
          workflowTemplates: true,
          workflowStageTemplates: true,
          workflowStageDependencies: true,
        },
      });
      if (!source) conflict();
      const existingDraft = await transaction.lifecycleTemplateVersion.findFirst({
        where: { lifecycleTemplateId: source.lifecycleTemplateId, status: "DRAFT" },
        select: { id: true },
      });
      if (existingDraft) return existingDraft.id;
      const latest = await transaction.lifecycleTemplateVersion.aggregate({
        where: { lifecycleTemplateId: source.lifecycleTemplateId },
        _max: { versionNo: true },
      });
      const draftId = randomUUID();
      await transaction.lifecycleTemplateVersion.create({ data: {
        id: draftId,
        lifecycleTemplateId: source.lifecycleTemplateId,
        versionNo: (latest._max.versionNo ?? 0) + 1,
        status: "DRAFT",
      } });
      const stageIds = new Map(source.stageTemplates.map((item) => [item.id, randomUUID()]));
      const workflowIds = new Map(source.workflowTemplates.map((item) => [item.id, randomUUID()]));
      const nodeIds = new Map(source.workflowStageTemplates.map((item) => [item.id, randomUUID()]));
      await transaction.stageTemplate.createMany({ data: source.stageTemplates.map((item) => ({
        id: stageIds.get(item.id)!,
        templateVersionId: draftId,
        stageCode: item.stageCode,
        stageName: item.stageName,
        sortOrder: item.sortOrder,
        defaultApplicability: item.defaultApplicability,
      })) });
      await transaction.workflowTemplate.createMany({ data: source.workflowTemplates.map((item) => ({
        id: workflowIds.get(item.id)!,
        templateVersionId: draftId,
        workflowCode: item.workflowCode,
        workflowName: item.workflowName,
        description: item.description,
        requiredByDefault: item.requiredByDefault,
        enabled: item.enabled,
      })) });
      await transaction.workflowStageTemplate.createMany({ data: source.workflowStageTemplates.map((item) => ({
        id: nodeIds.get(item.id)!,
        templateVersionId: draftId,
        workflowTemplateId: workflowIds.get(item.workflowTemplateId)!,
        stageTemplateId: stageIds.get(item.stageTemplateId)!,
        sortOrder: item.sortOrder,
        defaultTask: item.defaultTask,
        defaultOwnerRole: item.defaultOwnerRole,
        defaultApplicability: item.defaultApplicability,
        defaultAttachmentRequirement: item.defaultAttachmentRequirement,
      })) });
      if (source.workflowStageDependencies.length) {
        await transaction.workflowStageTemplateDependency.createMany({ data: source.workflowStageDependencies.map((edge) => ({
          templateVersionId: draftId,
          predecessorWorkflowStageTemplateId: nodeIds.get(edge.predecessorWorkflowStageTemplateId)!,
          successorWorkflowStageTemplateId: nodeIds.get(edge.successorWorkflowStageTemplateId)!,
        })) });
      }
      await audit(transaction, actor, draftId, "LIFECYCLE_TEMPLATE_DRAFT_CREATED", ["version"]);
      return draftId;
    });
  }

  async saveDraft(actor: CollaborationActor, input: LifecycleTemplateDraftCommand): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, actor);
      await replaceDraftGraph(transaction, input);
      await audit(transaction, actor, input.templateVersionId, "LIFECYCLE_TEMPLATE_DRAFT_UPDATED", ["applicability", "attachment_requirement", "dependencies"]);
    });
  }

  async publishDraft(actor: CollaborationActor, input: LifecycleTemplateDraftCommand): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, actor);
      await replaceDraftGraph(transaction, input);
      const current = await transaction.lifecycleTemplateVersion.findUniqueOrThrow({
        where: { id: input.templateVersionId },
        include: versionInclude,
      });
      validateRecordGraph(mapVersion(current));
      const published = await transaction.lifecycleTemplateVersion.updateMany({
        where: { id: input.templateVersionId, status: "DRAFT" },
        data: { status: "PUBLISHED", publishedByPersonId: actor.personId, publishedAt: new Date() },
      });
      if (published.count !== 1) conflict();
      await audit(transaction, actor, input.templateVersionId, "LIFECYCLE_TEMPLATE_VERSION_PUBLISHED", ["status", "published_by", "published_at"]);
    });
  }

  async deleteVersion(actor: CollaborationActor, templateVersionId: string, expectedFingerprint: string): Promise<void> {
    await this.runMutation(async (transaction) => {
      await requirePmo(transaction, actor);
      const version = await transaction.lifecycleTemplateVersion.findFirst({
        where: { id: templateVersionId, status: { in: ["DRAFT", "PUBLISHED"] }, lifecycleTemplate: { status: "ACTIVE" } },
        include: versionInclude,
      });
      if (!version || mapVersion(version).fingerprint !== expectedFingerprint) conflict();
      const applicationReferences = await transaction.projectApplicationVersion.count({ where: { lifecycleTemplateVersionId: version.id } });
      const planReferences = await transaction.projectPlanVersion.count({ where: { templateVersionId: version.id } });
      if (version.status === "PUBLISHED" || applicationReferences + planReferences > 0) {
        await transaction.lifecycleTemplate.update({ where: { id: version.lifecycleTemplateId }, data: { status: "RETIRED" } });
        await transaction.lifecycleTemplateVersion.updateMany({ where: { lifecycleTemplateId: version.lifecycleTemplateId, status: { in: ["DRAFT", "PUBLISHED"] } }, data: { status: "RETIRED" } });
        await audit(transaction, actor, version.id, "LIFECYCLE_TEMPLATE_RETIRED", ["template_status", "version_status"]);
        return;
      }
      await transaction.workflowStageTemplateDependency.deleteMany({ where: { templateVersionId: version.id } });
      await transaction.workflowStageTemplate.deleteMany({ where: { templateVersionId: version.id } });
      await transaction.workflowTemplate.deleteMany({ where: { templateVersionId: version.id } });
      await transaction.stageTemplate.deleteMany({ where: { templateVersionId: version.id } });
      await transaction.lifecycleTemplateVersion.delete({ where: { id: version.id } });
      const remainingVersions = await transaction.lifecycleTemplateVersion.count({ where: { lifecycleTemplateId: version.lifecycleTemplateId } });
      if (remainingVersions === 0) await transaction.lifecycleTemplate.delete({ where: { id: version.lifecycleTemplateId } });
      await audit(transaction, actor, version.id, "LIFECYCLE_TEMPLATE_VERSION_DELETED", ["version"]);
    });
  }

  private async runMutation<T>(operation: (transaction: Transaction) => Promise<T>): Promise<T> {
    try {
      return await this.client.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error instanceof CollaborationError) throw error;
      if (error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034")) conflict();
      throw error;
    }
  }
}

async function replaceDraftGraph(transaction: Transaction, input: LifecycleTemplateDraftCommand): Promise<void> {
  const version = await transaction.lifecycleTemplateVersion.findFirst({
    where: { id: input.templateVersionId, status: "DRAFT", lifecycleTemplate: { status: "ACTIVE" } },
    include: versionInclude,
  });
  if (!version || mapVersion(version).fingerprint !== input.expectedFingerprint) conflict();
  const normalizedName = normalizeName(input.templateName);
  if (version.lifecycleTemplate.versions.every(({ status }) => status !== "PUBLISHED")) {
    const duplicateNames = await transaction.lifecycleTemplate.findMany({
      where: { id: { not: version.lifecycleTemplateId }, status: "ACTIVE" },
      select: { templateName: true },
    });
    if (duplicateNames.some((item) => normalizeName(item.templateName).toLocaleLowerCase("zh-CN") === normalizedName.toLocaleLowerCase("zh-CN"))) {
      throw new CollaborationError("LIFECYCLE_TEMPLATE_NAME_DUPLICATE");
    }
    await transaction.lifecycleTemplate.update({
      where: { id: version.lifecycleTemplateId },
      data: { templateName: normalizedName },
    });
  }
  validateWorkflowDependencyGraph(
    input.nodes.map(({ id, applicability }) => ({ id, applicability })),
    input.nodes.flatMap(({ id, predecessorIds }) => predecessorIds.map((predecessorId) => [predecessorId, id] as const)),
  );
  await transaction.workflowStageTemplateDependency.deleteMany({ where: { templateVersionId: input.templateVersionId } });
  const stageIds = new Set(input.stages.map(({ id }) => id));
  const workflowIds = new Set(input.workflows.map(({ id }) => id));
  const nodeIds = new Set(input.nodes.map(({ id }) => id));
  await transaction.workflowStageTemplate.deleteMany({ where: { templateVersionId: input.templateVersionId, id: { notIn: [...nodeIds] } } });
  await transaction.stageTemplate.deleteMany({ where: { templateVersionId: input.templateVersionId, id: { notIn: [...stageIds] } } });
  await transaction.workflowTemplate.deleteMany({ where: { templateVersionId: input.templateVersionId, id: { notIn: [...workflowIds] } } });
  const existingStageIds = new Set(version.stageTemplates.map(({ id }) => id));
  for (const stage of input.stages) {
    const data = {
      stageCode: stage.code,
      stageName: stage.name,
      sortOrder: stage.sortOrder,
      defaultApplicability: stage.applicability,
    };
    if (existingStageIds.has(stage.id)) await transaction.stageTemplate.update({ where: { id: stage.id }, data });
    else await transaction.stageTemplate.create({ data: { id: stage.id, templateVersionId: input.templateVersionId, ...data } });
  }
  const existingWorkflowIds = new Set(version.workflowTemplates.map(({ id }) => id));
  for (const workflow of input.workflows) {
    const data = {
      workflowCode: workflow.code,
      workflowName: workflow.name,
      description: workflow.description,
      requiredByDefault: workflow.requiredByDefault,
      enabled: workflow.enabled,
    };
    if (existingWorkflowIds.has(workflow.id)) await transaction.workflowTemplate.update({ where: { id: workflow.id }, data });
    else await transaction.workflowTemplate.create({ data: { id: workflow.id, templateVersionId: input.templateVersionId, ...data } });
  }
  const existingNodeIds = new Set(version.workflowStageTemplates.map(({ id }) => id));
  for (const node of input.nodes) {
    const data = {
      workflowTemplateId: node.workflowId,
      stageTemplateId: node.stageId,
      sortOrder: node.sortOrder,
      defaultTask: node.task,
      defaultOwnerRole: node.ownerRole,
      defaultApplicability: node.applicability,
      defaultAttachmentRequirement: node.attachmentRequirement,
    };
    if (existingNodeIds.has(node.id)) await transaction.workflowStageTemplate.update({ where: { id: node.id }, data });
    else await transaction.workflowStageTemplate.create({ data: { id: node.id, templateVersionId: input.templateVersionId, ...data } });
  }
  const dependencies = input.nodes.flatMap(({ id, predecessorIds }) => predecessorIds.map((predecessorId) => ({
    templateVersionId: input.templateVersionId,
    predecessorWorkflowStageTemplateId: predecessorId,
    successorWorkflowStageTemplateId: id,
  })));
  if (dependencies.length) await transaction.workflowStageTemplateDependency.createMany({ data: dependencies });
}

function mapVersion(version: Prisma.LifecycleTemplateVersionGetPayload<{ include: typeof versionInclude }>): LifecycleTemplateVersionRecord {
  const stages = version.stageTemplates.map((stage) => ({
    id: stage.id,
    code: stage.stageCode,
    name: stage.stageName,
    sortOrder: stage.sortOrder,
    applicability: stage.defaultApplicability,
  }));
  const workflows = version.workflowTemplates.map((workflow) => ({
    id: workflow.id,
    code: workflow.workflowCode,
    name: workflow.workflowName,
    description: workflow.description,
    requiredByDefault: workflow.requiredByDefault,
    enabled: workflow.enabled,
  }));
  const nodes = version.workflowStageTemplates.map((node) => ({
    id: node.id,
    label: `${node.workflowTemplate.workflowName} · ${node.stageTemplate.stageName} · ${node.defaultTask}`,
    workflowId: node.workflowTemplateId,
    stageId: node.stageTemplateId,
    task: node.defaultTask,
    ownerRole: node.defaultOwnerRole,
    sortOrder: node.sortOrder,
    applicability: node.defaultApplicability,
    attachmentRequirement: node.defaultAttachmentRequirement,
    predecessorIds: node.successorDependencies.map(({ predecessorWorkflowStageTemplateId }) => predecessorWorkflowStageTemplateId),
  }));
  const record = {
    id: version.id,
    lifecycleTemplateId: version.lifecycleTemplate.id,
    templateCode: version.lifecycleTemplate.templateCode,
    templateName: version.lifecycleTemplate.templateName,
    versionNo: version.versionNo,
    status: version.status,
    displayStatus: version.status === "DRAFT"
      ? version.lifecycleTemplate.versions.some(({ status }) => status === "PUBLISHED") ? "EDITING" as const : "UNPUBLISHED" as const
      : version.status === "PUBLISHED" ? "PUBLISHED" as const : "RETIRED" as const,
    nameEditable: version.status === "DRAFT" && version.lifecycleTemplate.versions.every(({ status }) => status !== "PUBLISHED"),
    stages,
    workflows,
    nodes,
  };
  return { ...record, fingerprint: fingerprint(record) };
}

function validateRecordGraph(version: LifecycleTemplateVersionRecord): void {
  validateWorkflowDependencyGraph(
    version.nodes.map(({ id, applicability }) => ({ id, applicability })),
    version.nodes.flatMap(({ id, predecessorIds }) => predecessorIds.map((predecessorId) => [predecessorId, id] as const)),
  );
}

async function requirePmo(client: DatabaseClient, actor: CollaborationActor): Promise<void> {
  if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
  const session = await client.session.findFirst({
    where: { id: actor.sessionId, personId: actor.personId, activeRoleCode: "PMO", revokedAt: null, expiresAt: { gt: new Date() }, person: { accountStatus: "ACTIVE" } },
    select: { id: true },
  });
  const assignment = await client.roleAssignment.findFirst({
    where: { personId: actor.personId, roleCode: "PMO", projectId: null, assignmentStatus: "ACTIVE" },
    select: { id: true },
  });
  if (!session || !assignment) throw new CollaborationError("COLLABORATION_FORBIDDEN");
}

async function audit(transaction: Transaction, actor: CollaborationActor, entityId: string, actionCode: string, changedFields: string[], result: "SUCCESS" | "FAILURE" = "SUCCESS", failureCode?: string): Promise<void> {
  await transaction.auditLog.create({ data: {
    actorPersonId: actor.personId,
    actorRoleCode: actor.roleCode,
    sessionId: actor.sessionId,
    actionCode,
    result,
    entityType: "LIFECYCLE_TEMPLATE_VERSION",
    entityId,
    summary: actionCode,
    changedFields,
    failureCode,
    correlationId: randomUUID(),
  } });
}

function conflict(): never {
  throw new CollaborationError("LIFECYCLE_TEMPLATE_CONFLICT");
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeName(value: string): string {
  return value.normalize("NFKC").trim();
}
