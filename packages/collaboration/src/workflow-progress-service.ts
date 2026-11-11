import type { CollaborationActor } from "./contracts.js";
import { CollaborationError } from "./repository-contracts.js";
import type {
  CorrectWorkflowProgressInput,
  SubmitWorkflowProgressInput,
  WorkflowProgressRepository,
} from "./workflow-progress-contracts.js";

const MAX_CNY_INTEGER_DIGITS = 12;

export class WorkflowProgressService {
  constructor(private readonly repository: WorkflowProgressRepository) {}

  list(actor: CollaborationActor, projectId: string) {
    return this.repository.listProgress(actor, projectId);
  }

  getRecordedBudgetTotal(actor: CollaborationActor, projectId: string) {
    return this.repository.getRecordedBudgetTotal(actor, projectId);
  }

  async submit(actor: CollaborationActor, input: SubmitWorkflowProgressInput) {
    requireKeySubI(actor);
    const progressSummary = requireText(input.progressSummary, "INVALID_PROGRESS_INPUT");
    const basis = requireText(input.basis, "INVALID_PROGRESS_INPUT");
    const expectedCompletionDate = normalizeOptionalDate(
      input.expectedCompletionDate,
      "INVALID_PROGRESS_INPUT",
    );
    const budgetAmountCny = input.budgetAmountCny === null
      ? null
      : normalizeCnyAmount(input.budgetAmountCny, "INVALID_BUDGET_AMOUNT");
    return await this.repository.submitProgress({
      ...input,
      actor,
      progressSummary,
      basis,
      expectedCompletionDate,
      budgetAmountCny,
    });
  }

  async correct(actor: CollaborationActor, input: CorrectWorkflowProgressInput) {
    requireKeySubI(actor);
    const correctionReason = requireText(input.correctionReason, "INVALID_CORRECTION");
    if (!Number.isInteger(input.expectedLatestSequenceNo) || input.expectedLatestSequenceNo < 0) {
      throw new CollaborationError("INVALID_CORRECTION");
    }

    const revisedProgressSummary = normalizeOptionalCorrectionText(input.revisedProgressSummary);
    const revisedBasis = normalizeOptionalCorrectionText(input.revisedBasis);
    const revisedExpectedDate = normalizeRevisionDate(
      input.revisedExpectedDateMode,
      input.revisedExpectedDate,
    );
    const revisedBudgetAmountCny = normalizeRevisionBudget(
      input.budgetAmountMode,
      input.revisedBudgetAmountCny,
    );
    if (
      revisedProgressSummary === null &&
      revisedBasis === null &&
      input.revisedExpectedDateMode === "KEEP" &&
      input.budgetAmountMode === "KEEP"
    ) {
      throw new CollaborationError("INVALID_CORRECTION");
    }

    return await this.repository.correctProgress({
      ...input,
      actor,
      correctionReason,
      revisedProgressSummary,
      revisedBasis,
      revisedExpectedDate,
      revisedBudgetAmountCny,
    });
  }
}

function requireKeySubI(actor: CollaborationActor): void {
  if (actor.roleCode !== "KEY_SUB_I") {
    throw new CollaborationError("COLLABORATION_FORBIDDEN");
  }
}

function requireText(
  value: string,
  errorCode: "INVALID_PROGRESS_INPUT" | "INVALID_CORRECTION",
): string {
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) throw new CollaborationError(errorCode);
  return normalized;
}

function normalizeOptionalCorrectionText(value: string | null): string | null {
  return value === null ? null : requireText(value, "INVALID_CORRECTION");
}

function normalizeOptionalDate(
  value: string | null,
  errorCode: "INVALID_PROGRESS_INPUT" | "INVALID_CORRECTION",
): string | null {
  if (value === null) return null;
  if (!isDateOnly(value)) throw new CollaborationError(errorCode);
  return value;
}

function normalizeRevisionDate(mode: "KEEP" | "SET" | "CLEAR", value: string | null): string | null {
  if (mode === "SET") {
    if (value === null) throw new CollaborationError("INVALID_CORRECTION");
    return normalizeOptionalDate(value, "INVALID_CORRECTION");
  }
  if (value !== null) throw new CollaborationError("INVALID_CORRECTION");
  return null;
}

function normalizeRevisionBudget(
  mode: "KEEP" | "SET" | "CLEAR",
  value: string | null,
): string | null {
  if (mode === "SET" && value !== null) {
    try {
      return normalizeCnyAmount(value, "INVALID_BUDGET_AMOUNT");
    } catch {
      throw new CollaborationError("INVALID_CORRECTION");
    }
  }
  if (mode === "SET" || value !== null) {
    throw new CollaborationError("INVALID_CORRECTION");
  }
  return null;
}

function normalizeCnyAmount(
  value: string,
  errorCode: "INVALID_BUDGET_AMOUNT",
): string {
  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(normalized);
  if (!match) throw new CollaborationError(errorCode);
  const integerPart = (match[1] ?? "").replace(/^0+(?=\d)/u, "");
  const fractionPart = (match[2] ?? "").padEnd(2, "0");
  if (
    integerPart.length > MAX_CNY_INTEGER_DIGITS ||
    (BigInt(integerPart) === BigInt(0) && BigInt(fractionPart) === BigInt(0))
  ) {
    throw new CollaborationError(errorCode);
  }
  return `${integerPart}.${fractionPart}`;
}

function isDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
