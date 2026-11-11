"use client";

import type { AccountStatus, PmoManagementSnapshot, RoleCode } from "@researchflow/auth";
import { useActionState, useMemo, useState } from "react";

import {
  changeManagedAccountStatusAction,
  createAccountAction,
  endKeySubIEligibilityAction,
  endRoleAction,
  grantKeySubIEligibilityAction,
  grantRoleAction,
  issueCredentialAction,
  type PmoFormResult,
} from "@/app/auth-actions";
import { InfoTip } from "@/components/workspace/info-tip";

const initial: PmoFormResult = { ok: false, message: "" };
const roles: RoleCode[] = ["PMO", "DEAN", "KEY_SUB_I", "CRC", "STATISTICIAN", "COLLABORATION_LEAD"];
const roleLabels: Record<RoleCode, string> = {
  PMO: "PMO", DEAN: "院长", KEY_SUB_I: "Key Sub-I", CRC: "CRC",
  STATISTICIAN: "统计师", COLLABORATION_LEAD: "协作负责人",
};
const statusLabels: Record<AccountStatus, string> = {
  INVITED: "待激活", ACTIVE: "正常", LOCKED: "已锁定", DISABLED: "已停用",
};
type Person = PmoManagementSnapshot["people"][number];
type Tab = "profile" | "roles" | "eligibility" | "security";

