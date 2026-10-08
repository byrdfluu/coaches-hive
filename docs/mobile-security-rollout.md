# Mobile hardening rollout

## Rollout

- Deploy the web release to staging and set `COACHESHIVE_STAGING_ORIGINS` to the exact approved staging origins.
- Apply `supabase/config.toml` redirect allow-list and email templates to the staging Supabase project; confirm no template or server setting contains `coacheshive://`.
- Verify the AASA URL on every production hostname returns HTTP 200 directly, `application/json`, and the production app identifier. Confirm all three hostnames terminate at this deployment without a host redirect for `/.well-known/apple-app-site-association`.
- Test recovery, invitation, verification, magic-link, and email-change links in Apple Mail, Gmail, Safari, an installed app, and a device without the app. Exercise expired, reused, malformed, wrong-host, and wrong-state links.
- Verify manual calendar, booking, and availability workflows. Inspect CDN, application, analytics, and Sentry events for redaction.
- Promote the same Supabase redirect/template settings and environment variables to production, deploy web, then release the iOS build with associated domains enabled.

## Rollback

- Roll back the web deployment and Supabase templates together. Keep the HTTPS redirect allow-list and AASA routes in place while any hardened iOS build is active.
- Do not restore credential-bearing custom-scheme callbacks. If universal links fail, route users to the no-store browser fallback and issue fresh HTTPS links after the AASA or domain configuration is repaired.
