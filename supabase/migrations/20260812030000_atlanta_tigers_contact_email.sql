-- Keep the Atlanta Tigers public contact information aligned with the
-- organization profile used by the mobile app. Safe to rerun.

update public.org_settings
set primary_contact_email = 'joshwade@ATLtigers.com',
    updated_at = now()
where org_id = '20000000-0000-4000-8000-000000000001'::uuid
   or lower(org_name) = 'atlanta tigers';
