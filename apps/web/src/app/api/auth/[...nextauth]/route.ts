import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuthOptions } from "@/server/auth-options";
import { requiredEnvironment } from "@/server/auth-runtime";
import { hasTrustedOrigin } from "@/server/request-security";

type RouteContext = { params: Promise<{ nextauth: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  return NextAuth(request, context, getAuthOptions());
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!hasTrustedOrigin(
    requiredEnvironment("NEXTAUTH_URL"),
    request.headers.get("origin"),
  )) {
    return NextResponse.json({ code: "REQUEST_REJECTED" }, { status: 403 });
  }
  return NextAuth(request, context, getAuthOptions());
}
