import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

import { LoginForm } from "../src/components/auth/login-form";

describe("LoginForm", () => {
  it("keeps native form submission disabled until the secure client handler is hydrated", () => {
    const html = renderToStaticMarkup(<LoginForm />);
    expect(html).toContain("正在准备安全登录…");
    expect(html).toMatch(/<button[^>]*disabled=""/u);
    expect(html).not.toContain("method=\"get\"");
  });
});
