import type { CollaborationActor } from "./contracts.js";

export const MANAGED_DICTIONARY_CODES = [
  "DISEASE_AREA",
  "RESEARCH_TYPE",
  "ISSUE_TYPE",
  "EXTERNAL_CONTACT_CATEGORY",
] as const;
export type ManagedDictionaryCode = (typeof MANAGED_DICTIONARY_CODES)[number];

export const DICTIONARY_OTHER_SORT_ORDER = 9999;

export interface DictionaryOptionRecord {
  id: string;
  optionCode: string;
  displayName: string;
  sortOrder: number;
  enabled: boolean;
  systemReserved: boolean;
  referenceCount: number;
  expectedUpdatedAt: string;
}

export interface DictionarySuggestionRecord {
  id: string;
  proposedDisplayName: string;
  status: "PENDING" | "PROMOTED" | "MERGED" | "REJECTED";
  usageCount: number;
  firstSubmittedAt: string;
  lastSubmittedAt: string;
  rowVersion: number;
}

export interface DictionaryWorkspace {
  dictionaryCode: ManagedDictionaryCode;
  dictionaryName: string;
  options: DictionaryOptionRecord[];
  suggestions: DictionarySuggestionRecord[];
}

export interface DictionaryOptionChange {
  id: string;
  displayName: string;
  sortOrder: number;
  enabled: boolean;
  expectedUpdatedAt: string;
}

export type DictionarySuggestionDecision =
  | { action: "PROMOTE"; displayName: string }
  | { action: "MERGE"; targetOptionId: string }
  | { action: "REJECT"; comment: string };

export interface DictionaryRepository {
  listWorkspace(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode): Promise<DictionaryWorkspace>;
  saveOptions(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode, changes: DictionaryOptionChange[]): Promise<void>;
  createOption(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode, displayName: string): Promise<void>;
  deleteOption(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode, optionId: string, expectedUpdatedAt: string): Promise<void>;
  reviewSuggestion(actor: CollaborationActor, dictionaryCode: ManagedDictionaryCode, suggestionId: string, expectedRowVersion: number, decision: DictionarySuggestionDecision): Promise<void>;
}
