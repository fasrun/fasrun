/** Types shared by the layers of the demo backend; contracts for other plugins belong in -common. */
export interface DemoStatusDto {
  plugin: "demo";
  status: "ok";
}
