import { pool } from "../persistence/db";
export type OperatorEffect = {
  action: string;
  targetId: string;
  epoch?: number;
};
export async function processOperatorEffects(
  deliver: (effect: OperatorEffect) => void | Promise<void>,
) {
  const rows = (
    await pool.query(
      'SELECT a.id,a.action,a.target_id AS "targetId",a.response FROM operator_actions a LEFT JOIN operator_effects e ON e.action_id=a.id WHERE e.action_id IS NULL ORDER BY a.created_at,a.id LIMIT 100',
    )
  ).rows;
  let count = 0;
  for (const row of rows) {
    // Reconcile current authority, rather than replaying an outdated disable.
    let effect: OperatorEffect | undefined;
    if (row.action === "owner.disable") {
      if (
        (
          await pool.query(
            "SELECT 1 FROM owners WHERE id=$1 AND disabled_at IS NOT NULL",
            [row.targetId],
          )
        ).rowCount
      )
        effect = { action: row.action, targetId: row.targetId };
    } else if (row.action === "owner.enable" || row.action === "voice.remove") {
      effect = {
        action: row.action,
        targetId: row.targetId,
        epoch: Number(row.response.after.epoch),
      };
    } else if (row.action === "session.revoke") {
      if (
        !(
          await pool.query(
            "SELECT 1 FROM sessions WHERE id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()",
            [row.targetId],
          )
        ).rowCount
      )
        effect = { action: row.action, targetId: row.targetId };
    } else if (row.action === "credential.revoke") {
      if (
        !(
          await pool.query(
            "SELECT 1 FROM bot_credentials WHERE id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()",
            [row.targetId],
          )
        ).rowCount
      )
        effect = { action: row.action, targetId: row.targetId };
    }
    if (effect) await deliver(effect);
    count +=
      (
        await pool.query(
          "INSERT INTO operator_effects(action_id) VALUES($1) ON CONFLICT DO NOTHING",
          [row.id],
        )
      ).rowCount ?? 0;
  }
  return count;
}
export function startOperatorEffects(
  deliver: (effect: OperatorEffect) => void | Promise<void>,
) {
  let pending: Promise<unknown> | undefined,
    stopped = false;
  const timer = setInterval(() => {
    if (stopped || pending) return;
    pending = processOperatorEffects(deliver)
      .catch(() => {
        console.error(
          JSON.stringify({
            event: "operator.effects.failed",
            code: "SERVICE_UNAVAILABLE",
          }),
        );
      })
      .finally(() => {
        pending = undefined;
      });
  }, 250);
  return async () => {
    stopped = true;
    clearInterval(timer);
    await pending;
  };
}
