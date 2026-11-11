import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getAuthRuntime } from "@/server/auth-runtime";
import { getRawSessionCarrier } from "@/server/session-carrier";

export async function GET(request: NextRequest) {
  const carrier = await getRawSessionCarrier(request);
  if (!carrier) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  try {
    const snapshot = await (await getAuthRuntime()).pmoManagement.list(carrier, new Date());
    return NextResponse.json({
      peopleCount: snapshot.people.length,
      activeAssignmentCount: snapshot.assignments.filter(
        ({ assignmentStatus }) => assignmentStatus === "ACTIVE",
      ).length,
    });
  } catch {
    return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  }
}
