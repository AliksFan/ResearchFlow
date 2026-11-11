import type { RoleCode } from "@researchflow/auth";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    sessionToken: string;
  }

  interface Session extends DefaultSession {
    user?: undefined;
    authoritative: {
      personId: string;
      activeRoleCode: RoleCode | null;
      availableRoleCodes: RoleCode[];
      mustChangePassword: boolean;
    } | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sessionToken?: string;
  }
}
