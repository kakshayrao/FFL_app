-- Query to find missing entries between Sept 1-12, 2024
-- Shows user, team, and which specific days they're missing

WITH date_series AS (
  SELECT generate_series(
    '2024-09-01'::date,
    '2024-09-12'::date,
    '1 day'::interval
  )::date as check_date
),
user_team_mapping AS (
  SELECT 
    a.id as user_id,
    a.first_name,
    a.last_name,
    t.name as team_name,
    t.id as team_id
  FROM accounts a
  LEFT JOIN teams t ON a.team_id = t.id
),
user_entries AS (
  SELECT 
    user_id,
    date,
    type,
    status
  FROM entries
  WHERE status = 'approved'
    AND date >= '2024-09-01'
    AND date <= '2024-09-12'
),
missing_entries AS (
  SELECT 
    utm.user_id,
    utm.first_name,
    utm.last_name,
    utm.team_name,
    ds.check_date
  FROM user_team_mapping utm
  CROSS JOIN date_series ds
  LEFT JOIN user_entries ue ON utm.user_id = ue.user_id AND ds.check_date = ue.date
  WHERE ue.user_id IS NULL
    AND utm.team_id IS NOT NULL  -- Only include users with teams
)
SELECT 
  team_name,
  first_name,
  last_name,
  check_date,
  EXTRACT(DOW FROM check_date) as day_of_week
FROM missing_entries
ORDER BY team_name, first_name, last_name, check_date;
