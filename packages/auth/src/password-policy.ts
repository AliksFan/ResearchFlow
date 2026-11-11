const COMMON_PASSWORDS = new Set([
  "123456789012",
  "1qaz2wsx3edc",
  "asdfghjkl123",
  "adminadmin123",
  "admin12345678",
  "letmeinletmein",
  "password123456",
  "welcome123456",
  "qwertyuiop12",
  "zxcvbnm12345",
]);

export type PasswordPolicyFailureCode =
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_TOO_LONG"
  | "PASSWORD_CONTAINS_LOGIN_NAME"
  | "PASSWORD_TOO_COMMON"
  | "PASSWORD_REUSED";

export type PasswordPolicyDecision =
  | { ok: true }
  | { ok: false; code: PasswordPolicyFailureCode };

export interface PasswordCandidate {
  loginName: string;
  password: string;
  matchesCurrentOrRecentPassword?: boolean;
}

export function evaluatePasswordCandidate({
  loginName,
  password,
  matchesCurrentOrRecentPassword = false,
}: PasswordCandidate): PasswordPolicyDecision {
  const length = Array.from(password).length;
  if (length < 12) {
    return { ok: false, code: "PASSWORD_TOO_SHORT" };
  }
  if (length > 128) {
    return { ok: false, code: "PASSWORD_TOO_LONG" };
  }

  const comparablePassword = password.normalize("NFKC").toLowerCase();
  const comparableLoginName = loginName.trim().normalize("NFKC").toLowerCase();
  if (comparablePassword.includes(comparableLoginName)) {
    return { ok: false, code: "PASSWORD_CONTAINS_LOGIN_NAME" };
  }
  if (
    COMMON_PASSWORDS.has(comparablePassword) ||
    hasRepeatedPattern(comparablePassword) ||
    isCyclicDigitSequence(comparablePassword)
  ) {
    return { ok: false, code: "PASSWORD_TOO_COMMON" };
  }
  if (matchesCurrentOrRecentPassword) {
    return { ok: false, code: "PASSWORD_REUSED" };
  }

  return { ok: true };
}

function hasRepeatedPattern(value: string): boolean {
  const characters = Array.from(value);
  for (let patternLength = 1; patternLength <= Math.floor(characters.length / 2); patternLength += 1) {
    if (characters.length % patternLength !== 0) continue;
    if (characters.every((character, index) => character === characters[index % patternLength])) {
      return true;
    }
  }
  return false;
}

function isCyclicDigitSequence(value: string): boolean {
  if (!/^\d+$/u.test(value)) return false;
  const digits = Array.from(value, Number);
  const step = (digits[1] - digits[0] + 10) % 10;
  return (step === 1 || step === 9) && digits.every(
    (digit, index) => index === 0 || digit === (digits[index - 1] + step) % 10,
  );
}
