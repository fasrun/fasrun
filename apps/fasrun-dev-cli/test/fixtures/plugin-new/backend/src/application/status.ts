import type { DemoStatusDto } from "../common/index.js";

/** Health of the demo plugin, returned by GET /api/demo/v1/status. */
export function getStatus(): DemoStatusDto {
  return { plugin: "demo", status: "ok" };
}
