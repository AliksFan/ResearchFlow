import type { ReactNode } from "react";

export function ApplicationShell({
  eyebrow,
  title,
  actions,
  children,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <p className="text-sm font-semibold text-teal-700">{eyebrow}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">
            {title}
          </h1>
        </div>
        <nav
          className="flex flex-wrap gap-4 text-sm font-semibold text-teal-700"
          aria-label="项目申请导航"
        >
          {actions}
        </nav>
      </header>
      {children}
    </>
  );
}

export function Feedback({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  if (!error && !success) return null;
  return (
    <div
      role={error ? "alert" : "status"}
      className={`mt-6 rounded-lg border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}
    >
      {error ? errorLabel(error) : success}
    </div>
  );
}

function errorLabel(code: string) {
  const labels: Record<string, string> = {
    PROJECT_APPLICATION_CONFLICT: "数据已被其他操作更新，请刷新后重试。",
    PROJECT_APPLICATION_DUPLICATE_NAME: "该项目名称已被占用，请修改名称。",
    PROJECT_APPLICATION_FORBIDDEN: "当前账号或角色无权执行此操作。",
    PROJECT_APPLICATION_NOT_FOUND: "申请不存在或不在你的访问范围内。",
    PROJECT_APPLICATION_SWIMLANE_INVALID: "申请泳道存在无效阶段、工作流、节点、日期、责任角色或依赖。",
    PROJECT_APPLICATION_TEMPLATE_INVALID: "工作流方案已删除，请重新选择当前可用方案后再提交。",
    PROJECT_APPLICATION_PATIENT_DATA_PROHIBITED:
      "仅允许填写项目级内容，不得录入患者或受试者级信息。",
    PROJECT_APPLICATION_VALIDATION_FAILED: "请检查必填字段和当前操作条件。",
  };
  return labels[code] ?? "操作未完成，请稍后重试并保留追踪信息。";
}
