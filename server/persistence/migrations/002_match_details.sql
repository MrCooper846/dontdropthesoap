ALTER TABLE matches ADD COLUMN state_schema_version integer NOT NULL DEFAULT 1 CHECK(state_schema_version=1);
ALTER TABLE match_seats ADD COLUMN name text NOT NULL DEFAULT '';
ALTER TABLE match_seats ADD COLUMN score integer NOT NULL DEFAULT 0;
ALTER TABLE match_seats ADD COLUMN ready boolean NOT NULL DEFAULT false;
ALTER TABLE match_seats ADD COLUMN abandoned boolean NOT NULL DEFAULT false;
CREATE TABLE pairings(id text PRIMARY KEY,match_id uuid NOT NULL,round_number integer NOT NULL,a_seat_id text NOT NULL,b_seat_id text NOT NULL,
 FOREIGN KEY(match_id,round_number) REFERENCES rounds(match_id,number),
 FOREIGN KEY(match_id,a_seat_id) REFERENCES match_seats(match_id,id),
 FOREIGN KEY(match_id,b_seat_id) REFERENCES match_seats(match_id,id),
 CHECK(a_seat_id<>b_seat_id));
INSERT INTO pairings(id,match_id,round_number,a_seat_id,b_seat_id)
 SELECT pair_id,match_id,round_number,result_json->>'a',result_json->>'b' FROM round_results ON CONFLICT DO NOTHING;
ALTER TABLE round_results ADD CONSTRAINT result_pair FOREIGN KEY(pair_id) REFERENCES pairings(id);
