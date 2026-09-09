import { defineConfig } from "vitest/config";

// Node environment, not jsdom: nothing here touches a DOM, and the runner has to
// behave the same in CI, on a laptop, and inside the watcher's container.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.mjs"],
  },
});
