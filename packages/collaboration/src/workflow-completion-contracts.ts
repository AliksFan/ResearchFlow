import type {
  CollaborationActor,
  AttachmentRequirement,
  PlanItemApplicability,
  WorkflowExecutionStatus,
} from "./contracts.js";
import { CollaborationError } from "./repository-contracts.js";

export type WorkflowCompletionRequestStatus =
  | "WAITING_FOR_PREDECESSOR"
  | "PENDING_PMO_REVIEW"
  | "ISSUE_RESOLUTION_REQUIRED"
  | "PREDECESSOR_RETURNED_CONFIRMATION"
  | "RETURNED_FOR_RESUBMISSION"
  | "APPROVED"
  | "WITHDRAWN"
  | "TERMINATED_BY_PLAN_CHANGE";

export interface SubmitWorkflowCompletionInput {
  projectId: string;
  projectWorkflowStageId: string;
  expectedNodeRowVersion: number;
  progressSummary: string;
  basis: string;
  expectedCompletionDate: string | null;
  attachmentDraftIds: string[];
}

export interface WorkflowCompletionMutationInput {
  projectId: string;
  completionRequestId: string;
  expectedRowVersion: number;
}

export interface ResubmitWorkflowCompletionInput extends WorkflowCompletionMutationInput {
  progressSummary: string;
  basis: string;
  expectedCompletionDate: string | null;
  attachmentDraftIds: string[];
}

export interface WorkflowCompletionRecord {
  id: string;
  projectId: string;
  projectWorkflowStageId: string;
  status: WorkflowCompletionRequestStatus;
  rowVersion: number;
  attachmentRequirement: AttachmentRequirement;
  submissionNo: number;
  progressSummary: string;
  basis: string;
  expectedCompletionDate: string | null;
  submittedByPersonId: string;
  submittedAt: string;
  lastActivityAt: string;
  supplements: Array<{
    id: string;
    content: string;
    addedByPersonId: string;
    addedAt: string;
  }>;
  attachments: Array<{
    assetId: string;
    fileName: string;
    sizeBytes: number;
    source: "SUBMISSION" | "SUPPLEMENT";
  }>;
  reviewRound: null | {
    id: string;
    roundNo: number;
    status: "ACTIVE" | "PAUSED" | "APPROVED" | "RETURNED" | "TERMINATED";
    startedAt: string;
    dueAt: string;
    remainingMilliseconds: number;
  };
}

export interface WorkflowCompletionRepository {
  list(actor: CollaborationActor, projectId: string): Promise<WorkflowCompletionRecord[]>;
  submit(input: SubmitWorkflowCompletionInput & { actor: CollaborationActor }): Promise<WorkflowCompletionRecord>;
  supplement(input: WorkflowCompletionMutationInput & {
    actor: CollaborationActor;
    content: string;
    attachmentDraftIds: string[];
  }): Promise<void>;
  withdraw(input: WorkflowCompletionMutationInput & { actor: CollaborationActor; reason: string }): Promise<void>;
  reconfirm(input: WorkflowCompletionMutationInput & { actor: CollaborationActor; confirmation: string }): Promise<void>;
  resubmit(input: ResubmitWorkflowCompletionInput & { actor: CollaborationActor }): Promise<void>;
  review(input: WorkflowCompletionMutationInput & {
    actor: CollaborationActor;
    decision: "APPROVE" | "RETURN";
    comment: string;
  }): Promise<void>;
  synchronizeIssueGate(input: WorkflowCompletionMutationInput & { actor: CollaborationActor }): Promise<void>;
  revokeFormalCompletion(input: WorkflowCompletionMutationInput & { actor: CollaborationActor; reason: string }): Promise<void>;
  activatePlanChange(input: {
    actor: CollaborationActor;
    projectId: string;
    planChangeRequestId: string;
  }): Promise<void>;
}

export interface WorkflowDependencyNode {
  id: string;
  applicability: PlanItemApplicability;
}

export type WorkflowDependencyEdge = readonly [predecessorId: string, successorId: string];

