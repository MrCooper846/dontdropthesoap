CREATE TABLE operator_actions(
 id uuid PRIMARY KEY,sequence bigserial UNIQUE NOT NULL,
 operator_label text NOT NULL CHECK(char_length(operator_label) BETWEEN 1 AND 80),
 action text NOT NULL CHECK(action IN ('owner.disable','owner.enable','session.revoke','credential.revoke','voice.remove','report.review')),
 target_id uuid NOT NULL,reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 500),
 payload_hash text NOT NULL CHECK(payload_hash ~ '^[a-f0-9]{64}$'),
 response jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE operator_effects(
 action_id uuid PRIMARY KEY REFERENCES operator_actions(id),
 applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE reports ADD CONSTRAINT report_review_status CHECK(status IN ('open','reviewed','dismissed','actioned'));
CREATE INDEX operator_pending ON operator_actions(created_at,id);
CREATE FUNCTION guard_operator_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Operator audit records are immutable'; END $$;
CREATE TRIGGER operator_audit_guard BEFORE UPDATE OR DELETE ON operator_actions FOR EACH ROW EXECUTE FUNCTION guard_operator_audit();
