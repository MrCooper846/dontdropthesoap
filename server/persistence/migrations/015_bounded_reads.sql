-- Earlier migrations can backfill matches in this same migration transaction.
-- Validate their queued constraints before index DDL; never disable the guards.
SET CONSTRAINTS ALL IMMEDIATE;
CREATE INDEX credential_history_page ON bot_credentials(bot_id,expires_at DESC,id DESC);
CREATE INDEX blocks_reverse ON owner_blocks(blocked_owner_id,owner_id);
CREATE INDEX social_active_tables ON matches(id) WHERE mode<>'league' AND phase NOT IN ('finished','cancelled','aborted');
SET CONSTRAINTS ALL DEFERRED;
