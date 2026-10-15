ALTER TABLE matches ADD COLUMN waiting_empty_since timestamptz;
CREATE INDEX empty_waiting_scan ON matches(id) WHERE phase='waiting' AND mode<>'league';
-- Additive to old binaries: a later countdown/active phase must forget a
-- previous pregame absence, including when an older writer changes phase.
CREATE FUNCTION reset_waiting_absence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.phase<>'waiting' OR NEW.mode='league' THEN NEW.waiting_empty_since=NULL; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER waiting_absence_reset BEFORE INSERT OR UPDATE ON matches
 FOR EACH ROW EXECUTE FUNCTION reset_waiting_absence();
