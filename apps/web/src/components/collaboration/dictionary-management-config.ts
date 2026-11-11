import type { ManagedDictionaryCode } from "@researchflow/collaboration";

export const MANAGEMENT_DICTIONARIES = [
  { code: "DISEASE_AREA", label: "疾病方向" },
  { code: "RESEARCH_TYPE", label: "研究类型" },
  { code: "ISSUE_TYPE", label: "问题类型" },
] as const satisfies ReadonlyArray<{
  code: ManagedDictionaryCode;
  label: string;
}>;

export type ManagementDictionaryCode = (typeof MANAGEMENT_DICTIONARIES)[number]["code"];

export function managementDictionaryCode(value: string | undefined): ManagementDictionaryCode {
  return MANAGEMENT_DICTIONARIES.find(({ code }) => code === value)?.code
    ?? MANAGEMENT_DICTIONARIES[0].code;
}
