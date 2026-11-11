import { createHash, createHmac, randomBytes } from "node:crypto";

import type { AuthKeyHasher, SessionTokenCodec } from "./authentication-service.js";

export class HmacAuthKeyHasher implements AuthKeyHasher {
  constructor(private readonly secret: string) {
    if (Buffer.byteLength(secret, "utf8") < 32) {
      throw new Error("AUTH_HMAC_SECRET_TOO_SHORT");
    }
  }

  hashLoginName(loginName: string): string {
    return this.hash("login-name", loginName);
  }

  hashSourceIp(sourceIp: string): string {
    return this.hash("source-ip", sourceIp);
  }

  hashCredentialSourceIp(sourceIp: string): string {
    return this.hash("credential-source-ip", sourceIp);
  }

  private hash(namespace: string, value: string): string {
    return createHmac("sha256", this.secret)
      .update(namespace)
      .update("\0")
      .update(value)
      .digest("hex");
  }
}

export class Sha256SessionTokenCodec implements SessionTokenCodec {
  generate(): { rawToken: string; tokenHash: string } {
    const rawToken = randomBytes(32).toString("base64url");
    return { rawToken, tokenHash: this.hash(rawToken) };
  }

  hash(rawToken: string): string {
    return createHash("sha256").update(rawToken).digest("hex");
  }
}
