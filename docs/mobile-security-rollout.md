# Mobile hardening rollout

## Rollout

- Password recovery is app-owned and code-based. Release an iOS build that can
  request and verify a Supabase recovery OTP before installing the code-only
  `docs/email-templates/supabase/reset-password.html` template in production.
  Reversing that order would strand users on older app builds with a code they
  cannot enter.
- Deploy the web release to staging and set `COACHESHIVE_STAGING_ORIGINS` to the exact approved staging origins.
- Apply `supabase/config.toml` redirect allow-list and email templates to the staging Supabase project; confirm no template or server setting contains `coacheshive://`.
- Verify the AASA URL on every production hostname returns HTTP 200 directly, `application/json`, and the production app identifier. Confirm all three hostnames terminate at this deployment without a host redirect for `/.well-known/apple-app-site-association`.
- Test recovery-code entry and resend in the app. Test invitation, verification,
  magic-link, and email-change links in Apple Mail, Gmail, Safari, an installed
  app, and a device without the app. Exercise expired, reused, malformed,
  wrong-host, and wrong-state credentials.
- Verify manual calendar, booking, and availability workflows. Inspect CDN, application, analytics, and Sentry events for redaction.
- Promote the same Supabase settings and environment variables to production,
  deploy web, release the recovery-code-capable iOS build, and only then install
  the code-only production recovery template.

## Rollback

- If the code-capable iOS release must be rolled back, restore the link-based
  recovery template while older builds are active. Keep the HTTPS redirect
  allow-list and AASA routes in place during the transition.
- Do not restore credential-bearing custom-scheme callbacks. If universal links fail, route users to the no-store browser fallback and issue fresh HTTPS links after the AASA or domain configuration is repaired.
