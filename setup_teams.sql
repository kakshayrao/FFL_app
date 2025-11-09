-- Add team_id column to accounts table
ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id);

-- Insert the 5 teams
INSERT INTO public.teams (name, color) VALUES
  ('Gym n Tonic', '#0F1E46'),
  ('Muscle Mania', '#0F1E46'),
  ('The ABS-OLUTES', '#0F1E46'),
  ('Mission Fitpossible', '#0F1E46'),
  ('Core Crusher', '#0F1E46')
ON CONFLICT DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS accounts_team_idx ON public.accounts(team_id);
