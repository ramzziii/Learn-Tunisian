-- Rollback for 0025_feature_item_claims.sql: removes only what it created.
drop function if exists public.import_guest_feature_items(jsonb);
drop function if exists public.claim_feature_item(text, text);
drop table if exists public.feature_item_claims;
