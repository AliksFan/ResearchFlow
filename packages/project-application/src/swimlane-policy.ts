import type { ApplicationSwimlaneInput } from "./contracts.js";
import { z } from "zod";

const ownerRoles = new Set(["PMO", "KEY_SUB_I", "CRC", "STATISTICIAN", "COLLABORATION_LEAD"]);
const isoDate = /^\d{4}-\d{2}-\d{2}$/u;
const nullableDate = z.string().refine(validDate).nullable();
const applicability = z.enum(["REQUIRED", "OPTIONAL", "NOT_APPLICABLE"]);
const swimlaneSchema = z.object({
  name: z.string(),
  expectedRevision: z.number(),
  sourceTemplateVersionId: z.string().nullable(),
  stages: z.array(z.object({
    id: z.string(), code: z.string(), name: z.string(), sortOrder: z.number(),
    applicability, plannedStartDate: nullableDate, plannedEndDate: nullableDate,
  }).strict()),
  workflows: z.array(z.object({
    id: z.string(), code: z.string(), name: z.string(), description: z.string(),
    sortOrder: z.number(), enabled: z.boolean(),
  }).strict()),
  nodes: z.array(z.object({
    id: z.string(), workflowId: z.string(), stageId: z.string(), taskName: z.string(),
    taskDescription: z.string(), sortOrder: z.number(), applicability,
    plannedStartDate: nullableDate, plannedEndDate: nullableDate,
    updateIntervalDays: z.number().nullable(), overdueReminderIntervalDays: z.number(),
    attachmentRequirement: z.enum(["NONE", "OPTIONAL", "REQUIRED"]),
    ownerRoles: z.array(z.enum(["PMO", "KEY_SUB_I", "CRC", "STATISTICIAN", "COLLABORATION_LEAD"])),
    predecessorIds: z.array(z.string()),
  }).strict()),
}).strict();

export function validateApplicationSwimlane(candidate: unknown): candidate is ApplicationSwimlaneInput {
  const parsed = swimlaneSchema.safeParse(candidate);
  if (!parsed.success) return false;
  const input = parsed.data;
  if (!input.name.trim() || input.name.trim().length > 100 || !Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) return false;
  if (input.stages.length === 0 || input.workflows.length === 0 || input.nodes.length === 0) return false;
  const stageIds = new Set(input.stages.map(({ id }) => id));
  const workflowIds = new Set(input.workflows.map(({ id }) => id));
  const nodeIds = new Set(input.nodes.map(({ id }) => id));
  if (stageIds.size !== input.stages.length || workflowIds.size !== input.workflows.length || nodeIds.size !== input.nodes.length) return false;
  if (new Set(input.stages.map(({ code }) => code)).size !== input.stages.length || new Set(input.workflows.map(({ code }) => code)).size !== input.workflows.length) return false;
  if (input.stages.some((item) => !validNamed(item.id, item.code, item.name, item.sortOrder) || !validDateRange(item.plannedStartDate, item.plannedEndDate))) return false;
  if (input.workflows.some((item) => !validNamed(item.id, item.code, item.name, item.sortOrder) || item.description.length > 500)) return false;
  if (input.nodes.some((item) => !item.id || !item.taskName.trim() || item.taskName.length > 200 || !stageIds.has(item.stageId) || !workflowIds.has(item.workflowId) || !Number.isInteger(item.sortOrder) || item.sortOrder < 0 || !validDateRange(item.plannedStartDate, item.plannedEndDate) || (item.updateIntervalDays !== null && (!Number.isInteger(item.updateIntervalDays) || item.updateIntervalDays < 1 || item.updateIntervalDays > 3650)) || !Number.isInteger(item.overdueReminderIntervalDays) || item.overdueReminderIntervalDays < 1 || item.overdueReminderIntervalDays > 3650 || item.ownerRoles.length === 0 || new Set(item.ownerRoles).size !== item.ownerRoles.length || item.ownerRoles.some((role) => !ownerRoles.has(role)) || new Set(item.predecessorIds).size !== item.predecessorIds.length || item.predecessorIds.some((id) => id === item.id || !nodeIds.has(id)))) return false;
  const enabledWorkflowIds = new Set(input.workflows.filter(({ enabled }) => enabled).map(({ id }) => id));
  if (input.stages.filter(({ applicability }) => applicability !== "NOT_APPLICABLE").some((stage) => !input.nodes.some((node) => node.stageId === stage.id && enabledWorkflowIds.has(node.workflowId) && node.applicability !== "NOT_APPLICABLE"))) return false;
  return !hasCycle(input.nodes.map(({ id, predecessorIds }) => ({ id, predecessorIds })));
}

function validNamed(id: string, code: string, name: string, sortOrder: number) {
  return Boolean(id && code.trim() && name.trim() && code.length <= 100 && name.length <= 200 && Number.isInteger(sortOrder) && sortOrder >= 0);
}

function validDateRange(start: string | null, end: string | null) {
  return (!start || validDate(start)) && (!end || validDate(end)) && (!start || !end || start <= end);
}

function validDate(value: string) {
  if (!isoDate.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

function hasCycle(nodes: Array<{ id: string; predecessorIds: string[] }>) {
  const graph = new Map(nodes.map(({ id, predecessorIds }) => [id, predecessorIds]));
  const active = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (active.has(id)) return true;
    if (visited.has(id)) return false;
    active.add(id);
    if ((graph.get(id) ?? []).some(visit)) return true;
    active.delete(id);
    visited.add(id);
    return false;
  };
  return nodes.some(({ id }) => visit(id));
}
