CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  location TEXT NOT NULL,
  horizon_months INTEGER NOT NULL,
  avg_temperature NUMERIC NOT NULL,
  temperature_change NUMERIC NOT NULL,
  avg_precipitation NUMERIC NOT NULL,
  confidence NUMERIC NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
)