-- Bind registered ownership, kind and version to real durable bot records.
ALTER TABLE bots ADD CONSTRAINT league_bot_identity UNIQUE(id,owner_id,kind);
ALTER TABLE bot_versions ADD CONSTRAINT league_version_identity UNIQUE(id,bot_id);
ALTER TABLE league_entries ADD CONSTRAINT league_entry_bot FOREIGN KEY(bot_id,owner_id,kind) REFERENCES bots(id,owner_id,kind);
ALTER TABLE league_entries ADD CONSTRAINT league_entry_version FOREIGN KEY(bot_version_id,bot_id) REFERENCES bot_versions(id,bot_id);
ALTER TABLE league_attempts ADD CONSTRAINT league_attempt_match UNIQUE(fixture_id,match_id);
ALTER TABLE league_fixtures ADD CONSTRAINT league_fixture_pair_identity UNIQUE(id,entry_a_id,entry_b_id);
ALTER TABLE league_settlements ADD CONSTRAINT league_settlement_attempt FOREIGN KEY(fixture_id,match_id) REFERENCES league_attempts(fixture_id,match_id);
ALTER TABLE league_settlements ADD CONSTRAINT league_settlement_pair FOREIGN KEY(fixture_id,entry_a_id,entry_b_id) REFERENCES league_fixtures(id,entry_a_id,entry_b_id);
ALTER TABLE league_batches ADD CONSTRAINT league_fixed_rules CHECK(rules_json='{"rounds":20,"decisionMs":20000,"revealMs":1000,"maxSeats":2}'::jsonb);
ALTER TABLE league_settlements ADD CONSTRAINT league_points_bounds CHECK(a_points BETWEEN -40 AND 60 AND b_points BETWEEN -40 AND 60 AND mutual_cooperations<=20);

CREATE FUNCTION guard_league_batch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.sequence,NEW.owner_id,NEW.rules_json,NEW.registration_deadline,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.id,OLD.sequence,OLD.owner_id,OLD.rules_json,OLD.registration_deadline,OLD.created_at)
 THEN RAISE EXCEPTION 'League rules and batch identity are immutable'; END IF;
 IF NEW.state<>OLD.state AND NOT
 ((OLD.state='registration' AND NEW.state IN ('running','cancelled')) OR
 (OLD.state='running' AND NEW.state='finished'))
 THEN RAISE EXCEPTION 'Invalid league lifecycle'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER league_batch_guard BEFORE UPDATE ON league_batches FOR EACH ROW EXECUTE FUNCTION guard_league_batch();

CREATE FUNCTION guard_league_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_state text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF ROW(NEW.id,NEW.batch_id,NEW.owner_id,NEW.bot_id,NEW.bot_version_id,NEW.name,NEW.kind,NEW.created_at)
  IS DISTINCT FROM ROW(OLD.id,OLD.batch_id,OLD.owner_id,OLD.bot_id,OLD.bot_version_id,OLD.name,OLD.kind,OLD.created_at)
  THEN RAISE EXCEPTION 'Registered league strategy and identity are immutable'; END IF;
  RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN
  SELECT state INTO batch_state FROM league_batches WHERE id=OLD.batch_id FOR SHARE;
 ELSE
  SELECT state INTO batch_state FROM league_batches WHERE id=NEW.batch_id FOR SHARE;
 END IF;
 IF batch_state IS DISTINCT FROM 'registration' THEN RAISE EXCEPTION 'League registration is closed'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER league_entry_guard BEFORE INSERT OR UPDATE OR DELETE ON league_entries FOR EACH ROW EXECUTE FUNCTION guard_league_entry();

CREATE FUNCTION guard_league_fixture() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.id,NEW.batch_id,NEW.ordinal,NEW.entry_a_id,NEW.entry_b_id)
 IS DISTINCT FROM ROW(OLD.id,OLD.batch_id,OLD.ordinal,OLD.entry_a_id,OLD.entry_b_id)
 THEN RAISE EXCEPTION 'League pairings are immutable'; END IF;
 IF OLD.state='settled' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Settled fixtures are immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER league_fixture_guard BEFORE UPDATE ON league_fixtures FOR EACH ROW EXECUTE FUNCTION guard_league_fixture();

CREATE FUNCTION guard_league_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'League attempts and settlements are immutable'; END $$;
CREATE TRIGGER league_attempt_guard BEFORE UPDATE OR DELETE ON league_attempts FOR EACH ROW EXECUTE FUNCTION guard_league_ledger();
CREATE TRIGGER league_settlement_guard BEFORE UPDATE OR DELETE ON league_settlements FOR EACH ROW EXECUTE FUNCTION guard_league_ledger();
