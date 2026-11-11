import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  MANAGEMENT_DICTIONARIES,
  managementDictionaryCode,
} from "@/components/collaboration/dictionary-management-config";
import { ExecutionShell } from "@/components/collaboration/execution-shell";

describe("management configuration navigation", () => {
  it("only exposes dictionaries backed by current business flows", () => {
    expect(MANAGEMENT_DICTIONARIES).toEqual([
      { code: "DISEASE_AREA", label: "疾病方向" },
      { code: "RESEARCH_TYPE", label: "研究类型" },
      { code: "ISSUE_TYPE", label: "问题类型" },
    ]);
    expect(managementDictionaryCode("UNKNOWN_DICTIONARY")).toBe("DISEASE_AREA");
  });

  it("can omit the project-list link on management pages", () => {
    const html = renderToStaticMarkup(
      <ExecutionShell eyebrow="管理配置" title="字典管理" backHref={null}>
        <p>内容</p>
      </ExecutionShell>,
    );

    expect(html).not.toContain("返回项目列表");
  });

  it("keeps the project-list link by default for project pages", () => {
    const html = renderToStaticMarkup(
      <ExecutionShell eyebrow="项目管理" title="项目总览">
        <p>内容</p>
      </ExecutionShell>,
    );

    expect(html).toContain("返回项目列表");
  });
});
