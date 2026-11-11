import { randomUUID } from "node:crypto";
import process from "node:process";

import {
  Argon2idPasswordHasher,
  DefaultPmoBootstrapService,
} from "@researchflow/auth";

import {
  createPrismaClient,
  ensureDefaultCollaborationTimeLimits,
  PrismaAuthUnitOfWork,
  readDefaultPmoSeedConfig,
} from "../src/index.js";

const config = readDefaultPmoSeedConfig(process.env);
const client = createPrismaClient(config.databaseUrl);

try {
  await new DefaultPmoBootstrapService(
    new PrismaAuthUnitOfWork(client),
    new Argon2idPasswordHasher(),
  ).run({
    initialPassword: config.initialPassword,
    correlationId: randomUUID(),
    now: new Date(),
  });
  const pmo = await client.person.findUniqueOrThrow({
    where: { loginName: "pmo" },
    select: { id: true },
  });
  await ensureDefaultCollaborationTimeLimits(client, {
    updatedByPersonId: pmo.id,
  });
  console.log("Default PMO bootstrap completed.");
} finally {
  await client.$disconnect();
}
