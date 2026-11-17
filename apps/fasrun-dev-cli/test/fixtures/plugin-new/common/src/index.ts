/** Plugin identifier of demo; also its database schema and route prefix (tech plan 2.1). */
export const DEMO_PLUGIN_ID = "demo";

/** Status reported by the demo plugin at /api/demo/v1/status. */
export interface DemoStatus {
  plugin: typeof DEMO_PLUGIN_ID;
  status: "ok";
}
