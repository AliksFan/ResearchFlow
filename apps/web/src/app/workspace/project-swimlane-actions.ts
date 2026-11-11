"use server";

import { randomUUID } from "node:crypto";

import { CollaborationError, type ProjectSwimlaneChangeCommand, type ProjectSwimlaneImpact } from "@researchflow/collaboration";
import { revalidatePath } from "next/cache";

import { requireCollaborationActor } from "@/server/collaboration-session";
import { getProjectSwimlaneRuntime } from "@/server/project-swimlane-runtime";

export type ProjectSwimlaneActionResult =
  | { ok: true; impact: ProjectSwimlaneImpact; activatedAt?: string }
  | { ok: false; code: string; message: string; correlationId?: string };

export async function previewProjectSwimlaneChange(raw: ProjectSwimlaneChangeCommand): Promise<ProjectSwimlaneActionResult> {
  const correlationId = randomUUID();
  try {
    const actor = await requireCollaborationActor();
    const input = command(raw);
    return { ok: true, impact: await getProjectSwimlaneRuntime().preview(actor, input) };
  } catch (error) {
    return failure(error, correlationId, "previewProjectSwimlaneChange");
  }
}

export async function applyProjectSwimlaneChange(raw: ProjectSwimlaneChangeCommand): Promise<ProjectSwimlaneActionResult> {
  const correlationId = randomUUID();
  try {
    const actor = await requireCollaborationActor();
    const input = command(raw);
    const result = await getProjectSwimlaneRuntime().apply(actor, input);
    revalidatePath(`/workspace/projects/${input.projectId}/execution`);
    return { ok: true, impact: result.impact, activatedAt: result.activatedAt };
  } catch (error) {
    return failure(error, correlationId, "applyProjectSwimlaneChange");
  }
}

function command(raw: ProjectSwimlaneChangeCommand): ProjectSwimlaneChangeCommand {
  if (!raw || typeof raw !== "object") throw new CollaborationError("PROJECT_SWIMLANE_INVALID_INPUT");
  return {
    projectId: text(raw.projectId), expectedRevision: text(raw.expectedRevision), name: text(raw.name), reason: text(raw.reason),
    stages: array(raw.stages).map((stage) => ({ id: text(stage.id), code: text(stage.code), name: text(stage.name), sortOrder: integer(stage.sortOrder), applicability: applicability(stage.applicability), plannedStartDate: dateValue(stage.plannedStartDate), plannedEndDate: dateValue(stage.plannedEndDate) })),
    workflows: array(raw.workflows).map((workflow) => ({ id: text(workflow.id), code: text(workflow.code), name: text(workflow.name), description: text(workflow.description), sortOrder: integer(workflow.sortOrder), enabled: Boolean(workflow.enabled) })),
    nodes: array(raw.nodes).map((node) => ({ id: text(node.id), workflowId: text(node.workflowId), stageId: text(node.stageId), taskName: text(node.taskName), taskDescription: text(node.taskDescription), sortOrder: integer(node.sortOrder), applicability: applicability(node.applicability), plannedStartDate: dateValue(node.plannedStartDate), plannedEndDate: dateValue(node.plannedEndDate), updateIntervalDays: node.updateIntervalDays === null ? null : integer(node.updateIntervalDays), overdueReminderIntervalDays: integer(node.overdueReminderIntervalDays), attachmentRequirement: attachment(node.attachmentRequirement), ownerRoles: arrayOfStrings(node.ownerRoles) as ProjectSwimlaneChangeCommand["nodes"][number]["ownerRoles"], predecessorIds: arrayOfStrings(node.predecessorIds), executionStatus: executionStatus(node.executionStatus), hasExecutionHistory: Boolean(node.hasExecutionHistory) })),
  };
}

