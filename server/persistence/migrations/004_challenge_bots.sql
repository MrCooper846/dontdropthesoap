ALTER TABLE challenge_invites ADD COLUMN creator_bot_id uuid REFERENCES bots(id);
