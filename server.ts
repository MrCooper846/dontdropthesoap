import { WriterConflict } from "./server/security/failures";
// Install fixed diagnostic sinks before loading config, database or framework code.
// Error messages/stacks may contain environment values or database input.
let fatal = false;
function fail(
  event: "service.startup.failed" | "service.fatal",
  error?: unknown,
) {
  if (fatal) return;
  fatal = true;
  console.error(
    JSON.stringify({
      event,
      code:
        error instanceof WriterConflict
          ? "WRITER_ALREADY_RUNNING"
          : "SERVICE_UNAVAILABLE",
    }),
  );
  process.exit(1);
}
process.on("uncaughtException", () => fail("service.fatal"));
process.on("unhandledRejection", () => fail("service.fatal"));
void import("./server/main")
  .then(({ main }) => main())
  .catch((error) => fail("service.startup.failed", error));
