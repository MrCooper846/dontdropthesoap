CREATE TABLE service_controls(
 id uuid PRIMARY KEY CHECK(id='00000000-0000-4000-8000-000000000001'::uuid),
 matches_open boolean NOT NULL DEFAULT true
);
INSERT INTO service_controls(id) VALUES('00000000-0000-4000-8000-000000000001');
ALTER TABLE operator_actions DROP CONSTRAINT operator_actions_action_check;
ALTER TABLE operator_actions ADD CONSTRAINT operator_actions_action_check CHECK(action IN ('owner.disable','owner.enable','session.revoke','credential.revoke','voice.remove','report.review','matches.pause','matches.resume'));
CREATE FUNCTION require_match_admissions() RETURNS void LANGUAGE plpgsql AS $$
DECLARE available boolean;
BEGIN
 SELECT matches_open INTO available FROM service_controls WHERE id='00000000-0000-4000-8000-000000000001' FOR SHARE;
 IF available IS DISTINCT FROM true THEN
  RAISE EXCEPTION 'New games are paused for maintenance. Existing games can finish.' USING ERRCODE='P0A01';
 END IF;
END $$;
CREATE FUNCTION guard_match_admissions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  -- saveMatch upserts existing rows; the UPDATE trigger checks new starts.
  IF NOT EXISTS(SELECT 1 FROM matches WHERE id=NEW.id) THEN PERFORM require_match_admissions(); END IF;
 ELSIF OLD.phase='waiting' AND NEW.phase='countdown' THEN
  PERFORM require_match_admissions();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER match_admission_guard BEFORE INSERT OR UPDATE ON matches FOR EACH ROW EXECUTE FUNCTION guard_match_admissions();
CREATE FUNCTION guard_seat_admissions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- Existing seat upserts and system filler for an admitted countdown must continue.
 IF NEW.kind<>'system' AND NOT EXISTS(SELECT 1 FROM match_seats WHERE id=NEW.id) THEN
  PERFORM require_match_admissions();
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER seat_admission_guard BEFORE INSERT ON match_seats FOR EACH ROW EXECUTE FUNCTION guard_seat_admissions();
