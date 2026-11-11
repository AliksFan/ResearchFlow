import type {
  ProjectBasicInformationChangeSummary,
  ProjectBasicInformationWorkspace,
  ProjectExecutionOverview,
} from "@researchflow/collaboration";
import { randomUUID } from "node:crypto";

type ServerAction = (formData: FormData) => Promise<void>;

export function ProjectBasicInformation({ overview, recordedUsedAmount, workspace, editOpen = false, submitAction, decideAction }: {
  overview: ProjectExecutionOverview;
  recordedUsedAmount: string;
  workspace?: ProjectBasicInformationWorkspace;
  editOpen?: boolean;
  submitAction?: ServerAction;
  decideAction?: ServerAction;
}) {
  const info = overview.basicInformation;
  const activeRequest = workspace?.activeRequest ?? null;
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-semibold text-slate-950">项目基础信息</h2><p className="mt-1 text-sm text-slate-600">当前正式项目概况</p></div>
        {workspace?.canSubmit && !editOpen ? <a href="?panel=basic-information-edit" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">修改基础信息</a> : null}
      </header>
      {activeRequest ? <ActiveRequest request={activeRequest} projectId={overview.projectId} decideAction={decideAction} /> : null}
      <div className="mt-6 rounded-xl bg-slate-50 p-4 sm:p-5"><p className="text-xs font-semibold text-slate-500">项目简介</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{value(info.projectSummary)}</p></div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Item term="研究方向" value={value(info.diseaseAreaDisplayName)} />
        <Item term="研究类型" value={value(info.researchTypeDisplayName)} />
        <Item term="主 Key Sub-I" value={value(info.primaryKeySubIDisplayName)} />
        <Item term="共同负责人" value={info.otherKeySubIDisplayNames.join("、") || "暂无"} />
        <Item term="牵头单位" value={value(info.leadOrganizationName)} />
        <Item term="申办方" value={value(info.sponsorName)} />
        <FundingSummary total={info.fundingRecordAmountCny} used={recordedUsedAmount} />
      </dl>
      <details className="mt-5 rounded-xl border border-slate-200"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">建档记录</summary><dl className="grid gap-3 border-t border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-4"><Item term="申请编号" value={info.applicationCode} /><Item term="申请人" value={info.applicantDisplayName} /><Item term="建档人" value={value(info.establishedByDisplayName)} /><Item term="建档时间" value={dateTime(info.establishedAt)} /></dl></details>
      {workspace?.history.length ? <ChangeHistory history={workspace.history} /> : null}
      {editOpen && workspace?.canSubmit && submitAction ? <EditDialog workspace={workspace} submitAction={submitAction} /> : null}
    </section>
  );
}

function ActiveRequest({ request, projectId, decideAction }: { request: ProjectBasicInformationChangeSummary; projectId: string; decideAction?: ServerAction }) {
  const actionLabel = request.canApply ? (request.status === "PENDING_PMO_REVIEW" ? "审核变更" : "确认变更") : "查看变更";
  return <details className="mt-5 rounded-xl border border-amber-200 bg-amber-50" open={request.canApply}><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-amber-950">{actionLabel} · {statusLabel(request.status)}</summary><div className="border-t border-amber-200 p-4"><RequestDetails request={request} />{request.canApply && decideAction ? <form action={decideAction} className="mt-4 grid gap-3"><input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="requestId" value={request.requestId} /><label className="grid gap-1 text-sm font-medium text-slate-800">处理说明（退回时必填）<textarea name="note" rows={3} maxLength={500} className="rounded-lg border border-slate-300 bg-white px-3 py-2" /></label><div className="flex flex-wrap gap-2"><button name="decision" value="APPLY" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">确认并应用</button><button name="decision" value="RETURN" className="rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-700">退回并关闭</button></div></form> : null}</div></details>;
}

function EditDialog({ workspace, submitAction }: { workspace: ProjectBasicInformationWorkspace; submitAction: ServerAction }) {
  const values = workspace.values;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><a href="?" className="absolute inset-0" aria-label="关闭基础信息修改" /><section role="dialog" aria-modal="true" aria-label="修改项目基础信息" className="relative z-10 max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><header className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">修改项目基础信息</h2><p className="mt-1 text-sm text-slate-600">提交后由另一责任角色确认，确认前首屏仍显示当前正式值。</p></div><a href="?" className="rounded-lg px-2 py-1 text-2xl text-slate-500" aria-label="关闭">×</a></header><form action={submitAction} className="mt-6 grid gap-4 sm:grid-cols-2"><input type="hidden" name="commandId" value={randomUUID()} /><input type="hidden" name="projectId" value={workspace.projectId} /><Field label="项目名称" name="projectName" defaultValue={values.projectName} required /><label className="grid gap-1 text-sm font-medium text-slate-800 sm:col-span-2">项目简介<textarea name="projectSummary" defaultValue={values.projectSummary} rows={5} required className="rounded-lg border border-slate-300 px-3 py-2" /></label><DictionaryField label="研究方向" name="diseaseAreaOptionId" defaultValue={values.diseaseAreaOptionId} options={workspace.dictionaryOptions.diseaseAreas} /><Field label="研究方向（选择其他时填写）" name="diseaseAreaOtherText" defaultValue={values.diseaseAreaOtherText ?? ""} /><DictionaryField label="研究类型" name="researchTypeOptionId" defaultValue={values.researchTypeOptionId} options={workspace.dictionaryOptions.researchTypes} /><Field label="研究类型（选择其他时填写）" name="researchTypeOtherText" defaultValue={values.researchTypeOtherText ?? ""} /><Field label="牵头单位（可清空）" name="leadOrganizationName" defaultValue={values.leadOrganizationName ?? ""} /><Field label="申办方（可清空）" name="sponsorName" defaultValue={values.sponsorName ?? ""} /><Field label="项目级经费记录总额（元，可清空）" name="fundingRecordAmountCny" defaultValue={values.fundingRecordAmountCny ?? ""} inputMode="decimal" /><Field label="变更原因" name="reason" defaultValue="" required maxLength={500} /><p className="text-xs leading-5 text-slate-500 sm:col-span-2">只允许项目级信息，不得填写患者、受试者、病历、检查报告或 CRF/EDC 明细。</p><div className="flex justify-end gap-2 sm:col-span-2"><a href="?" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">取消</a><button className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">提交变更</button></div></form></section></div>;
}

