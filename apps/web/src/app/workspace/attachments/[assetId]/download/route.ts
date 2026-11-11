import { NextResponse } from "next/server";

import { requireCollaborationActor } from "@/server/collaboration-session";
import { getAttachmentRuntime } from "@/server/progress-runtime";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const actor = await requireCollaborationActor();
  try {
    const { assetId } = await params;
    const authorization = await getAttachmentRuntime().authorizeDownload(actor, assetId);
    return NextResponse.redirect(authorization.url, 303);
  } catch (error) {
    const code = codedError(error) ?? "ATTACHMENT_FORBIDDEN";
    return NextResponse.redirect(new URL(`/forbidden?reason=${encodeURIComponent(code)}`, request.url), 303);
  }
}

function codedError(error: unknown): string | null {
  if (!error || typeof error !== "object" || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}