export function validateWorkflowDependencyGraph(
  nodes: readonly WorkflowDependencyNode[],
  edges: readonly WorkflowDependencyEdge[],
): void {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const predecessors = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  const successors = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  const seen = new Set<string>();

  for (const [predecessorId, successorId] of edges) {
    const predecessor = byId.get(predecessorId);
    const successor = byId.get(successorId);
    if (!predecessor || !successor) {
      throw new CollaborationError("WORKFLOW_DEPENDENCY_NODE_NOT_FOUND");
    }
    if (predecessorId === successorId) {
      throw new CollaborationError("WORKFLOW_DEPENDENCY_SELF_REFERENCE");
    }
    const key = `${predecessorId}\u0000${successorId}`;
    if (seen.has(key)) {
      throw new CollaborationError("WORKFLOW_DEPENDENCY_DUPLICATE");
    }
    seen.add(key);
    if (
      successor.applicability !== "NOT_APPLICABLE" &&
      predecessor.applicability === "NOT_APPLICABLE"
    ) {
      throw new CollaborationError("WORKFLOW_DEPENDENCY_NOT_APPLICABLE_PREDECESSOR");
    }
    predecessors.get(successorId)?.push(predecessorId);
    successors.get(predecessorId)?.push(successorId);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): void => {
    if (visiting.has(nodeId)) throw new CollaborationError("WORKFLOW_DEPENDENCY_CYCLE");
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    for (const successorId of successors.get(nodeId) ?? []) visit(successorId);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const node of nodes) visit(node.id);

  const hasOptionalAncestor = (nodeId: string, checked: Set<string>): boolean => {
    for (const predecessorId of predecessors.get(nodeId) ?? []) {
      if (checked.has(predecessorId)) continue;
      checked.add(predecessorId);
      if (byId.get(predecessorId)?.applicability === "OPTIONAL") return true;
      if (hasOptionalAncestor(predecessorId, checked)) return true;
    }
    return false;
  };
  for (const node of nodes) {
    if (
      node.applicability === "REQUIRED" &&
      hasOptionalAncestor(node.id, new Set<string>())
    ) {
      throw new CollaborationError("WORKFLOW_DEPENDENCY_REQUIRED_HAS_OPTIONAL_ANCESTOR");
    }
  }
}

export function deriveInitialCompletionStatus(
  predecessorExecutionStatuses: readonly WorkflowExecutionStatus[],
  hasOpenIssue: boolean,
): "WAITING_FOR_PREDECESSOR" | "PENDING_PMO_REVIEW" | "ISSUE_RESOLUTION_REQUIRED" {
  if (predecessorExecutionStatuses.some((status) => status !== "COMPLETED")) {
    return "WAITING_FOR_PREDECESSOR";
  }
  return hasOpenIssue ? "ISSUE_RESOLUTION_REQUIRED" : "PENDING_PMO_REVIEW";
}

export function canApproveWorkflowCompletion(input: {
  requestStatus: WorkflowCompletionRequestStatus;
  predecessorExecutionStatuses: readonly WorkflowExecutionStatus[];
  hasOpenIssue: boolean;
  attachmentRequirement: AttachmentRequirement;
  availableAttachmentCount: number;
}): void {
  if (input.requestStatus !== "PENDING_PMO_REVIEW") {
    throw new CollaborationError("WORKFLOW_COMPLETION_CONFLICT");
  }
  if (input.predecessorExecutionStatuses.some((status) => status !== "COMPLETED")) {
    throw new CollaborationError("WORKFLOW_COMPLETION_PREDECESSOR_BLOCKED");
  }
  if (input.hasOpenIssue) {
    throw new CollaborationError("WORKFLOW_COMPLETION_ISSUE_BLOCKED");
  }
  if (input.attachmentRequirement === "REQUIRED" && input.availableAttachmentCount < 1) {
    throw new CollaborationError("WORKFLOW_COMPLETION_ATTACHMENT_REQUIRED");
  }
}
