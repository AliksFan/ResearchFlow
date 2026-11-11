import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuthRuntime } from "@/server/auth-runtime";
import { getRawSessionCarrier } from "@/server/session-carrier";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const carrier = await getRawSessionCarrier(request);
  if (!carrier) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const { projectId } = await params;
  const result = await (await getAuthRuntime()).authorization.authorize({
    rawSessionToken: carrier,
    action: "VIEW_PROJECT",
    projectId,
    contextualPermissionSatisfied: true,
    now: new Date(),
    correlationId: randomUUID(),
  });
  if (result.allowed) return NextResponse.json({ allowed: true });
  if (result.code === "PROJECT_OUT_OF_SCOPE") {
    return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  if (result.code === "UNAUTHENTICATED" || result.code === "SESSION_INVALID") {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }
  return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
}
