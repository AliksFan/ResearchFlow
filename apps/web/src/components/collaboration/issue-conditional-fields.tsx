"use client";

import { useState } from "react";

const fieldClass = "rounded-md border border-slate-300 bg-white px-3 py-2";

export function IssueTypeFields({ issueTypes }: { issueTypes: Array<{ id: string; code: string; name: string }> }) {
  const [selectedId, setSelectedId] = useState(issueTypes[0]?.id ?? "");
  const isOther = issueTypes.find((type) => type.id === selectedId)?.code === "OTHER";

  return <>
    <label className="grid gap-1 text-sm">问题类型<select name="issueTypeOptionId" required className={fieldClass} value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>{issueTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
    {isOther ? <label className="grid gap-1 text-sm">其他类型说明<input name="issueTypeOtherText" required className={fieldClass} /></label> : null}
  </>;
}

export function DeanDecisionFields() {
  const [decisionCode, setDecisionCode] = useState("AGREE_WITH_PMO_RECOMMENDATION");
  const isOther = decisionCode === "OTHER";

  return <>
    <label className="grid gap-1 text-sm">决定<select name="decisionCode" className={fieldClass} value={decisionCode} onChange={(event) => setDecisionCode(event.target.value)}><option value="AGREE_WITH_PMO_RECOMMENDATION">同意 PMO建议</option><option value="COORDINATE_RESOURCES">协调资源</option><option value="OTHER">其他</option></select></label>
    <label className="grid gap-1 text-sm">决定内容{isOther ? "（必填）" : "（选填）"}<textarea name="decisionContent" required={isOther} rows={2} className={fieldClass} /></label>
    {isOther ? <label className="grid gap-1 text-sm">PMO落实指令（必填）<textarea name="pmoImplementationInstruction" required rows={2} className={fieldClass} /></label> : null}
  </>;
}

export function ImplementationReviewFields() {
  const [decision, setDecision] = useState("ACCEPTED");
  const returned = decision === "RETURNED";

  return <>
    <label className="grid gap-1 text-sm">复核结论<select name="decision" className={fieldClass} value={decision} onChange={(event) => setDecision(event.target.value)}><option value="ACCEPTED">通过</option><option value="RETURNED">退回 PMO继续落实</option></select></label>
    <label className="grid gap-1 text-sm">复核意见{returned ? "（必填）" : "（选填）"}<textarea name="comment" required={returned} rows={2} className={fieldClass} /></label>
  </>;
}

export function ResolutionConfirmationFields() {
  const [resolved, setResolved] = useState("1");
  const unresolved = resolved === "0";

  return <>
    <label className="grid gap-1 text-sm">确认结果<select name="resolved" className={fieldClass} value={resolved} onChange={(event) => setResolved(event.target.value)}><option value="1">已解决</option><option value="0">未解决，退回协调</option></select></label>
    <label className="grid gap-1 text-sm">确认说明{unresolved ? "（必填）" : "（选填）"}<textarea name="confirmation" required={unresolved} rows={2} className={fieldClass} /></label>
  </>;
}

export function InvalidCloseFields() {
  const [reasonCode, setReasonCode] = useState("INVALID");
  const duplicate = reasonCode === "DUPLICATE";

  return <>
    <label className="grid gap-1 text-sm">原因<select name="reasonCode" className={fieldClass} value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}><option value="INVALID">无效问题</option><option value="DUPLICATE">重复问题</option><option value="INCORRECT">信息错误</option><option value="OUT_OF_SCOPE">超出范围</option><option value="CREATED_BY_MISTAKE">误创建</option></select></label>
    {duplicate ? <label className="grid gap-1 text-sm">重复问题 ID（必填）<input name="duplicateIssueId" required className={fieldClass} /></label> : null}
  </>;
}