function failure(error: unknown, correlationId: string, operation: string): ProjectSwimlaneActionResult {
  const known = error instanceof CollaborationError;
  const code = known ? error.code : "PROJECT_SWIMLANE_SYSTEM_ERROR";
  const messages: Record<string, string> = { PROJECT_SWIMLANE_FORBIDDEN: "当前角色或项目授权不允许修改泳道。", PROJECT_NOT_ACTIVE: "只有执行中的项目可以修改泳道。", PROJECT_SWIMLANE_INVALID_INPUT: "请完整填写泳道名称、修改原因和有效字段。", PROJECT_SWIMLANE_INVALID_GRAPH: "泳道图存在无效阶段、工作流、节点或依赖。", PROJECT_SWIMLANE_COMPLETED_NODE_RESTRICTED: "已正式完成节点只能修改名称、说明和同格展示顺序。", PROJECT_SWIMLANE_CONFLICT: "当前泳道已被其他操作更新，请保留本次输入并刷新后核对。" };
  if (!known) {
    console.error("PROJECT_SWIMLANE_SYSTEM_ERROR", {
      operation,
      correlationId,
      error: safeError(error),
    });
    return { ok: false, code, correlationId, message: `泳道修改未保存，系统处理时发生异常。请稍后重试；如持续失败，请提供追踪编号：${correlationId}。` };
  }
  return { ok: false, code, message: messages[code] ?? "泳道修改未完成，请核对输入。" };
}

function safeError(error: unknown, depth = 0): Record<string, unknown> {
  if (!error || typeof error !== "object" || depth > 3) return { type: typeof error };
  const value = error as { name?: unknown; code?: unknown; cause?: unknown; meta?: unknown };
  const result: Record<string, unknown> = {
    name: typeof value.name === "string" ? value.name : error.constructor?.name ?? "UnknownError",
  };
  if (typeof value.code === "string") result.code = value.code;
  if (value.meta && typeof value.meta === "object") {
    const meta = value.meta as { modelName?: unknown; target?: unknown; database_error?: unknown };
    result.meta = {
      modelName: typeof meta.modelName === "string" ? meta.modelName : undefined,
      target: Array.isArray(meta.target) && meta.target.every((item) => typeof item === "string") ? meta.target : undefined,
      databaseErrorKind: meta.database_error && typeof meta.database_error === "object" && "kind" in meta.database_error
        ? String((meta.database_error as { kind: unknown }).kind)
        : undefined,
    };
  }
  if (value.cause) result.cause = safeError(value.cause, depth + 1);
  return result;
}

function array(value: unknown): Array<Record<string, unknown>> { if (!Array.isArray(value) || value.some((item) => !item || typeof item !== "object")) throw new CollaborationError("PROJECT_SWIMLANE_INVALID_INPUT"); return value as Array<Record<string, unknown>>; }
function text(value: unknown): string { if (typeof value !== "string") throw new CollaborationError("PROJECT_SWIMLANE_INVALID_INPUT"); return value; }
function integer(value: unknown): number { if (!Number.isInteger(value)) throw new CollaborationError("PROJECT_SWIMLANE_INVALID_INPUT"); return value as number; }
function arrayOfStrings(value: unknown): string[] { if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new CollaborationError("PROJECT_SWIMLANE_INVALID_INPUT"); return value; }
function dateValue(value: unknown): string | null { if (value === null) return null; const result = text(value); if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new CollaborationError("PROJECT_SWIMLANE_INVALID_INPUT"); return result; }
function applicability(value: unknown) { if (value !== "REQUIRED" && value !== "OPTIONAL" && value !== "NOT_APPLICABLE") throw new CollaborationError("PROJECT_SWIMLANE_INVALID_INPUT"); return value; }
function attachment(value: unknown) { if (value !== "NONE" && value !== "OPTIONAL" && value !== "REQUIRED") throw new CollaborationError("PROJECT_SWIMLANE_INVALID_INPUT"); return value; }
function executionStatus(value: unknown) { if (value !== "NOT_STARTED" && value !== "ACTIVE" && value !== "PENDING_COMPLETION_CONFIRMATION" && value !== "COMPLETED") throw new CollaborationError("PROJECT_SWIMLANE_INVALID_INPUT"); return value; }
