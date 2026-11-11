import { hash, verify, type Options } from "@node-rs/argon2";

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

export const ARGON2ID_OPTIONS = {
  algorithm: 2,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const satisfies Options;

export class Argon2idPasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, ARGON2ID_OPTIONS);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password, ARGON2ID_OPTIONS);
  }
}
