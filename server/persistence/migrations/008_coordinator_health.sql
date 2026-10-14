CREATE TABLE coordinator_health(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 last_success timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO coordinator_health(singleton) VALUES(true);
