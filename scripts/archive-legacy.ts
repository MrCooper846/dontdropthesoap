import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import initSqlJs from "sql.js";
async function run() {
  const source = path.join(process.cwd(), "data/leaderboard.sqlite");
  let bytes: Buffer;
  try {
    bytes = await fs.readFile(source);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      console.log("No accessible legacy SQLite database; no archive created.");
      return;
    }
    throw e;
  }
  const digest = createHash("sha256").update(bytes).digest("hex");
  const target = path.join(process.cwd(), "data/legacy-archives", digest);
  await fs.mkdir(target, { recursive: true });
  await fs
    .writeFile(path.join(target, "leaderboard.sqlite"), bytes, { flag: "wx" })
    .catch((e) => {
      if (e.code !== "EEXIST") throw e;
    });
  const SQL = await initSqlJs({
      locateFile: (f) =>
        path.join(process.cwd(), "node_modules/sql.js/dist", f),
    }),
    db = new SQL.Database(bytes);
  const tables: Record<string, unknown[]> = {};
  for (const name of ["player_balances", "score_entries"]) {
    const statement = db.prepare("SELECT * FROM " + name);
    const rows: unknown[] = [];
    while (statement.step()) rows.push(statement.getAsObject());
    statement.free();
    tables[name] = rows;
  }
  db.close();
  const archive = {
    schemaVersion: 1,
    sourceSha256: digest,
    exportedAt: new Date().toISOString(),
    rowCounts: Object.fromEntries(
      Object.entries(tables).map(([k, v]) => [k, v.length]),
    ),
    tables,
  };
  await fs
    .writeFile(
      path.join(target, "archive.json"),
      JSON.stringify(archive, null, 2),
      { flag: "wx" },
    )
    .catch((e) => {
      if (e.code !== "EEXIST") throw e;
    });
  const copied = await fs.readFile(path.join(target, "leaderboard.sqlite"));
  if (createHash("sha256").update(copied).digest("hex") !== digest)
    throw new Error("Archive checksum mismatch");
  console.log(
    JSON.stringify({
      archive: path.relative(process.cwd(), target),
      sha256: digest,
      rowCounts: archive.rowCounts,
    }),
  );
}
run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
