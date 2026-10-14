-- A DB pause can begin after the application's final freshness check.
-- Recheck at COMMIT, after every pending match write and receipt.
CREATE FUNCTION check_coordinator_commit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE last_confirmed timestamptz;
BEGIN
 IF current_setting('soap.enforce_coordinator',true) IS DISTINCT FROM 'on' THEN RETURN NULL; END IF;
 SELECT last_success INTO last_confirmed FROM coordinator_health WHERE singleton=true;
 IF last_confirmed IS NULL OR
 extract(epoch FROM (clock_timestamp()-last_confirmed))*1000 >= (NEW.state_json->'settings'->>'decisionMs')::numeric
 THEN RAISE EXCEPTION 'Deadline coordinator is recovering' USING ERRCODE='P0C01'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER coordinator_commit_guard
 AFTER INSERT OR UPDATE ON matches DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION check_coordinator_commit();
