ALTER TABLE matches ADD COLUMN terminal_at timestamptz;
ALTER TABLE matches ADD COLUMN history_expired_at timestamptz;
CREATE FUNCTION stamp_match_terminal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.phase IN ('finished','cancelled','aborted') THEN
  IF TG_OP='INSERT' OR OLD.phase NOT IN ('finished','cancelled','aborted') THEN
   NEW.terminal_at=clock_timestamp();
  END IF;
 ELSE NEW.terminal_at=NULL; NEW.history_expired_at=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER match_terminal_stamp BEFORE INSERT OR UPDATE ON matches
 FOR EACH ROW EXECUTE FUNCTION stamp_match_terminal();
CREATE INDEX retention_matches ON matches(terminal_at,id) WHERE history_expired_at IS NULL AND phase IN ('finished','cancelled','aborted');
CREATE INDEX retention_receipts ON command_receipts(created_at);
CREATE INDEX retention_keys ON creation_keys(expires_at);
CREATE INDEX retention_sessions ON sessions(expires_at);
CREATE INDEX retention_credentials ON bot_credentials(expires_at);
CREATE INDEX retention_reports ON reports(created_at);
CREATE INDEX retention_invites ON challenge_invites(expires_at);
CREATE INDEX retention_notifications ON match_events(created_at,match_id,sequence) WHERE type='match.history-expired';

-- Prefer attributable first terminal history; unknown legacy timestamps receive
-- a fresh grace period instead of prematurely discarding their records.
UPDATE matches m SET terminal_at=coalesce(
 (SELECT min(e.created_at) FROM match_events e WHERE e.match_id=m.id AND e.payload->>'phase' IN ('finished','cancelled','aborted')),
 clock_timestamp()
) WHERE phase IN ('finished','cancelled','aborted');
