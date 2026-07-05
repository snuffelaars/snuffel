-- Enable RLS on the tables used by the app
ALTER TABLE public.boardgame_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signups ENABLE ROW LEVEL SECURITY;

-- Add a signup email column if it does not exist yet
ALTER TABLE public.signups ADD COLUMN IF NOT EXISTS email text;

-- Add creator flags for the boardgame_tables table if they do not exist yet
ALTER TABLE public.boardgame_tables ADD COLUMN IF NOT EXISTS creator_explains boolean NOT NULL DEFAULT false;
ALTER TABLE public.boardgame_tables ADD COLUMN IF NOT EXISTS creator_joins boolean NOT NULL DEFAULT true;
ALTER TABLE public.boardgame_tables ADD COLUMN IF NOT EXISTS creator_name text;

-- Allow anonymous users to read and create tables
CREATE POLICY IF NOT EXISTS "boardgame_tables_select_anon"
  ON public.boardgame_tables
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY IF NOT EXISTS "boardgame_tables_insert_anon"
  ON public.boardgame_tables
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anonymous users to read and create signups
CREATE POLICY IF NOT EXISTS "signups_select_anon"
  ON public.signups
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY IF NOT EXISTS "signups_insert_anon"
  ON public.signups
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- The delete and unsubscribe flows use the edge functions with service-role credentials,
-- so explicit anon DELETE policies are not required for the current implementation.
