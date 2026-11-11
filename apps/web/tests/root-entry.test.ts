import { beforeEach, describe, expect, it, vi } from "vitest";

const entryState = vi.hoisted(() => ({
  carrier: null as string | null,
  session: {
    authenticated: false,
    mustChangePassword: false,
    activeRoleCode: null as string | null,
    availableRoleCodes: [] as string[],
  },
}));

const redirect = vi.hoisted(() =>
  vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
);

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/server/session-carrier", () => ({
  getRawSessionCarrier: vi.fn(async () => entryState.carrier),
}));
vi.mock("@/server/auth-runtime", () => ({
  getAuthRuntime: vi.fn(async () => ({
    authentication: {
      validateSession: vi.fn(async () => entryState.session),
    },
  })),
}));

import Home from "../src/app/page";
import { rootEntryTargetPath } from "../src/proxy";

describe("production root entry", () => {
  beforeEach(() => {
    redirect.mockClear();
    entryState.carrier = null;
    entryState.session = {
      authenticated: false,
      mustChangePassword: false,
      activeRoleCode: null,
      availableRoleCodes: [],
    };
  });

  it("sends an anonymous visitor to the formal login page", async () => {
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it.each(["PMO", "DEAN", "KEY_SUB_I"] as const)(
    "sends an authenticated %s user to the real workspace entry",
    async (roleCode) => {
      entryState.carrier = "raw-session-carrier";
      entryState.session = {
        authenticated: true,
        mustChangePassword: false,
        activeRoleCode: roleCode,
        availableRoleCodes: [roleCode],
      };

      await expect(Home()).rejects.toThrow("NEXT_REDIRECT:/workspace");
      expect(redirect).toHaveBeenCalledWith("/workspace");
    },
  );

  it("does not render the engineering skeleton as the production root", async () => {
    await expect(Home()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(redirect).not.toHaveBeenCalledWith(expect.stringContaining("尚未接入业务模块"));
  });

  it("uses middleware to send anonymous root requests to /login before rendering", () => {
    expect(rootEntryTargetPath([])).toBe("/login");
  });

  it("uses middleware to send session-bearing root requests through authoritative entry validation", () => {
    expect(rootEntryTargetPath(["__Host-researchflow.session-token"])).toBe("/entry");
    expect(rootEntryTargetPath(["__Host-researchflow.session-token.0"])).toBe("/entry");
  });
});
