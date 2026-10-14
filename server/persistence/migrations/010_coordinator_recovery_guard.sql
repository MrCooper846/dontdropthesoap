-- Renewal must not hide a gap that grew while recovery waited on another match.
CREATE FUNCTION check_coordinator_recovery_commit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF current_setting('soap.enforce_coordinator',true) IS DISTINCT FROM 'on' OR NEW.last_success<=OLD.last_success
 THEN RETURN NULL; END IF;
 IF EXISTS(
  SELECT 1 FROM matches m WHERE m.phase IN ('countdown','collecting','revealing')
  AND extract(epoch FROM (clock_timestamp()-OLD.last_success))*1000 >= (m.state_json->'settings'->>'decisionMs')::numeric
 ) THEN RAISE EXCEPTION 'Coordinator recovery is incomplete' USING ERRCODE='P0C01'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER coordinator_recovery_commit_guard
 AFTER UPDATE ON coordinator_health DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION check_coordinator_recovery_commit();
