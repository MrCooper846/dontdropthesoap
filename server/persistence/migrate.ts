import { migrate, pool } from "./db";
migrate()
  .then(() => console.log("Migrations applied"))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
