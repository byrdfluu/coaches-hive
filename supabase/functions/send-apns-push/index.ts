import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Delivery = {
  delivery_id: string;
  notification_id: string;
  device_token_id: string;
  token: string;
  environment: "sandbox" | "production";
  title: string;
  body: string;
  notification_type: string;
  notification_category: string;
  related_id: string | null;
  workspace_id: string | null;
  action_url: string | null;
  notification_data: Record<string, unknown> | null;
  attempt_count: number;
  max_attempts: number;
  expires_at: string | null;
  badge_count: number;
  show_message_previews: boolean;
};

const encoder = new TextEncoder();
const base64url = (value: Uint8Array | string) => {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
};

const privateKeyBytes = (pem: string) => {
  const clean = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(clean);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

async function makeAPNsJWT(keyId: string, teamId: string, privateKey: string) {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = base64url(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) }));
  const unsigned = `${header}.${claims}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(unsigned),
  ));
  return `${unsigned}.${base64url(signature)}`;
}

const retryDelaySeconds = (attempt: number) => Math.min(3600, 15 * 2 ** Math.max(0, attempt - 1));

const secretsMatch = async (actual: string | null, expected: string) => {
  if (!actual) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(actual)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a); const right = new Uint8Array(b);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < Math.min(left.length, right.length); index++) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
};

Deno.serve(async (request) => {
  try {
    const expectedSecret = Deno.env.get("PUSH_DISPATCH_SECRET");
    if (!expectedSecret || !await secretsMatch(request.headers.get("x-push-dispatch-secret"), expectedSecret)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseURL = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const keyId = Deno.env.get("APNS_KEY_ID")!;
    const teamId = Deno.env.get("APNS_TEAM_ID")!;
    const privateKey = Deno.env.get("APNS_PRIVATE_KEY")!;
    const topic = Deno.env.get("APNS_BUNDLE_ID") ?? "com.coacheshive.mobile";
    if (!keyId || !teamId || !privateKey) throw new Error("APNs secrets are incomplete");

    const admin = createClient(supabaseURL, serviceRole, { auth: { persistSession: false } });
    if (request.method === "GET") {
      const { data, error } = await admin.rpc("push_delivery_health");
      if (error) throw error;
      return Response.json({ ok: true, configured: true, health: data });
    }
    if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });

    await admin.rpc("maintain_push_device_tokens");
    await admin.rpc("requeue_stale_push_deliveries");
    const { data, error } = await admin.rpc("claim_push_notification_deliveries", { p_limit: 50 });
    if (error) throw error;
    const deliveries = (data ?? []) as Delivery[];
    const jwt = deliveries.length ? await makeAPNsJWT(keyId, teamId, privateKey.replaceAll("\\n", "\n")) : "";

    let delivered = 0;
    let failed = 0;
    let retrying = 0;
    for (const item of deliveries) {
      const host = item.environment === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
      const appDestination = item.notification_data?.app_destination;
      const isMessage = item.notification_category === "messages" || item.notification_type.includes("message");
      const body = isMessage && !item.show_message_previews
        ? "You have a new message. Open Coaches Hive to view it."
        : item.body.slice(0, 600);
      // APNs payloads are capped at 4 KB. Forward only routing identifiers;
      // never copy arbitrary database metadata or private domain records.
      const customData = {
        notification_id: item.notification_id,
        type: item.notification_type,
        category: item.notification_category,
        related_id: item.related_id,
        workspace_id: item.workspace_id,
        action_url: item.action_url,
        app_destination: typeof appDestination === "string" ? appDestination : null,
        portal: item.notification_data?.portal ?? null,
        acting_role: item.notification_data?.acting_role ?? null,
        thread_id: item.notification_data?.thread_id ?? null,
        message_id: item.notification_data?.message_id ?? null,
        org_id: item.notification_data?.org_id ?? null,
        league_id: item.notification_data?.league_id ?? null,
      };
      const payload = {
        aps: {
          alert: { title: item.title.slice(0, 160), body },
          sound: "default",
          badge: Math.max(0, Math.min(99, item.badge_count ?? 0)),
          "thread-id": item.notification_type,
        },
        // Keep the canonical values at the top level for old builds while the
        // complete dictionary remains nested for current builds.
        notification_id: item.notification_id,
        workspace_id: item.workspace_id,
        app_destination: customData.app_destination,
        action_url: item.action_url,
        portal: item.notification_data?.portal ?? null,
        acting_role: item.notification_data?.acting_role ?? null,
        data: customData,
      };

      try {
        const response = await fetch(`https://${host}/3/device/${item.token}`, {
          method: "POST",
          headers: {
            authorization: `bearer ${jwt}`,
            "apns-topic": topic,
            "apns-push-type": "alert",
            "apns-priority": "10",
            "apns-expiration": item.expires_at
              ? String(Math.floor(new Date(item.expires_at).getTime() / 1000))
              : String(Math.floor(Date.now() / 1000) + 86400),
            "content-type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const apnsId = response.headers.get("apns-id");
        const responseBody = await response.json().catch(() => ({}));
        const reason = typeof responseBody?.reason === "string" ? responseBody.reason : null;
        if (response.ok) {
          delivered++;
          await admin.from("push_notification_deliveries").update({
            status: "delivered", apns_id: apnsId, apns_status: response.status,
            failure_reason: null, delivered_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq("id", item.delivery_id);
        } else if ([400, 410].includes(response.status) && ["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"].includes(reason ?? "")) {
          failed++;
          await admin.from("push_notification_deliveries").update({
            status: "failed", apns_id: apnsId, apns_status: response.status,
            failure_reason: reason ?? "Invalid device token", updated_at: new Date().toISOString(),
          }).eq("id", item.delivery_id);
          await admin.from("device_tokens").update({
            active: false, invalidated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq("id", item.device_token_id);
        } else if (response.status === 429 || response.status >= 500) {
          if (item.attempt_count >= item.max_attempts) {
            failed++;
            await admin.from("push_notification_deliveries").update({
              status: "dead_letter", dead_lettered_at: new Date().toISOString(), apns_id: apnsId,
              apns_status: response.status, failure_reason: reason ?? `APNs ${response.status}`,
              updated_at: new Date().toISOString(),
            }).eq("id", item.delivery_id);
          } else {
            retrying++;
            const next = new Date(Date.now() + retryDelaySeconds(item.attempt_count) * 1000).toISOString();
            await admin.from("push_notification_deliveries").update({
              status: "retrying", apns_id: apnsId, apns_status: response.status,
              failure_reason: reason ?? `APNs ${response.status}`, next_attempt_at: next, updated_at: new Date().toISOString(),
            }).eq("id", item.delivery_id);
          }
        } else {
          failed++;
          await admin.from("push_notification_deliveries").update({
            status: "failed", apns_id: apnsId, apns_status: response.status,
            failure_reason: reason ?? `APNs ${response.status}`, updated_at: new Date().toISOString(),
          }).eq("id", item.delivery_id);
        }
      } catch (error) {
        const exhausted = item.attempt_count >= item.max_attempts;
        if (exhausted) failed++; else retrying++;
        const next = new Date(Date.now() + retryDelaySeconds(item.attempt_count) * 1000).toISOString();
        await admin.from("push_notification_deliveries").update({
          status: exhausted ? "dead_letter" : "retrying",
          dead_lettered_at: exhausted ? new Date().toISOString() : null,
          failure_reason: error instanceof Error ? error.message.slice(0, 500) : "Network failure",
          next_attempt_at: next, updated_at: new Date().toISOString(),
        }).eq("id", item.delivery_id);
      }
    }

    return Response.json({ claimed: deliveries.length, delivered, retrying, failed });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Push dispatch failed" }, { status: 500 });
  }
});
