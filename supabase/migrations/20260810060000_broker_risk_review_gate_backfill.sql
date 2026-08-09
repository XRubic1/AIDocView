-- Elevated engine output must not sit as auto_published (carrier would see Medium forever).
UPDATE broker_risk_profiles
SET
  review_status = 'pending_review',
  risk_level = 'unrated'
WHERE COALESCE(computed_risk_level, risk_level) IN ('medium', 'high')
  AND review_status = 'auto_published';
