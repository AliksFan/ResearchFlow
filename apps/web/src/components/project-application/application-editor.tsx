"use client";

import { useState } from "react";

import type {
  ProjectApplicationDetail,
  ProjectApplicationFormOptions,
} from "@researchflow/project-application";

import {
  saveApplication,
  submitApplication,
} from "@/app/workspace/project-application-actions";
import { ApplicationSwimlaneEditor } from "@/components/project-application/application-swimlane-editor";

export function ApplicationEditor({
  detail,
  options,
  commandIds,
}: {
  detail: ProjectApplicationDetail;
  options: ProjectApplicationFormOptions;
  commandIds: {
    save: string;
    submitSave: string;
    submit: string;
  };
}) {
  const editable =
    detail.status === "DRAFT" || detail.status === "RETURNED_FOR_REVISION";
  const proposedOwnerIds = new Set(
    detail.form.owners
      .filter(({ personId, isPrimary }) =>
        personId !== detail.applicantPersonId && !isPrimary)
      .map(({ personId }) => personId),
  );
  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <div className="mb-6 grid gap-2 sm:grid-cols-3">
        <Meta label="申请编号" value={detail.applicationCode} />
        {detail.projectCode ? <Meta label="正式项目编号" value={detail.projectCode} /> : null}
        <Meta label="状态" value={detail.status} />
        <Meta label="当前轮次" value={String(detail.reviewSubmissionNo ?? 0)} />
      </div>
      <form action={saveApplication} className="space-y-6">
        <Identity detail={detail} />
        <input type="hidden" name="saveCommandId" value={commandIds.save} />
        <input
          type="hidden"
          name="submitSaveCommandId"
          value={commandIds.submitSave}
        />
        <input type="hidden" name="submitCommandId" value={commandIds.submit} />
        <fieldset
          disabled={!editable}
          className="grid gap-4 disabled:opacity-75 sm:grid-cols-2"
        >
          <Field
            label="项目名称"
            name="projectName"
            defaultValue={detail.form.projectName}
            required
          />
          <DictionarySelect
            label="项目方向"
            name="directionOptionId"
            value={detail.form.directionOptionId}
            options={options.directions}
            otherName="directionOtherText"
            otherValue={detail.form.directionOtherText}
          />
          <DictionarySelect
            label="研究类型"
            name="researchTypeOptionId"
            value={detail.form.researchTypeOptionId}
            options={options.researchTypes}
            otherName="researchTypeOtherText"
            otherValue={detail.form.researchTypeOtherText}
          />
          <label className="sm:col-span-2">
            <span className="field-label">项目简介</span>
            <textarea
              name="projectSummary"
              rows={4}
              defaultValue={detail.form.projectSummary ?? ""}
              className="field-control"
            />
          </label>
          <Select
            label="拟任主 Key Sub-I"
            name="primaryOwnerPersonId"
            value={
              detail.form.owners.find(({ isPrimary }) => isPrimary)?.personId ??
              detail.applicantPersonId
            }
            options={options.people}
          />
          <fieldset className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-medium text-slate-700">
              其他拟任 Key Sub-I（选填）
            </legend>
            <p className="mb-2 text-xs text-slate-500">
              申请人会自动纳入拟任名单；提名不会授予项目访问权。
            </p>
            <div className="space-y-2">
              {options.people
                .filter(({ id }) => id !== detail.applicantPersonId)
                .map((person) => (
                  <label key={person.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="proposedOwnerPersonId"
                      value={person.id}
                      defaultChecked={proposedOwnerIds.has(person.id)}
                    />
                    {person.displayName}
                  </label>
                ))}
            </div>
          </fieldset>
          <Field
            label="项目经费金额（元）（选填）"
            name="fundingRecordAmountCny"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={detail.form.fundingRecordAmountCny ?? ""}
          />
          <p className="self-end text-xs text-slate-500 sm:col-span-2">
            仅作项目级金额记录，不表示经费申请、审批、拨付、报销或财务入账；不与进展中的经费使用金额合并。
          </p>
          <Field
            label="牵头单位"
            name="leadOrganizationName"
            defaultValue={detail.form.leadOrganizationName ?? ""}
          />
          <Field
            label="申办方"
            name="sponsorName"
            defaultValue={detail.form.sponsorName ?? ""}
          />
        </fieldset>
        <div className="rounded-xl border border-slate-200 p-4">
          <h2 className="font-semibold">工作流与阶段计划</h2>
          <div className="mt-4"><ApplicationSwimlaneEditor projectId={detail.projectId} applicationVersionId={detail.applicationVersionId} rowVersion={detail.rowVersion} editable={editable} initial={detail.swimlane} templates={options.lifecycleTemplates} /></div>
        </div>
        {editable ? (
          <div className="flex flex-wrap gap-3">
            <button className="button-primary" type="submit">
              保存草稿
            </button>
            <button
              className="button-secondary"
              type="submit"
              formAction={submitApplication}
            >
              提交审核
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}

function Identity({ detail, commandId }: { detail: ProjectApplicationDetail; commandId?: string }) {
  return (
    <>
      <input type="hidden" name="projectId" value={detail.projectId} />
      <input
        type="hidden"
        name="applicationVersionId"
        value={detail.applicationVersionId}
      />
      <input
        type="hidden"
        name="expectedRowVersion"
        value={detail.rowVersion}
      />
      <input type="hidden" name="reviewId" value={detail.reviewId ?? ""} />
      {commandId ? <input type="hidden" name="commandId" value={commandId} /> : null}
    </>
  );
}
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}
function Field({
  label,
  name,
  defaultValue,
  type = "text",
  required,
  min,
  step,
  disabled,
}: {
  label: string;
  name: string;
  defaultValue: string;
  type?: string;
  required?: boolean;
  min?: string;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <input
        className="field-control"
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        min={min}
        step={step}
        disabled={disabled}
      />
    </label>
  );
}
function Select({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string | null | undefined;
  options: Array<{ id: string; displayName: string }>;
}) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <select
        className="field-control"
        name={name}
        defaultValue={value ?? ""}
      >
        <option value="">请选择</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

function DictionarySelect({
  label,
  name,
  value,
  options,
  otherName,
  otherValue,
}: {
  label: string;
  name: string;
  value: string | null | undefined;
  options: Array<{ id: string; optionCode: string; displayName: string }>;
  otherName: string;
  otherValue: string | null;
}) {
  const [selectedId, setSelectedId] = useState(value ?? "");
  const selected = options.find(({ id }) => id === selectedId);
  return (
    <label>
      <span className="field-label">{label}</span>
      <select
        className="field-control"
        name={name}
        value={selectedId}
        onChange={(event) => setSelectedId(event.target.value)}
      >
        <option value="">请选择</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>{item.displayName}</option>
        ))}
      </select>
      {selected?.optionCode === "OTHER" ? (
        <span className="mt-2 block">
          <span className="field-label">请说明</span>
          <input
            className="field-control"
            name={otherName}
            defaultValue={otherValue ?? ""}
            maxLength={100}
            required
          />
          <span className="mt-1 block text-xs text-slate-500">
            首次提交后将作为字典候选，不会自动加入正式选项。
          </span>
        </span>
      ) : null}
    </label>
  );
}
