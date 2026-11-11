import { cleanupE2eFixture, cleanupE2eObjectStorage } from "./fixture";

export default async function globalTeardown() {
  try {
    await cleanupE2eFixture();
  } finally {
    await cleanupE2eObjectStorage();
  }
}
