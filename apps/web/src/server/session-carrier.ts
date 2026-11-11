import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { decode } from "next-auth/jwt";

import { requiredEnvironment } from "./auth-runtime";

export async function getRawSessionCarrier(request?: NextRequest): Promise<string | null> {
  const requestHeaders = request?.headers ?? await headers();
  return decodeSessionCarrierFromCookieHeader(requestHeaders.get("cookie"));
}

export async function decodeSessionCarrierFromCookieHeader(cookieHeader: string | null): Promise<string | null> {
  const encryptedToken = readChunkedCookie(cookieHeader, "__Host-researchflow.session-token");
  if (!encryptedToken) return null;
  try {
    const token = await decode({
      token: encryptedToken,
      secret: requiredEnvironment("NEXTAUTH_SECRET"),
    });
    return typeof token?.sessionToken === "string" ? token.sessionToken : null;
  } catch {
    return null;
  }
}

function readChunkedCookie(cookieHeader: string | null, cookieName: string): string | null {
  if (!cookieHeader) return null;
  const chunks = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex < 0) continue;
    const name = part.slice(0, separatorIndex).trim();
    if (name !== cookieName && !name.startsWith(`${cookieName}.`)) continue;
    const suffix = name.slice(cookieName.length);
    if (suffix && !/^\.\d+$/.test(suffix)) continue;
    const encodedValue = part.slice(separatorIndex + 1).trim();
    try {
      chunks.set(name, decodeURIComponent(encodedValue));
    } catch {
      return null;
    }
  }
  if (chunks.size === 0) return null;
  return [...chunks.entries()]
    .sort(([left], [right]) => cookieChunkIndex(left) - cookieChunkIndex(right))
    .map(([, value]) => value)
    .join("");
}

function cookieChunkIndex(name: string): number {
  const suffix = name.split(".").at(-1);
  return suffix && /^\d+$/.test(suffix) ? Number.parseInt(suffix, 10) : 0;
}
