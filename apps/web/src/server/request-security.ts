import { isIP } from "node:net";

export function hasTrustedOrigin(requestUrl: string, originHeader: string | null): boolean {
  if (!originHeader) return false;
  try {
    return new URL(originHeader).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

export function getSourceIp(
  headers: Pick<Headers, "get">,
  trustProxyHeaders: boolean,
): string | null {
  if (!trustProxyHeaders) return null;
  const forwarded = headers.get("x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim();
  if (forwarded && isIP(forwarded)) return forwarded;
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp && isIP(realIp) ? realIp : null;
}

export function getSafeUserAgent(headers: Pick<Headers, "get">): string {
  return (headers.get("user-agent") ?? "unavailable").slice(0, 512);
}
