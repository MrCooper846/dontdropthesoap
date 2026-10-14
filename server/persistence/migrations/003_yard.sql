CREATE TABLE yards(id text PRIMARY KEY,slug text UNIQUE NOT NULL,map_version integer NOT NULL,capacity integer NOT NULL,enabled boolean NOT NULL DEFAULT true);
CREATE TABLE circles(id text PRIMARY KEY,yard_id text NOT NULL REFERENCES yards(id),name text NOT NULL,x integer NOT NULL,y integer NOT NULL,radius integer NOT NULL,mode text NOT NULL,settings_json jsonb NOT NULL);
INSERT INTO yards(id,slug,map_version,capacity) VALUES('main-yard','prison-yard',1,32);
INSERT INTO circles(id,yard_id,name,x,y,radius,mode,settings_json) VALUES
 ('yard-circle-1','main-yard','Trust Issues',240,190,64,'human','{"rounds":10,"decisionMs":20000,"revealMs":5000,"maxSeats":8}'),
 ('yard-circle-2','main-yard','Machine Therapy',720,190,64,'mixed','{"rounds":10,"decisionMs":20000,"revealMs":5000,"maxSeats":8}'),
 ('yard-circle-3','main-yard','Noodle Exchange',240,450,64,'mixed','{"rounds":10,"decisionMs":20000,"revealMs":5000,"maxSeats":8}'),
 ('yard-circle-4','main-yard','Snake Pit',720,450,64,'mixed','{"rounds":10,"decisionMs":20000,"revealMs":5000,"maxSeats":8}');
ALTER TABLE matches ADD CONSTRAINT match_circle FOREIGN KEY(circle_id) REFERENCES circles(id);
CREATE TABLE challenge_invites(id uuid PRIMARY KEY,creator_id uuid NOT NULL REFERENCES owners(id),target_id uuid NOT NULL REFERENCES owners(id),circle_id text NOT NULL REFERENCES circles(id),settings_json jsonb NOT NULL,expires_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'pending',match_id uuid REFERENCES matches(id),created_at timestamptz NOT NULL DEFAULT now(),CHECK(creator_id<>target_id));
CREATE INDEX challenges_inbox ON challenge_invites(target_id,status,expires_at);
