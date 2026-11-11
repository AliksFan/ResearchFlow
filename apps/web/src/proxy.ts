import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE_NAME = "__Host-researchflow.session-token";

export function rootEntryTargetPath(cookieNames: Iterable<string>): "/entry" | "/login" {
  for (const name of cookieNames) {
    if (name === SESSION_COOKIE_NAME || name.startsWith(`${SESSION_COOKIE_NAME}.`)) {
      return "/entry";
    }
  }
  return "/login";
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== "/") return NextResponse.next();
  const target = request.nextUrl.clone();
  target.pathname = rootEntryTargetPath(request.cookies.getAll().map((cookie) => cookie.name));
  target.search = "";
  return NextResponse.redirect(target);
}

export const config = {
  matcher: "/",
};
