import type {
  ApplicationSwimlaneInput,
  ProjectApplicationFormOptions,
} from "@researchflow/project-application";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ApplicationSwimlaneEditor } from "@/components/project-application/application-swimlane-editor";

describe("ApplicationSwimlaneEditor", () => {
  it("puts the workflow solution before the full editable swimlane entry", () => {
    const html = renderToStaticMarkup(
      <ApplicationSwimlaneEditor
        projectId="10000000-0000-4000-8000-000000000001"
        applicationVersionId="20000000-0000-4000-8000-000000000001"
        rowVersion={3}
        editable
        initial={swimlane}
        templates={templates}
      />,
    );

    expect(html).toContain("工作流方案");
    expect(html).toContain("基于：虚构标准方案");
    expect(html).toContain("选择或切换方案后，请先保存泳道");
    expect(html).toContain("查看或修改泳道");
    expect(html.indexOf("工作流方案")).toBeLessThan(html.indexOf("查看或修改泳道"));
    expect(html).not.toContain("查看完整泳道图");
    expect(html).not.toContain("阶段目标完成日期");
    expect(html).not.toContain("修改原因");
    expect(html).not.toContain("影响预览");
  });

  it("keeps submitted application swimlanes read-only", () => {
    const html = renderToStaticMarkup(
      <ApplicationSwimlaneEditor
        projectId="10000000-0000-4000-8000-000000000001"
        applicationVersionId="20000000-0000-4000-8000-000000000001"
        rowVersion={4}
        editable={false}
        initial={swimlane}
        templates={templates}
      />,
    );

    expect(html).toContain("查看泳道");
    expect(html).not.toContain("查看或修改泳道");
    expect(html).not.toContain("<select");
  });
});

const swimlane: ApplicationSwimlaneInput & { sourceTemplateName: string | null } = {
  name: "虚构申请泳道",
  expectedRevision: 2,
  sourceTemplateVersionId: "30000000-0000-4000-8000-000000000001",
  sourceTemplateName: "虚构标准方案",
  stages: [{ id: "40000000-0000-4000-8000-000000000001", code: "START", name: "启动", sortOrder: 0, applicability: "REQUIRED", plannedStartDate: "2026-09-01", plannedEndDate: "2026-09-30" }],
  workflows: [{ id: "50000000-0000-4000-8000-000000000001", code: "PREPARE", name: "准备", description: "虚构工作流", sortOrder: 0, enabled: true }],
  nodes: [{ id: "60000000-0000-4000-8000-000000000001", workflowId: "50000000-0000-4000-8000-000000000001", stageId: "40000000-0000-4000-8000-000000000001", taskName: "完成准备", taskDescription: "虚构任务", sortOrder: 0, applicability: "REQUIRED", plannedStartDate: "2026-09-02", plannedEndDate: "2026-09-20", updateIntervalDays: 7, overdueReminderIntervalDays: 3, attachmentRequirement: "OPTIONAL", ownerRoles: ["KEY_SUB_I"], predecessorIds: [] }],
};

const templates: ProjectApplicationFormOptions["lifecycleTemplates"] = [{
  id: "30000000-0000-4000-8000-000000000001",
  displayName: "虚构标准方案",
  description: "仅用于项目级测试",
  stages: [{ id: swimlane.stages[0]!.id, code: "START", displayName: "启动", sortOrder: 0, applicability: "REQUIRED" }],
  workflows: [{ id: swimlane.workflows[0]!.id, code: "PREPARE", displayName: "准备", description: "虚构工作流", sortOrder: 0, enabled: true }],
  nodes: [{ id: swimlane.nodes[0]!.id, workflowId: swimlane.workflows[0]!.id, stageId: swimlane.stages[0]!.id, displayName: "完成准备", applicability: "REQUIRED", predecessorIds: [], sortOrder: 0, ownerRoles: ["KEY_SUB_I"], attachmentRequirement: "OPTIONAL" }],
}];
