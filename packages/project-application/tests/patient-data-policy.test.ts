import { describe, expect, it } from "vitest";

import { containsProhibitedPatientData } from "../src/index.js";

describe("containsProhibitedPatientData", () => {
  it.each([
    "患者姓名：某某",
    "住院号 123456",
    "身份证号 000000",
    "附受试者明细",
    "上传 CRF 原始数据",
  ])("rejects prohibited patient-level content: %s", (value) => {
    expect(containsProhibitedPatientData(value)).toBe(true);
  });

  it("allows virtual project-level planning text", () => {
    expect(containsProhibitedPatientData("虚构项目计划仅包含项目级治理安排。"))
      .toBe(false);
  });
});
