import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DictionaryManagement } from "@/components/collaboration/dictionary-management";

describe("DictionaryManagement", () => {
  it("offers deletion only for unreferenced ordinary options", () => {
    const html = renderToStaticMarkup(<DictionaryManagement workspace={{
      dictionaryCode: "RESEARCH_TYPE",
      dictionaryName: "研究类型",
      options: [
        { id: "free", optionCode: "OPT-FREE", displayName: "虚构类型", sortOrder: 10, enabled: true, systemReserved: false, referenceCount: 0, expectedUpdatedAt: "2026-09-08T05:00:00.000Z" },
        { id: "used", optionCode: "OPT-USED", displayName: "已用类型", sortOrder: 20, enabled: true, systemReserved: false, referenceCount: 2, expectedUpdatedAt: "2026-09-08T05:00:00.000Z" },
        { id: "other", optionCode: "OTHER", displayName: "其它", sortOrder: 9999, enabled: true, systemReserved: true, referenceCount: 0, expectedUpdatedAt: "2026-09-08T05:00:00.000Z" },
      ],
      suggestions: [],
    }} />);
    expect(html).toContain("删除虚构类型");
    expect(html).toContain("已引用，仅可停用");
    expect(html).toContain("系统保留，不可删除");
    expect(html.indexOf("OTHER")).toBeGreaterThan(html.indexOf("OPT-USED"));
  });
});
