# APNs push delivery

This function drains `push_notification_deliveries`, sends alerts through APNs,
records every result, retries transient failures, and deactivates invalid tokens.

## Required Supabase secrets

```sh
supabase secrets set PUSH_DISPATCH_SECRET="a-long-random-value"
supabase secrets set APNS_KEY_ID="YOUR_APPLE_KEY_ID"
supabase secrets set APNS_TEAM_ID="YOUR_APPLE_TEAM_ID"
supabase secrets set APNS_BUNDLE_ID="com.coacheshive.mobile"
supabase secrets set APNS_PRIVATE_KEY="$(cat AuthKey_YOUR_APPLE_KEY_ID.p8)"
```

Never commit the `.p8` key. Create it in Apple Developer → Certificates,
Identifiers & Profiles → Keys with Apple Push Notifications service enabled.

## Deploy

```sh
supabase functions deploy send-apns-push --no-verify-jwt
```

Apply `20260826010000_apns_push_delivery.sql`, then configure a Supabase Database
Webhook for INSERT events on `public.push_notification_deliveries`:

- URL: `https://fxmxrzhucccneoibksny.supabase.co/functions/v1/send-apns-push`
- Method: POST
- Header: `x-push-dispatch-secret: <PUSH_DISPATCH_SECRET>`

Also schedule the same HTTP request every minute with Supabase Cron. The webhook
provides immediate delivery; Cron drains retries and recovers missed webhooks.

## Production readiness check

Call the function with `GET` and the dispatch secret. A healthy deployment
returns `ok: true`, `configured: true`, and queue counters from
`push_delivery_health()`. Alert when the oldest queued item is more than five
minutes old, any item remains `processing` for ten minutes, or dead-letter and
failure counts increase unexpectedly. Never expose this endpoint without the
dispatch secret.

The dispatcher performs these controls on every run:

- canonical account, tenant, preference, thread-membership, and mute checks;
- notification expiry before claim and APNs expiry headers;
- authoritative unread badge totals;
- privacy-safe message bodies unless the user enables previews;
- six-attempt exponential retry followed by a dead-letter state;
- invalid and stale token deactivation;
- complete notification/workspace/portal routing metadata.

## Physical-device acceptance test

1. Install a Debug build on a physical iPhone and allow notifications.
2. Confirm `device_tokens.environment = sandbox` and `active = true`.
3. Insert a notification for that user.
4. Confirm one delivery reaches `delivered` with APNs status `200`.
5. Repeat with TestFlight and confirm `environment = production`.
6. Test foreground, background, terminated-app, and notification-tap routing.
7. Test permission denied, Settings re-enable, logout/login on a shared device,
   token rotation, reinstall, and switching between two workspaces/roles.
8. Retry a transient APNs failure and confirm bounded retries; force expiry and
   confirm no delivery; verify message previews both off and on.
9. Confirm the SpringBoard badge equals server unread notifications and clears
   when the app becomes active.
10. Run `supabase/tests/push_delivery_hardening.sql` together with the existing
    preference, mute, mention, inbox-access, and dispatch-guard contract tests.
