import { randomUUID } from "node:crypto";

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { getAuthRuntime, requiredEnvironment } from "./auth-runtime";
import { getSafeUserAgent, getSourceIp } from "./request-security";

let options: NextAuthOptions | undefined;

export function getAuthOptions(): NextAuthOptions {
  options ??= createAuthOptions();
  return options;
}

function createAuthOptions(): NextAuthOptions {
  const secret = requiredEnvironment("NEXTAUTH_SECRET");
  if (Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("NEXTAUTH_SECRET_TOO_SHORT");
  }
  return {
    secret,
    session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
    jwt: { maxAge: 12 * 60 * 60 },
    pages: { signIn: "/login", error: "/login" },
    providers: [
      CredentialsProvider({
        name: "login_name",
        credentials: {
          loginName: { label: "登录名", type: "text" },
          password: { label: "密码", type: "password" },
        },
        async authorize(credentials, request) {
          if (
            typeof credentials?.loginName !== "string" ||
            typeof credentials.password !== "string"
          ) return null;
          const runtime = await getAuthRuntime();
          const headers = new Headers(request.headers as Record<string, string>);
          const result = await runtime.authentication.login({
            loginName: credentials.loginName,
            password: credentials.password,
            sourceIp: getSourceIp(
              headers,
              process.env.AUTH_TRUST_PROXY_HEADERS === "1",
            ),
            userAgent: getSafeUserAgent(headers),
            now: new Date(),
            correlationId: randomUUID(),
          });
          return result.ok
            ? { id: result.personId, sessionToken: result.sessionToken }
            : null;
        },
      }),
    ],
    callbacks: {
      jwt({ token, user }) {
        const sessionToken = user?.sessionToken ?? token.sessionToken;
        return sessionToken ? { sessionToken } : {};
      },
      async session({ session, token }) {
        if (typeof token.sessionToken !== "string") {
          return { ...session, user: undefined, authoritative: null };
        }
        const result = await (await getAuthRuntime()).authentication.validateSession(
          token.sessionToken,
          new Date(),
        );
        return result.authenticated
          ? {
              ...session,
              user: undefined,
              authoritative: {
                personId: result.personId,
                activeRoleCode: result.activeRoleCode,
                availableRoleCodes: result.availableRoleCodes,
                mustChangePassword: result.mustChangePassword,
              },
            }
          : { ...session, user: undefined, authoritative: null };
      },
    },
    events: {
      async signOut({ token }) {
        if (typeof token.sessionToken === "string") {
          await (await getAuthRuntime()).authentication.logout({
            rawToken: token.sessionToken,
            now: new Date(),
            correlationId: randomUUID(),
          });
        }
      },
    },
    cookies: {
      sessionToken: secureHostCookie("researchflow.session-token", true),
      csrfToken: secureHostCookie("researchflow.csrf-token", true),
      callbackUrl: secureHostCookie("researchflow.callback-url", false),
    },
  };
}

function secureHostCookie(name: string, httpOnly: boolean) {
  return {
    name: `__Host-${name}`,
    options: {
      httpOnly,
      sameSite: "lax" as const,
      path: "/",
      secure: true,
    },
  };
}
