-- Debug queries to check RR values before and after update

-- 1. Check current max RR values
SELECT 
  workout_type,
  MAX(rr_value) as max_rr,
  COUNT(*) as total_entries,
  COUNT(CASE WHEN rr_value > 2.0 THEN 1 END) as entries_above_2
FROM entries 
WHERE rr_value IS NOT NULL
GROUP BY workout_type
ORDER BY max_rr DESC;

-- 2. Check specific entries with high RR
SELECT 
  id, 
  workout_type, 
  duration, 
  distance, 
  steps, 
  holes, 
  rr_value,
  date
FROM entries 
WHERE rr_value > 2.0
ORDER BY rr_value DESC
LIMIT 10;

-- 3. After running the UPDATE, check if it worked
-- SELECT COUNT(*) as entries_still_above_2_5 FROM entries WHERE rr_value > 2.5;
