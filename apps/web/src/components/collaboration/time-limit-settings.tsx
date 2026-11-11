"use client";

import { useActionState, useEffect, useMemo, useState } from "react";

import {
  COLLABORATION_RESPONSIBILITY_TYPES,
  type CollaborationResponsibilityType,
  type CollaborationTimeLimit,
  type EffectiveCollaborationTimeLimit,
} from "@researchflow/collaboration";
import { useRouter } from "next/navigation";

import type { TimeLimitFormResult } from "@/app/workspace/collaboration-actions";

const labels: Record<CollaborationResponsibilityType, string> = {
  WORKFLOW_COMPLETION_PMO_REVIEW: "节点完成 PMO 审核",
  PROJECT_COMPLETION_PMO_REVIEW: "结题 PMO 审核",
  PROJECT_COMPLETION_SUPPLEMENT: "结题材料补充",
  ISSUE_DEAN_DECISION: "院长决定",
  ISSUE_PMO_IMPLEMENTATION: "PMO 落实",
  ISSUE_REPORTER_SUPPLEMENT: "提报人补充",
  ISSUE_REPORTER_CONFIRMATION: "提报人确认",
};

export function CollaborationTimeLimitTable({
  settings,
  projectId,
  configureAction,
}: {
  settings: Array<CollaborationTimeLimit | EffectiveCollaborationTimeLimit>;
  projectId?: string;
  configureAction?: (formData: FormData) => Promise<void>;
}) {
  const isProjectTable = Boolean(projectId);
  const isEditable = Boolean(projectId && configureAction);
  async function submitProjectChanges(formData: FormData): Promise<void> {
    if (!projectId || !configureAction) return;
    const changes = new FormData();
    changes.set("projectId", projectId);
    for (const setting of settings) {
      if (!("source" in setting)) continue;
      const type = setting.responsibilityType;
      const mode = formData.get(`${type}:mode`);
      const initialMode = setting.source === "PROJECT_OVERRIDE" ? "PROJECT_OVERRIDE" : "FOLLOW_GLOBAL";
      const days = formData.get(`${type}:days`);
      const reminder = formData.get(`${type}:reminder`);
      const valuesChanged = mode === "PROJECT_OVERRIDE" &&
        (Number(days) !== setting.timeLimitDays || Number(reminder) !== setting.reminderIntervalDays);
      if (mode === initialMode && !valuesChanged) continue;
      changes.append("responsibilityType", type);
      changes.append("mode", String(mode));
      changes.append("timeLimitDays", String(days ?? ""));
      changes.append("reminderIntervalDays", String(reminder ?? ""));
      changes.append("expectedProjectSettingUpdatedAt", setting.source === "PROJECT_OVERRIDE" ? setting.updatedAt : "");
    }
    await configureAction(changes);
  }
  return (
    <form action={submitProjectChanges} className="mt-4">
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            <th className="py-2">责任类型</th>
            <th>{isProjectTable ? "来源" : "范围"}</th>
            <th>时限</th>
            <th>提醒周期</th>
            {isEditable ? <th>设置方式</th> : null}
          </tr>
        </thead>
        <tbody>
          {settings.map((setting) => {
            return isEditable && "source" in setting ? (
              <EditableProjectTimeLimitRow key={setting.responsibilityType} setting={setting} />
            ) : (
              <tr key={setting.responsibilityType} className="border-b border-slate-100">
                <td className="py-2">
                  {responsibilityLabel(setting.responsibilityType)}
                </td>
                <td>
                  {isProjectTable && "source" in setting
                    ? setting.source === "PROJECT_OVERRIDE" ? "项目单独设置" : "全局默认"
                    : setting.projectId ? "本项目" : "全局默认"}
                </td>
                <td>
                  {`${setting.timeLimitDays} 天`}
                </td>
                <td>
                  {`${setting.reminderIntervalDays} 天`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {isEditable ? <div className="mt-4 flex justify-end"><button className="button-primary" type="submit">保存修改</button></div> : null}
    </form>
  );
}

export function GlobalCollaborationTimeLimitEditor({
  settings,
  saveAction,
}: {
  settings: CollaborationTimeLimit[];
  saveAction: (previous: TimeLimitFormResult, formData: FormData) => Promise<TimeLimitFormResult>;
}) {
  const router = useRouter();
  const baseline = useMemo(() => Object.fromEntries(settings.map((setting) => [setting.responsibilityType, { days: setting.timeLimitDays, reminder: setting.reminderIntervalDays }])), [settings]);
  const [values, setValues] = useState(baseline);
  const [state, action, pending] = useActionState(async (previous: TimeLimitFormResult) => {
    const changes = new FormData();
    for (const setting of settings) {
      const value = values[setting.responsibilityType];
      if (!value || (value.days === setting.timeLimitDays && value.reminder === setting.reminderIntervalDays)) continue;
      changes.append("responsibilityType", setting.responsibilityType);
      changes.append("timeLimitDays", String(value.days));
      changes.append("reminderIntervalDays", String(value.reminder));
      changes.append("expectedUpdatedAt", setting.updatedAt);
    }
    return saveAction(previous, changes);
  }, { ok: false, message: "" });
  const dirty = settings.some((setting) => {
    const value = values[setting.responsibilityType];
    return value && (value.days !== setting.timeLimitDays || value.reminder !== setting.reminderIntervalDays);
  });

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [router, state.ok]);

  return <form action={action}>
    <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b border-slate-200"><th className="py-3 font-semibold">责任类型</th><th className="font-semibold">时限（自然日）</th><th className="font-semibold">提醒周期（自然日）</th></tr></thead><tbody>{settings.map((setting) => { const value = values[setting.responsibilityType] ?? { days: setting.timeLimitDays, reminder: setting.reminderIntervalDays }; return <tr key={setting.responsibilityType} className="border-b border-slate-100"><td className="py-3 font-medium text-slate-800">{responsibilityLabel(setting.responsibilityType)}</td><td><label className="sr-only" htmlFor={`global-${setting.responsibilityType}-days`}>时限（自然日）</label><input id={`global-${setting.responsibilityType}-days`} className="field-control max-w-32" type="number" min="1" step="1" value={value.days} onChange={(event) => setValues((current) => ({ ...current, [setting.responsibilityType]: { ...value, days: Number(event.target.value) } }))} /></td><td><label className="sr-only" htmlFor={`global-${setting.responsibilityType}-reminder`}>提醒周期（自然日）</label><input id={`global-${setting.responsibilityType}-reminder`} className="field-control max-w-32" type="number" min="1" step="1" value={value.reminder} onChange={(event) => setValues((current) => ({ ...current, [setting.responsibilityType]: { ...value, reminder: Number(event.target.value) } }))} /></td></tr>; })}</tbody></table></div>
    {state.message ? <p role={state.ok ? "status" : "alert"} className={`mt-4 rounded-lg border px-4 py-3 text-sm ${state.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{state.message}</p> : null}
    <div className="mt-5 flex justify-end"><button className="button-primary disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={!dirty || pending}>{pending ? "正在保存…" : "保存修改"}</button></div>
  </form>;
}

function EditableProjectTimeLimitRow({ setting }: { setting: EffectiveCollaborationTimeLimit }) {
  const initialMode = setting.source === "PROJECT_OVERRIDE" ? "PROJECT_OVERRIDE" : "FOLLOW_GLOBAL";
  const [mode, setMode] = useState(initialMode);
  const type = setting.responsibilityType;
  const editable = mode === "PROJECT_OVERRIDE";
  return (
    <tr className="border-b border-slate-100">
      <td className="py-2">{responsibilityLabel(type)}</td>
      <td>{mode === "PROJECT_OVERRIDE" ? "项目单独设置" : "全局默认"}</td>
      <td>
        <label className="sr-only" htmlFor={`${type}-days`}>{responsibilityLabel(type)}时限（天）</label>
        <input id={`${type}-days`} className="field-control max-w-28" name={`${type}:days`} type="number" min="1" step="1" defaultValue={setting.timeLimitDays} readOnly={!editable} required={editable} />
      </td>
      <td>
        <label className="sr-only" htmlFor={`${type}-reminder`}>{responsibilityLabel(type)}提醒周期（天）</label>
        <input id={`${type}-reminder`} className="field-control max-w-28" name={`${type}:reminder`} type="number" min="1" step="1" defaultValue={setting.reminderIntervalDays} readOnly={!editable} required={editable} />
      </td>
      <td>
        <label className="sr-only" htmlFor={`${type}-mode`}>{responsibilityLabel(type)}设置方式</label>
        <select id={`${type}-mode`} className="field-control" name={`${type}:mode`} value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
          <option value="FOLLOW_GLOBAL">跟随全局默认</option>
          <option value="PROJECT_OVERRIDE">项目单独设置</option>
        </select>
      </td>
    </tr>
  );
}

export function CollaborationResponsibilityOptions() {
  return COLLABORATION_RESPONSIBILITY_TYPES.map((type) => (
    <option key={type} value={type}>{responsibilityLabel(type)}</option>
  ));
}

export function responsibilityLabel(type: CollaborationResponsibilityType): string {
  return labels[type];
}
