ALTER TABLE bot_versions ADD COLUMN ruleset_version integer CHECK(ruleset_version IS NULL OR ruleset_version=1);
ALTER TABLE bot_versions ADD CONSTRAINT visual_version_payload CHECK(
 (program_json IS NULL AND workspace_json IS NULL AND program_hash IS NULL AND interpreter_version IS NULL AND ruleset_version IS NULL)
 OR (program_json IS NOT NULL AND workspace_json IS NOT NULL AND program_hash IS NOT NULL AND interpreter_version IS NOT NULL AND ruleset_version IS NOT NULL AND program_hash ~ '^[a-f0-9]{64}$' AND interpreter_version=1 AND ruleset_version=1)
);
CREATE FUNCTION keep_visual_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.program_json IS NOT NULL THEN RAISE EXCEPTION 'Published visual versions are immutable'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER visual_version_immutable BEFORE UPDATE OR DELETE ON bot_versions FOR EACH ROW EXECUTE FUNCTION keep_visual_version_immutable();
ALTER TABLE bot_runtime_states ADD COLUMN program_version_id uuid REFERENCES bot_versions(id);
ALTER TABLE bot_runtime_states ADD CONSTRAINT runtime_seat FOREIGN KEY(match_id,seat_id) REFERENCES match_seats(match_id,id);
ALTER TABLE bot_runtime_states ADD CONSTRAINT runtime_rng CHECK(rng_state BETWEEN 1 AND 4294967295);
CREATE TABLE visual_decisions(
 match_id uuid NOT NULL,
 round_number integer NOT NULL,
 seat_id text NOT NULL,
 bot_version_id uuid NOT NULL REFERENCES bot_versions(id),
 status text NOT NULL CHECK(status IN ('accepted','error')),
 error_code text,
 trace_json jsonb NOT NULL DEFAULT '[]',
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(match_id,round_number,seat_id),
 FOREIGN KEY(match_id,round_number) REFERENCES rounds(match_id,number),
 FOREIGN KEY(match_id,seat_id) REFERENCES match_seats(match_id,id),
 CHECK((status='accepted' AND error_code IS NULL) OR (status='error' AND error_code IS NOT NULL))
);
