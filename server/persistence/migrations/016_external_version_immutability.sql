CREATE FUNCTION keep_external_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.program_json IS NULL THEN RAISE EXCEPTION 'Published external declarations are immutable'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER external_version_immutable BEFORE UPDATE OR DELETE ON bot_versions FOR EACH ROW EXECUTE FUNCTION keep_external_version_immutable();
