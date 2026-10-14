CREATE TABLE league_batches(
 id uuid PRIMARY KEY, sequence bigserial UNIQUE NOT NULL, owner_id uuid NOT NULL REFERENCES owners(id),
 name text NOT NULL CHECK(char_length(name) BETWEEN 1 AND 64),
 rules_json jsonb NOT NULL,
 state text NOT NULL DEFAULT 'registration' CHECK(state IN ('registration','running','finished','cancelled')),
 registration_deadline timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE league_entries(
 id uuid PRIMARY KEY,batch_id uuid NOT NULL REFERENCES league_batches(id),owner_id uuid NOT NULL REFERENCES owners(id),
 bot_id uuid NOT NULL REFERENCES bots(id),bot_version_id uuid NOT NULL REFERENCES bot_versions(id),
 name text NOT NULL,kind text NOT NULL CHECK(kind IN ('visual','external')),
 offline_at timestamptz,offline_epoch bigint,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(batch_id,owner_id),UNIQUE(batch_id,bot_id),UNIQUE(batch_id,id)
);
CREATE TABLE league_fixtures(
 id uuid PRIMARY KEY,batch_id uuid NOT NULL REFERENCES league_batches(id),ordinal integer NOT NULL CHECK(ordinal>0),
 entry_a_id uuid NOT NULL,entry_b_id uuid NOT NULL,
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','active','settled')),
 attempt_number integer NOT NULL DEFAULT 0 CHECK(attempt_number>=0),
 current_match_id uuid REFERENCES matches(id),settled_match_id uuid REFERENCES matches(id),
 UNIQUE(batch_id,ordinal),UNIQUE(batch_id,entry_a_id,entry_b_id),UNIQUE(batch_id,id),
 FOREIGN KEY(batch_id,entry_a_id) REFERENCES league_entries(batch_id,id),
 FOREIGN KEY(batch_id,entry_b_id) REFERENCES league_entries(batch_id,id),
 CHECK(entry_a_id<>entry_b_id),
 CHECK((state='queued' AND current_match_id IS NULL AND settled_match_id IS NULL)
 OR(state='active' AND current_match_id IS NOT NULL AND settled_match_id IS NULL)
 OR(state='settled' AND current_match_id=settled_match_id AND settled_match_id IS NOT NULL))
);
CREATE UNIQUE INDEX league_pair ON league_fixtures(batch_id,least(entry_a_id,entry_b_id),greatest(entry_a_id,entry_b_id));
CREATE TABLE league_attempts(
 fixture_id uuid NOT NULL REFERENCES league_fixtures(id),attempt_number integer NOT NULL CHECK(attempt_number>0),
 match_id uuid UNIQUE NOT NULL REFERENCES matches(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(fixture_id,attempt_number)
);
CREATE TABLE league_active_bots(
 bot_id uuid PRIMARY KEY REFERENCES bots(id),fixture_id uuid NOT NULL REFERENCES league_fixtures(id)
);
CREATE TABLE league_settlements(
 fixture_id uuid PRIMARY KEY REFERENCES league_fixtures(id),match_id uuid UNIQUE NOT NULL REFERENCES matches(id),
 entry_a_id uuid NOT NULL REFERENCES league_entries(id),entry_b_id uuid NOT NULL REFERENCES league_entries(id),
 a_points integer NOT NULL,b_points integer NOT NULL,mutual_cooperations integer NOT NULL CHECK(mutual_cooperations>=0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX league_queue ON league_fixtures(batch_id,state,ordinal);
CREATE INDEX league_registration ON league_batches(state,registration_deadline);
