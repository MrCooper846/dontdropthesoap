CREATE TABLE restaurant_shifts(
 id uuid PRIMARY KEY,
 host_id uuid NOT NULL REFERENCES owners(id),
 state_json jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX restaurant_active ON restaurant_shifts((state_json->>'phase'),updated_at);
CREATE TABLE restaurant_members(
 shift_id uuid NOT NULL REFERENCES restaurant_shifts(id),
 owner_id uuid NOT NULL REFERENCES owners(id),
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(shift_id,owner_id)
);
CREATE UNIQUE INDEX restaurant_one_active_shift ON restaurant_members(owner_id) WHERE active;
CREATE TABLE restaurant_wallet_entries(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES owners(id),
 shift_id uuid NOT NULL REFERENCES restaurant_shifts(id),
 amount integer NOT NULL CHECK(amount>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(shift_id,owner_id)
);
CREATE INDEX restaurant_wallet_owner ON restaurant_wallet_entries(owner_id);
CREATE FUNCTION immutable_restaurant_credit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Restaurant payout credits are immutable'; END $$;
CREATE TRIGGER restaurant_credit_immutable BEFORE UPDATE OR DELETE ON restaurant_wallet_entries
 FOR EACH ROW EXECUTE FUNCTION immutable_restaurant_credit();
