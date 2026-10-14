import { maintenanceStatus } from "../server/operators/maintenance";
import {
  applyOperator,
  listReports,
  listAudit,
  operatorLabel,
} from "../server/operators/service";
import { pool } from "../server/persistence/db";
import { RuleError } from "../domain/match/model";
import { z } from "zod";
async function run() {
  const label = operatorLabel.parse(process.env.SOAP_OPERATOR_ID);
  const mode = process.argv[2] ?? "apply";
  let result: unknown;
  if (mode === "status") result = await maintenanceStatus();
  else if (mode === "reports")
    result = await listReports(
      label,
      process.argv[3] ?? "open",
      process.argv[4],
    );
  else if (mode === "audit")
    result = await listAudit(label, process.argv[3] ?? "0");
  else if (mode === "apply") {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > 16384)
        throw new RuleError("INVALID_PAYLOAD", "Operator input exceeds 16 KiB");
      chunks.push(Buffer.from(chunk));
    }
    let input: unknown;
    try {
      input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new RuleError("INVALID_PAYLOAD");
    }
    result = await applyOperator(label, input);
  } else
    throw new RuleError(
      "INVALID_PAYLOAD",
      "Use apply, reports, audit or status",
    );
  console.log(JSON.stringify(result));
}
run()
  .catch((error) => {
    const code =
      error instanceof RuleError
        ? error.code
        : error instanceof z.ZodError
          ? "INVALID_PAYLOAD"
          : "SERVICE_UNAVAILABLE";
    console.error(
      JSON.stringify({
        error: {
          code,
          message: error instanceof RuleError ? error.message : code,
        },
      }),
    );
    process.exitCode = 1;
  })
  .finally(() => pool.end());
