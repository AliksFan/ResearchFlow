import { describe, expect, it } from "vitest";

import {
  PRODUCTION_DICTIONARY_REFERENCE_DATA,
  ISSUE_TYPE_REFERENCE_DATA,
  planProductionReferenceDataReconciliation,
} from "../scripts/reference-data.js";

describe("production dictionary reference data", () => {
  it("requires reserved OTHER as the last item in all three dictionaries", () => {
    expect(PRODUCTION_DICTIONARY_REFERENCE_DATA.map(({ dictionaryCode, options }) => ({
      dictionaryCode,
      other: options.find(({ optionCode }) => optionCode === "OTHER"),
    }))).toEqual([
      { dictionaryCode: "DISEASE_AREA", other: { optionCode: "OTHER", displayName: "其它", sortOrder: 9999 } },
      { dictionaryCode: "RESEARCH_TYPE", other: { optionCode: "OTHER", displayName: "其它", sortOrder: 9999 } },
      { dictionaryCode: "ISSUE_TYPE", other: { optionCode: "OTHER", displayName: "其它", sortOrder: 9999 } },
    ]);
  });

  it("reports missing dictionaries and approved options", () => {
    const plan = planProductionReferenceDataReconciliation([]);
    expect(plan.missingDictionaryCodes).toEqual(["DISEASE_AREA", "RESEARCH_TYPE", "ISSUE_TYPE"]);
    expect(plan.missingOptions).toHaveLength(7);
    expect(plan.conflicts).toEqual([]);
  });

  it("plans legacy manual cleanup and normalizes the former issue label atomically", () => {
    const plan = planProductionReferenceDataReconciliation([
      { dictionaryCode: "DISEASE_AREA", dictionaryName: "疾病方向", options: [] },
      { dictionaryCode: "RESEARCH_TYPE", dictionaryName: "研究类型", options: [
        { id: "manual-other", optionCode: "OPT-EC72EB6F", displayName: "其它", sortOrder: 9999, enabled: true, referenceCount: 0 },
      ] },
      { dictionaryCode: "ISSUE_TYPE", dictionaryName: "问题类型", options: ISSUE_TYPE_REFERENCE_DATA.options.map((option) => ({
        id: option.optionCode,
        ...option,
        displayName: option.optionCode === "OTHER" ? "其他" : option.displayName,
        sortOrder: option.optionCode === "OTHER" ? 50 : option.sortOrder,
        enabled: true,
        referenceCount: 0,
      })) },
    ]);
    expect(plan.legacyOptionsToDelete).toEqual([{ dictionaryCode: "RESEARCH_TYPE", id: "manual-other", optionCode: "OPT-EC72EB6F", displayName: "其它" }]);
    expect(plan.optionsToNormalize).toEqual([{ dictionaryCode: "ISSUE_TYPE", optionCode: "OTHER", displayName: "其它", sortOrder: 9999, enabled: true }]);
    expect(plan.missingOptions.map(({ dictionaryCode, optionCode }) => `${dictionaryCode}:${optionCode}`)).toEqual([
      "DISEASE_AREA:OTHER",
      "RESEARCH_TYPE:OTHER",
    ]);
    expect(plan.blockers).toEqual([]);
  });

  it("blocks cleanup when a manual other item has references and rejects unrelated reserved-name conflicts", () => {
    const plan = planProductionReferenceDataReconciliation([
      { dictionaryCode: "DISEASE_AREA", dictionaryName: "疾病方向", options: [
        { id: "used-other", optionCode: "OPT-USED", displayName: "其它", sortOrder: 5, enabled: true, referenceCount: 1 },
        { id: "reserved", optionCode: "OTHER", displayName: "错误名称", sortOrder: 9999, enabled: true, referenceCount: 0 },
      ] },
    ]);
    expect(plan.blockers).toEqual([{ dictionaryCode: "DISEASE_AREA", optionCode: "OPT-USED", reason: "LEGACY_OTHER_IN_USE", referenceCount: 1 }]);
    expect(plan.conflicts).toEqual([{ dictionaryCode: "DISEASE_AREA", optionCode: "OTHER", expected: "其它", actual: "错误名称" }]);
  });
});
