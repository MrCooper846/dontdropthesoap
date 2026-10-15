// Catch configuration/import errors as well as SQL errors without printing input.
void import("./db")
  .then(async ({ migrate, pool }) => {
    try {
      await migrate();
      console.log("Migrations applied");
    } finally {
      await pool.end();
    }
  })
  .catch(() => {
    console.error(
      JSON.stringify({
        event: "migration.failed",
        code: "SERVICE_UNAVAILABLE",
      }),
    );
    process.exitCode = 1;
  });