function ChangeHistory({ history }: { history: ProjectBasicInformationChangeSummary[] }) { return <details className="mt-5 rounded-xl border border-slate-200"><summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">变更记录（{history.length}）</summary><div className="grid gap-3 border-t border-slate-200 p-4">{history.map((request) => <article key={request.requestId} className="rounded-lg bg-slate-50 p-4"><RequestDetails request={request} /></article>)}</div></details>; }
function RequestDetails({ request }: { request: ProjectBasicInformationChangeSummary }) { return <div><p className="text-sm font-semibold text-slate-900">{request.submittedByDisplayName} · {statusLabel(request.status)}</p><p className="mt-1 text-xs text-slate-600">{dateTime(request.submittedAt)} · 原因：{request.reason}</p><dl className="mt-3 grid gap-2">{request.items.map((item) => <div key={item.fieldCode} className="grid gap-1 rounded-lg bg-white p-3 text-sm sm:grid-cols-[8rem_1fr]"><dt className="font-medium text-slate-600">{fieldLabel(item.fieldCode)}</dt><dd className="break-words text-slate-900">{item.oldDisplayValue} → {item.newDisplayValue}</dd></div>)}</dl></div>; }
function DictionaryField({ label, name, defaultValue, options }: { label: string; name: string; defaultValue: string; options: Array<{ id: string; label: string }> }) { return <label className="grid gap-1 text-sm font-medium text-slate-800">{label}<select name={name} defaultValue={defaultValue} required className="rounded-lg border border-slate-300 bg-white px-3 py-2"><option value="" disabled>请选择</option>{options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>; }
function Field({ label, name, defaultValue, required = false, maxLength, inputMode }: { label: string; name: string; defaultValue: string; required?: boolean; maxLength?: number; inputMode?: "decimal" }) { return <label className="grid gap-1 text-sm font-medium text-slate-800">{label}<input name={name} defaultValue={defaultValue} required={required} maxLength={maxLength} inputMode={inputMode} className="rounded-lg border border-slate-300 px-3 py-2" /></label>; }
function FundingSummary({ total, used }: { total: string | null; used: string }) { const usedValue = decimal(used); const totalValue = total === null ? null : decimal(total); const second = totalValue === null ? "未用无法计算" : usedValue <= totalValue ? `未用 ${money(totalValue - usedValue)}` : `超出 ${money(usedValue - totalValue)}`; return <div className="rounded-xl bg-teal-50 p-4 sm:col-span-2"><dt className="text-xs font-semibold text-teal-700">经费使用概况</dt><dd className="mt-2 text-base font-semibold text-slate-900">已用 {money(usedValue)} / {second}</dd><p className="mt-1 text-xs leading-5 text-slate-600">项目进展记录口径，不作为财务结余或账务结论。</p></div>; }
function Item({ term, value: content }: { term: string; value: string }) { return <div className="min-w-0 rounded-xl bg-slate-50 p-4"><dt className="text-xs font-semibold text-slate-500">{term}</dt><dd className="mt-1 break-words whitespace-pre-wrap text-sm font-medium text-slate-800">{content}</dd></div>; }
function value(input: string | null) { return input?.trim() || "未填写"; }
function decimal(input: string) { const parsed = Number(input); return Number.isFinite(parsed) ? parsed : 0; }
function money(input: number) { return `¥${new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(input)}`; }
function dateTime(input: string | null) { return input ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date(input)) : "未设置"; }
function statusLabel(status: ProjectBasicInformationChangeSummary["status"]) { return ({ PENDING_PMO_REVIEW: "待 PMO 审核", PENDING_PRIMARY_KEY_SUB_I_REVIEW: "待主 Key Sub-I 确认", APPLIED: "已生效", STALE: "已失效", CLOSED: "已关闭" } as const)[status]; }
function fieldLabel(code: ProjectBasicInformationChangeSummary["items"][number]["fieldCode"]) { return ({ PROJECT_NAME: "项目名称", PROJECT_SUMMARY: "项目简介", DISEASE_AREA: "研究方向", RESEARCH_TYPE: "研究类型", LEAD_ORGANIZATION_NAME: "牵头单位", SPONSOR_NAME: "申办方", FUNDING_RECORD_AMOUNT_CNY: "经费记录总额" } as const)[code]; }
