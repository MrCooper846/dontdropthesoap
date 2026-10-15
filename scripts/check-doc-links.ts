import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
async function main() {
  const files = [
    "README.md",
    ...(await readdir("docs"))
      .filter((name) => name.endsWith(".md"))
      .map((name) => "docs/" + name),
  ];
  const failures: string[] = [];
  let checked = 0;
  for (const file of files) {
    const source = (await readFile(file, "utf8")).replace(
      /```[\s\S]*?```/g,
      "",
    );
    for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].replace(/^<|>$/g, "").split(/[?#]/, 1)[0];
      if (!target || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
      try {
        await stat(
          path.resolve(path.dirname(file), decodeURIComponent(target)),
        );
        checked++;
      } catch {
        failures.push(file + ": " + target);
      }
    }
  }
  if (failures.length)
    throw Error("Broken relative documentation paths:\n" + failures.join("\n"));
  console.log("Documentation relative paths: " + checked + " PASS");
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Documentation check failed",
  );
  process.exitCode = 1;
});
