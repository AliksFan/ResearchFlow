import { prepareE2eObjectStorage, seedE2eFixture } from "./fixture";

export default async function globalSetup() {
  await prepareE2eObjectStorage();
  await seedE2eFixture();
}
