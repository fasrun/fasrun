import { startTestBackend } from "@fasrun/test-utils";
import { describe, expect, it } from "vitest";
import { demoPlugin } from "./plugin.js";

describe("demo plugin", () => {
  it("serves its status under /api/demo/v1", async () => {
    const backend = await startTestBackend({ features: [demoPlugin] });
    try {
      const response = await backend.server.inject({
        method: "GET",
        url: "/api/demo/v1/status",
      });
      expect(response.json()).toEqual({ plugin: "demo", status: "ok" });
    } finally {
      await backend.stop();
    }
  });
});
