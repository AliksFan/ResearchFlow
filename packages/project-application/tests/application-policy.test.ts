import { describe, expect, it } from "vitest";

import {
  canTransitionProjectApplication,
  validateDraft,
  validateSubmission,
} from "../src/index.js";

const completeSubmission = {
  applicantPersonId: "person-applicant",
  projectName: "虚构脑健康协作研究",
  directionOptionId: "direction-a",
  researchTypeOptionId: "research-type-a",
  projectSummary: "仅包含虚构项目级目标与治理安排。",
  fundingRecordAmountCny: null,
  directionOtherText: null,
  researchTypeOtherText: null,
  directionOptionCode: "NEUROLOGY",
  researchTypeOptionCode: "OBSERVATIONAL",
  owners: [
    { personId: "person-applicant", isPrimary: true, activeKeySubI: true },
  ],
};

describe("project application state policy", () => {
  it.each([
    ["DRAFT", "PENDING_ESTABLISHMENT_REVIEW"],
    ["DRAFT", "CANCELLED"],
    ["PENDING_ESTABLISHMENT_REVIEW", "RETURNED_FOR_REVISION"],
    ["PENDING_ESTABLISHMENT_REVIEW", "ON_HOLD"],
    ["PENDING_ESTABLISHMENT_REVIEW", "REJECTED"],
    ["PENDING_ESTABLISHMENT_REVIEW", "ACTIVE"],
    ["ON_HOLD", "PENDING_ESTABLISHMENT_REVIEW"],
    ["ON_HOLD", "REJECTED"],
    ["RETURNED_FOR_REVISION", "PENDING_ESTABLISHMENT_REVIEW"],
  ] as const)("allows %s -> %s", (from, to) => {
    expect(canTransitionProjectApplication(from, to)).toBe(true);
  });

  it.each([
    ["DRAFT", "ACTIVE"],
    ["ON_HOLD", "ACTIVE"],
    ["RETURNED_FOR_REVISION", "ACTIVE"],
    ["REJECTED", "DRAFT"],
    ["CANCELLED", "DRAFT"],
    ["ACTIVE", "DRAFT"],
  ] as const)("rejects %s -> %s", (from, to) => {
    expect(canTransitionProjectApplication(from, to)).toBe(false);
  });
});

describe("project application field policy", () => {
  it("requires only a project name for the first draft save", () => {
    expect(validateDraft({ projectName: "虚构研究" })).toEqual([]);
    expect(validateDraft({ projectName: "   " })).toEqual([
      "PROJECT_APPLICATION_VALIDATION_FAILED",
    ]);
  });

  it("accepts a complete project-level submission", () => {
    expect(validateSubmission(completeSubmission)).toEqual([]);
  });

  it("requires the applicant in the proposed owner list and exactly one primary", () => {
    expect(validateSubmission({
      ...completeSubmission,
      owners: [
        { personId: "person-other", isPrimary: false, activeKeySubI: true },
      ],
    })).toEqual(expect.arrayContaining([
      "PROJECT_APPLICATION_OWNER_INACTIVE",
      "PROJECT_APPLICATION_PRIMARY_OWNER_INVALID",
    ]));
  });

  it("rejects an inactive proposed Key Sub-I", () => {
    expect(validateSubmission({
      ...completeSubmission,
      owners: [
        { personId: "person-applicant", isPrimary: true, activeKeySubI: false },
      ],
    })).toContain("PROJECT_APPLICATION_OWNER_INACTIVE");
  });

  it.each([null, "0.01", "120000", "120000.50"])(
    "accepts an optional positive CNY funding record amount: %s",
    (fundingRecordAmountCny) => {
      expect(validateSubmission({
        ...completeSubmission,
        fundingRecordAmountCny,
      })).toEqual([]);
    },
  );

  it.each(["0", "-1", "1.001", "not-a-number"])(
    "rejects an invalid funding record amount: %s",
    (fundingRecordAmountCny) => {
      expect(validateSubmission({
        ...completeSubmission,
        fundingRecordAmountCny,
      })).toContain("PROJECT_APPLICATION_VALIDATION_FAILED");
    },
  );

  it("requires an explanation when an OTHER dictionary option is selected", () => {
    expect(validateSubmission({
      ...completeSubmission,
      directionOptionCode: "OTHER",
      directionOtherText: "   ",
    })).toContain("PROJECT_APPLICATION_VALIDATION_FAILED");
  });

  it("rejects an other explanation for a formal dictionary option", () => {
    expect(validateSubmission({
      ...completeSubmission,
      researchTypeOtherText: "自定义研究类型",
    })).toContain("PROJECT_APPLICATION_VALIDATION_FAILED");
  });
});
