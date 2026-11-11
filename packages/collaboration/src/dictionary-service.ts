import type { CollaborationActor } from "./contracts.js";
import { CollaborationError } from "./repository-contracts.js";
import {
  MANAGED_DICTIONARY_CODES,
  DICTIONARY_OTHER_SORT_ORDER,
  type DictionaryOptionChange,
  type DictionaryRepository,
  type DictionarySuggestionDecision,
  type ManagedDictionaryCode,
} from "./dictionary-contracts.js";

export class DictionaryService {
  constructor(private readonly repository: DictionaryRepository) {}

  listWorkspace(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode) {
    requirePmo(actor);
    requireCode(dictionaryCode);
    return this.repository.listWorkspace(actor, dictionaryCode);
  }

  saveOptions(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode, changes: DictionaryOptionChange[]) {
    requirePmo(actor);
    requireCode(dictionaryCode);
    if (changes.some((change) => !change.id.trim() || !validName(change.displayName) || !Number.isInteger(change.sortOrder) || change.sortOrder >= DICTIONARY_OTHER_SORT_ORDER || !change.expectedUpdatedAt.trim())) invalid();
    return this.repository.saveOptions(actor, dictionaryCode, changes.map((change) => ({ ...change, displayName: normalizeName(change.displayName) })));
  }

  createOption(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode, displayName: string) {
    requirePmo(actor);
    requireCode(dictionaryCode);
    if (!validName(displayName)) invalid();
    return this.repository.createOption(actor, dictionaryCode, normalizeName(displayName));
  }

  deleteOption(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode, optionId: string, expectedUpdatedAt: string) {
    requirePmo(actor);
    requireCode(dictionaryCode);
    if (!optionId.trim() || !expectedUpdatedAt.trim()) invalid();
    return this.repository.deleteOption(actor, dictionaryCode, optionId, expectedUpdatedAt);
  }

  reviewSuggestion(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode, suggestionId: string, expectedRowVersion: number, decision: DictionarySuggestionDecision) {
    requirePmo(actor);
    requireCode(dictionaryCode);
    if (!suggestionId.trim() || !Number.isInteger(expectedRowVersion) || expectedRowVersion < 0) invalid();
    if (decision.action === "PROMOTE" && !validName(decision.displayName)) invalid();
    if (decision.action === "MERGE" && !decision.targetOptionId.trim()) invalid();
    if (decision.action === "REJECT" && !normalizeName(decision.comment)) invalid();
    return this.repository.reviewSuggestion(actor, dictionaryCode, suggestionId, expectedRowVersion, decision);
  }
}

function requirePmo(actor: CollaborationActor): void {
  if (actor.roleCode !== "PMO") throw new CollaborationError("COLLABORATION_FORBIDDEN");
}

function requireCode(value: string): asserts value is ManagedDictionaryCode {
  if (!(MANAGED_DICTIONARY_CODES as readonly string[]).includes(value)) invalid();
}

function normalizeName(value: string): string {
  return value.normalize("NFKC").trim();
}

function validName(value: string): boolean {
  const normalized = normalizeName(value);
  return normalized.length > 0 && [...normalized].length <= 100;
}

function invalid(): never {
  throw new CollaborationError("DICTIONARY_INVALID_INPUT");
}