export function PmoManagementPanel({ snapshot }: { snapshot: PmoManagementSnapshot }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<AccountStatus | "ALL">("ALL");
  const [role, setRole] = useState<RoleCode | "ALL">("ALL");
  const [createOpen, setCreateOpen] = useState(false);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [managedId, setManagedId] = useState<string | null>(null);
  const activeAssignments = useMemo(
    () => snapshot.assignments.filter((item) => item.assignmentStatus === "ACTIVE"),
    [snapshot.assignments],
  );
  const people = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return snapshot.people.filter((person) =>
      (!normalized || `${person.displayName} ${person.loginName}`.toLocaleLowerCase().includes(normalized)) &&
      (status === "ALL" || person.accountStatus === status) &&
      (role === "ALL" || activeAssignments.some((item) => item.personId === person.id && item.roleCode === role)),
    );
  }, [activeAssignments, query, role, snapshot.people, status]);
  const managedPerson = snapshot.people.find((person) => person.id === managedId) ?? null;

  return <div className="space-y-5">
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-semibold">账号列表</h2><p className="mt-1 text-sm text-slate-500">共 {snapshot.people.length} 个账号，当前显示 {people.length} 个</p></div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMatrixOpen(true)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">权限矩阵</button>
          <button type="button" onClick={() => setCreateOpen(true)} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">新建账号</button>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(14rem,1fr)_12rem_12rem]">
        <label><span className="sr-only">搜索姓名或登录名</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓名或登录名" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" /></label>
        <label><span className="sr-only">账号状态</span><select value={status} onChange={(event) => setStatus(event.target.value as AccountStatus | "ALL")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="ALL">全部账号状态</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span className="sr-only">有效角色</span><select value={role} onChange={(event) => setRole(event.target.value as RoleCode | "ALL")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"><option value="ALL">全部有效角色</option>{roles.map((value) => <option key={value} value={value}>{roleLabels[value]}</option>)}</select></label>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead><tr className="border-b border-slate-200 text-slate-600"><th className="px-3 py-3">用户</th><th className="px-3 py-3">登录名</th><th className="px-3 py-3">账号状态</th><th className="px-3 py-3">有效角色</th><th className="px-3 py-3">项目范围</th><th className="px-3 py-3">密码状态</th><th className="px-3 py-3 text-right">管理</th></tr></thead>
          <tbody>{people.map((person) => {
            const assignments = activeAssignments.filter((item) => item.personId === person.id);
            const projectCount = new Set(assignments.map((item) => item.projectId).filter(Boolean)).size;
            const scope = projectCount ? `${projectCount} 个项目` : assignments.some((item) => item.projectId === null) ? "全局" : "—";
            return <tr key={person.id} className="border-b border-slate-100 align-top"><td className="px-3 py-4 font-medium">{person.displayName}</td><td className="px-3 py-4 font-mono text-xs text-slate-600">{person.loginName}</td><td className="px-3 py-4"><StatusBadge status={person.accountStatus} /></td><td className="px-3 py-4"><RoleBadges assignments={assignments} /></td><td className="px-3 py-4 text-slate-600">{scope}</td><td className="px-3 py-4 text-slate-600">{person.passwordSet ? person.mustChangePassword ? "需修改密码" : "已设置" : "未设置"}</td><td className="px-3 py-4 text-right"><button type="button" onClick={() => setManagedId(person.id)} className="rounded-lg border border-teal-200 px-3 py-1.5 font-semibold text-teal-700">管理</button></td></tr>;
          })}</tbody>
        </table>
        {people.length === 0 ? <p className="py-12 text-center text-sm text-slate-500">没有符合筛选条件的账号。</p> : null}
      </div>
    </section>
    {createOpen ? <CreateDialog onClose={() => setCreateOpen(false)} /> : null}
    {matrixOpen ? <MatrixDialog onClose={() => setMatrixOpen(false)} /> : null}
    {managedPerson ? <ManageDialog person={managedPerson} snapshot={snapshot} onClose={() => setManagedId(null)} /> : null}
  </div>;
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(createAccountAction, initial);
  return <Modal title="新建账号" description="账号以待激活状态创建，不会自动获得角色或项目权限。" onClose={onClose}><form action={action} className="space-y-4"><Field name="displayName" label="显示名称" /><Field name="loginName" label="登录名" /><Result state={state} /><Actions onClose={onClose}><Submit pending={pending} label="创建账号" /></Actions></form></Modal>;
}

function MatrixDialog({ onClose }: { onClose: () => void }) {
  const rows = [["PMO", "管理配置、项目治理与审核", "全局"], ["院长", "项目组合与决策信息只读", "全局"], ["Key Sub-I", "负责项目与项目申请", "项目"], ["支持角色", "按职责参与项目协作", "项目"]];
  return <Modal title="权限矩阵" description="实际授权始终由服务端按角色和项目范围校验。" onClose={onClose}><table className="w-full text-left text-sm"><thead><tr className="border-b text-slate-600"><th className="py-3">角色</th><th>主要能力</th><th>范围</th></tr></thead><tbody>{rows.map(([name, ability, scope]) => <tr key={name} className="border-b border-slate-100"><td className="py-3 font-medium">{name}</td><td>{ability}</td><td>{scope}</td></tr>)}</tbody></table><Actions onClose={onClose} /></Modal>;
}

function ManageDialog({ person, snapshot, onClose }: { person: Person; snapshot: PmoManagementSnapshot; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("profile");
  const tabs: Array<[Tab, string]> = [["profile", "账号信息"], ["roles", "角色与项目授权"], ["eligibility", "Key Sub-I 申请资格"], ["security", "账号安全"]];
  return <Modal wide title={`管理账号 · ${person.displayName}`} description={`${person.loginName} · ${statusLabels[person.accountStatus]}`} onClose={onClose}>
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist" aria-label="账号管理">{tabs.map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold ${tab === value ? "border-teal-700 text-teal-700" : "border-transparent text-slate-500"}`}>{label}</button>)}</div>
    {tab === "profile" ? <Profile person={person} /> : null}
    {tab === "roles" ? <RoleManagement person={person} snapshot={snapshot} /> : null}
    {tab === "eligibility" ? <Eligibility person={person} snapshot={snapshot} /> : null}
    {tab === "security" ? <Security person={person} /> : null}
    <Actions onClose={onClose} />
  </Modal>;
}

function Profile({ person }: { person: Person }) {
  const [state, action, pending] = useActionState(changeManagedAccountStatusAction, initial);
  return <div className="space-y-5">
    <dl className="grid gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-2"><Definition term="显示名称" value={person.displayName} /><Definition term="登录名" value={person.loginName} /><Definition term="账号状态" value={statusLabels[person.accountStatus]} /><Definition term="密码状态" value={person.passwordSet ? person.mustChangePassword ? "已设置，登录后须修改" : "已设置" : "未设置"} /></dl>
    <form action={action} className="grid gap-3 rounded-lg border border-slate-200 p-4 sm:grid-cols-[1fr_auto]"><input type="hidden" name="targetPersonId" value={person.id} /><label className="text-sm"><span className="mb-1 block font-medium">账号状态操作</span><select name="operation" className="w-full rounded-lg border border-slate-300 px-3 py-2"><option value="MANUAL_LOCK">锁定账号</option><option value="UNLOCK">解除锁定</option><option value="DISABLE">停用账号</option><option value="REENABLE">重新启用</option></select></label><div className="self-end"><Submit pending={pending} label="更新状态" /></div><div className="sm:col-span-2"><Result state={state} /></div></form>
  </div>;
}

function RoleManagement({ person, snapshot }: { person: Person; snapshot: PmoManagementSnapshot }) {
  const [grantState, grantAction, granting] = useActionState(grantRoleAction, initial);
  const [endState, endAction, ending] = useActionState(endRoleAction, initial);
  const assignments = snapshot.assignments.filter((item) => item.personId === person.id && item.assignmentStatus === "ACTIVE");
  return <div className="space-y-5">
    <form action={grantAction} className="grid gap-3 rounded-lg border border-slate-200 p-4 lg:grid-cols-[1fr_1.4fr_auto]"><input type="hidden" name="targetPersonId" value={person.id} /><label className="text-sm"><span className="mb-1 block font-medium">角色</span><select name="roleCode" className="w-full rounded-lg border border-slate-300 px-3 py-2">{roles.map((value) => <option key={value} value={value}>{roleLabels[value]}</option>)}</select></label><label className="text-sm"><span className="mb-1 flex items-center gap-1 font-medium">项目范围 <InfoTip label="查看项目范围规则">PMO 和院长使用全局范围；其他角色必须选择项目。</InfoTip></span><select name="projectId" className="w-full rounded-lg border border-slate-300 px-3 py-2"><option value="">全局（仅 PMO / 院长）</option>{snapshot.projects.map((project) => <option key={project.id} value={project.id}>{project.projectCode ?? "未编号"} · {project.projectName}</option>)}</select></label><div className="self-end"><Submit pending={granting} label="授予角色" /></div><div className="lg:col-span-3"><Result state={grantState} /></div></form>
    <section><h3 className="mb-2 text-sm font-semibold">当前有效授权</h3><div className="space-y-2">{assignments.length ? assignments.map((assignment) => {
      const project = snapshot.projects.find((item) => item.id === assignment.projectId);
      const label = `${roleLabels[assignment.roleCode]} · ${project ? `${project.projectCode ?? "未编号"} ${project.projectName}` : "全局"}`;
      if (assignment.roleCode === "KEY_SUB_I" && assignment.isPrimary) return <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><span className="text-sm">{label}</span><span className="text-sm font-medium text-amber-800">需先办理负责人移交</span></div>;
      return <form key={assignment.id} action={endAction} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"><input type="hidden" name="assignmentId" value={assignment.id} /><span className="text-sm">{label}</span><Submit pending={ending} label="结束授权" secondary /></form>;
    }) : <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">当前没有有效角色授权。</p>}</div><Result state={endState} /></section>
  </div>;
}

function Eligibility({ person, snapshot }: { person: Person; snapshot: PmoManagementSnapshot }) {
  const [grantState, grantAction, granting] = useActionState(grantKeySubIEligibilityAction, initial);
  const [endState, endAction, ending] = useActionState(endKeySubIEligibilityAction, initial);
  const eligibility = snapshot.eligibilities.find((item) => item.personId === person.id && item.status === "ACTIVE");
  return <div className="space-y-4"><p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">申请资格只提供角色入口和自主申请能力，不授予项目访问；结束资格也不会撤销既有项目授权。</p>{eligibility ? <form action={endAction} className="rounded-lg border border-slate-200 p-4"><input type="hidden" name="eligibilityId" value={eligibility.id} /><p className="font-medium">申请资格已生效</p><p className="mt-1 text-sm text-slate-600">授予原因：{eligibility.reason}</p><div className="mt-4"><Submit pending={ending} label="结束申请资格" secondary /></div><Result state={endState} /></form> : <form action={grantAction} className="space-y-3 rounded-lg border border-slate-200 p-4"><input type="hidden" name="targetPersonId" value={person.id} /><Field name="reason" label="授予原因" /><Submit pending={granting} label="授予申请资格" /><Result state={grantState} />{person.accountStatus !== "ACTIVE" ? <p className="text-sm text-amber-700">账号须处于正常状态后才能授予申请资格。</p> : null}</form>}</div>;
}

function Security({ person }: { person: Person }) {
  const [state, action, pending] = useActionState(issueCredentialAction, initial);
  const [copied, setCopied] = useState(false);
  async function copyLink() { if (state.oneTimeLink) { await navigator.clipboard.writeText(state.oneTimeLink); setCopied(true); } }
  return <form action={action} className="space-y-4"><input type="hidden" name="targetPersonId" value={person.id} /><label className="block text-sm"><span className="mb-1 block font-medium">凭证操作</span><select name="purpose" className="w-full rounded-lg border border-slate-300 px-3 py-2"><option value="ACTIVATION">生成激活链接</option><option value="PASSWORD_RESET">生成密码重置链接</option></select></label><Submit pending={pending} label="生成一次性链接" /><Result state={state} />{state.oneTimeLink ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">链接仅在本次结果中显示</p><textarea readOnly aria-label="一次性链接" value={state.oneTimeLink} className="mt-2 min-h-24 w-full rounded-lg border border-amber-300 bg-white p-3 text-sm" /><button type="button" onClick={copyLink} className="mt-2 rounded-lg border border-amber-400 px-3 py-1.5 text-sm font-semibold text-amber-900">{copied ? "已复制" : "复制链接"}</button></div> : null}</form>;
}

function Modal({ title, description, onClose, wide = false, children }: { title: string; description: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ${wide ? "max-w-5xl" : "max-w-xl"}`}><header className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-500">{description}</p></div><button type="button" aria-label="关闭弹窗" onClick={onClose} className="rounded-lg px-2 py-1 text-xl text-slate-500">×</button></header>{children}</section></div>; }
function Actions({ onClose, children }: { onClose: () => void; children?: React.ReactNode }) { return <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">关闭</button>{children}</div>; }
function Field({ name, label }: { name: string; label: string }) { return <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span><input required name={name} className="w-full rounded-lg border border-slate-300 px-3 py-2" /></label>; }
function Definition({ term, value }: { term: string; value: string }) { return <div><dt className="text-xs text-slate-500">{term}</dt><dd className="mt-1 text-sm font-medium">{value}</dd></div>; }
function StatusBadge({ status }: { status: AccountStatus }) { const tone = status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : status === "DISABLED" ? "bg-slate-100 text-slate-600" : "bg-amber-50 text-amber-700"; return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>{statusLabels[status]}</span>; }
function RoleBadges({ assignments }: { assignments: PmoManagementSnapshot["assignments"] }) { const unique = [...new Set(assignments.map((item) => item.roleCode))]; return unique.length ? <div className="flex max-w-64 flex-wrap gap-1">{unique.map((value) => <span key={value} className="rounded-full bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700">{roleLabels[value]}</span>)}</div> : <span className="text-slate-400">—</span>; }
function Submit({ pending, label, secondary = false }: { pending: boolean; label: string; secondary?: boolean }) { return <button disabled={pending} className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${secondary ? "border border-slate-300 text-slate-700" : "bg-teal-700 text-white"}`}>{pending ? "处理中…" : label}</button>; }
function Result({ state }: { state: PmoFormResult }) { return state.message ? <p role="status" className={`mt-3 text-sm ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.message}</p> : null; }
