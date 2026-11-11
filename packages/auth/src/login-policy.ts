import { loginNameInputSchema } from "./contracts.js";

export function parseLoginName(input: string): string {
  const result = loginNameInputSchema.safeParse(input);
  if (!result.success) {
    throw new Error("INVALID_LOGIN_NAME");
  }

  return result.data;
}
