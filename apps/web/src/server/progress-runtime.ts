import {
  AttachmentService,
  FileTypeAttachmentContentInspector,
  S3PrivateObjectStorage,
} from "@researchflow/attachments";
import { DictionaryService, IssueService, LifecycleTemplateService, ProjectClosureService, WorkflowCompletionService, WorkflowProgressService } from "@researchflow/collaboration";
import { PrismaAttachmentRepository, PrismaDictionaryRepository, PrismaIssueRepository, PrismaLifecycleTemplateRepository, PrismaProjectClosureRepository, PrismaWorkflowCompletionRepository, PrismaWorkflowProgressRepository } from "@researchflow/db";

import { getApplicationPrismaClient } from "./auth-runtime";

const runtimeState = globalThis as typeof globalThis & {
  researchFlowWorkflowProgressRuntime?: WorkflowProgressService;
  researchFlowWorkflowCompletionRuntime?: WorkflowCompletionService;
  researchFlowAttachmentRuntime?: AttachmentService;
  researchFlowLifecycleTemplateRuntime?: LifecycleTemplateService;
  researchFlowIssueRuntime?: IssueService;
  researchFlowProjectClosureRuntime?: ProjectClosureService;
  researchFlowDictionaryRuntime?: DictionaryService;
};

export function getDictionaryRuntime(): DictionaryService {
  runtimeState.researchFlowDictionaryRuntime ??= new DictionaryService(
    new PrismaDictionaryRepository(getApplicationPrismaClient()),
  );
  return runtimeState.researchFlowDictionaryRuntime;
}

export function getProjectClosureRuntime(): ProjectClosureService {
  runtimeState.researchFlowProjectClosureRuntime ??= new ProjectClosureService(
    new PrismaProjectClosureRepository(getApplicationPrismaClient()),
  );
  return runtimeState.researchFlowProjectClosureRuntime;
}

export function getIssueRuntime(): IssueService {
  runtimeState.researchFlowIssueRuntime ??= new IssueService(
    new PrismaIssueRepository(getApplicationPrismaClient()),
  );
  return runtimeState.researchFlowIssueRuntime;
}

export function getLifecycleTemplateRuntime(): LifecycleTemplateService {
  runtimeState.researchFlowLifecycleTemplateRuntime ??= new LifecycleTemplateService(
    new PrismaLifecycleTemplateRepository(getApplicationPrismaClient()),
  );
  return runtimeState.researchFlowLifecycleTemplateRuntime;
}

export function getWorkflowCompletionRuntime(): WorkflowCompletionService {
  runtimeState.researchFlowWorkflowCompletionRuntime ??= new WorkflowCompletionService(
    new PrismaWorkflowCompletionRepository(getApplicationPrismaClient()),
  );
  return runtimeState.researchFlowWorkflowCompletionRuntime;
}

export function getWorkflowProgressRuntime(): WorkflowProgressService {
  runtimeState.researchFlowWorkflowProgressRuntime ??= new WorkflowProgressService(
    new PrismaWorkflowProgressRepository(getApplicationPrismaClient()),
  );
  return runtimeState.researchFlowWorkflowProgressRuntime;
}

export function getAttachmentRuntime(): AttachmentService {
  if (!runtimeState.researchFlowAttachmentRuntime) {
    const storage = new S3PrivateObjectStorage({
      endpoint: requiredEnvironment("ATTACHMENT_S3_ENDPOINT"),
      publicEndpoint: optionalEnvironment("ATTACHMENT_S3_PUBLIC_ENDPOINT"),
      region: requiredEnvironment("ATTACHMENT_S3_REGION"),
      bucket: requiredEnvironment("ATTACHMENT_S3_BUCKET"),
      accessKeyId: requiredEnvironment("ATTACHMENT_S3_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnvironment("ATTACHMENT_S3_SECRET_ACCESS_KEY"),
    });
    runtimeState.researchFlowAttachmentRuntime = new AttachmentService(
      new PrismaAttachmentRepository(getApplicationPrismaClient()),
      storage,
      new FileTypeAttachmentContentInspector(storage),
    );
  }
  return runtimeState.researchFlowAttachmentRuntime;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required attachment storage configuration: ${name}`);
  return value;
}

function optionalEnvironment(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}
