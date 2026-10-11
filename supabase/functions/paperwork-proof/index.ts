import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import { PublicError, publicErrorResponse, readJSONBody, requireUUID } from "../_shared/edge-security.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};

type RequestBody = {
  record_type: "coach_waiver" | "org_document";
  record_id: string; // assignment/completion id
};

const sha256 = async (data: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function renderProof(lines: Array<[string, string]>, body: string) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 746;
  const write = (text: string, size = 10, isBold = false) => {
    for (const raw of text.split("\n")) {
      const words = raw.split(/\s+/); let line = "";
      for (const word of words) {
        if ((isBold ? bold : regular).widthOfTextAtSize(`${line} ${word}`.trim(), size) > 520) {
          if (y < 52) { page = pdf.addPage([612, 792]); y = 746; }
          page.drawText(line, { x: 46, y, size, font: isBold ? bold : regular, color: rgb(0.08, 0.08, 0.08) }); y -= size + 5; line = word;
        } else line = `${line} ${word}`.trim();
      }
      if (y < 52) { page = pdf.addPage([612, 792]); y = 746; }
      if (line) page.drawText(line, { x: 46, y, size, font: isBold ? bold : regular, color: rgb(0.08, 0.08, 0.08) });
      y -= size + 7;
    }
  };
  write("Coaches Hive Immutable Signed Record", 18, true); y -= 8;
  for (const [label, value] of lines) { write(label, 9, true); write(value || "Unavailable", 9); y -= 3; }
  y -= 6; write("Frozen document snapshot", 13, true); write(body || "No text body was supplied. The attached source-file hash remains part of this proof.", 10);
  return new Uint8Array(await pdf.save());
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: { ...cors, Allow: "POST, OPTIONS" } });
  try {
    const authHeader = request.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) throw new PublicError("authentication_required", "Authentication required.", 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) throw new PublicError("authentication_required", "Authentication required.", 401);
    const { data: active, error: activeError } = await userClient.rpc("account_is_active", { p_user_id: user.id });
    if (activeError || active !== true) throw new PublicError("account_inactive", "Active account required.", 403);
    const admin = createClient(url, serviceRole);
    const body = await readJSONBody<RequestBody>(request, 4_096);
    requireUUID(body.record_id, "record_id");
    if (!["coach_waiver", "org_document"].includes(body.record_type)) throw new PublicError("invalid_request", "Invalid proof request.");
    const { error: rateError } = await admin.rpc("assert_edge_action_rate_limit", {
      p_actor_user_id: user.id, p_action: "paperwork_proof", p_resource_key: body.record_id,
      p_max_attempts: 10, p_window_seconds: 3600,
    });
    if (rateError) throw new PublicError("rate_limited", "Too many proof requests. Try again later.", 429);

    // Enforce the caller's row policies before reading snapshots with service privileges.
    const sourceTable = body.record_type === "coach_waiver" ? "coach_waiver_assignments" : "org_document_completions";
    const { data: visible, error: visibilityError } = await userClient.from(sourceTable).select("id").eq("id", body.record_id).single();
    if (visibilityError || !visible) throw new PublicError("access_denied", "Proof access denied.", 403);

    let artifact: Uint8Array; let storagePath: string; let table: string; let sourceId: string; let athleteId: string;
    if (body.record_type === "coach_waiver") {
      const { data: row, error } = await admin.from("coach_waiver_assignments")
        .select("id,waiver_id,athlete_id,status,signed_at,signature_name,signer_relationship,signature_hash,signature_audit,signed_title_snapshot,signed_body_snapshot,signed_coach_name_snapshot,signed_file_sha256_snapshot,athlete_profiles!inner(owner_user_id),coach_waivers!inner(coach_id)")
        .eq("id", body.record_id).single();
      if (error || !row || (row.status !== "signed" || !row.signature_hash)) throw new PublicError("not_found", "Signed waiver not found.", 404);
      const athlete = Array.isArray(row.athlete_profiles) ? row.athlete_profiles[0] : row.athlete_profiles;
      const waiver = Array.isArray(row.coach_waivers) ? row.coach_waivers[0] : row.coach_waivers;
      if (athlete?.owner_user_id !== user.id && waiver?.coach_id !== user.id) throw new PublicError("access_denied", "Proof access denied.", 403);
      artifact = await renderProof([
        ["Title", row.signed_title_snapshot], ["Issued by", row.signed_coach_name_snapshot],
        ["Stored signer", row.signature_name], ["Signer relationship", row.signer_relationship],
        ["Signed at", row.signed_at], ["Assignment ID", row.id], ["Waiver ID", row.waiver_id],
        ["Signature SHA-256", row.signature_hash], ["Source file SHA-256", row.signed_file_sha256_snapshot],
        ["Audit JSON", JSON.stringify(row.signature_audit)],
      ], row.signed_body_snapshot ?? "");
      storagePath = `coach-waiver/${row.waiver_id}/${row.id}.pdf`; table = "coach_waiver_assignments"; sourceId = row.waiver_id; athleteId = row.athlete_id;
    } else {
      const { data: row, error } = await admin.from("org_document_completions")
        .select("id,document_id,athlete_id,status,completed_at,signature_name,signer_relationship,signature_hash,signature_audit,signed_title_snapshot,signed_org_name_snapshot,signed_file_sha256_snapshot,athlete_profiles!inner(owner_user_id),org_documents!inner(org_id)")
        .eq("id", body.record_id).single();
      if (error || !row || (row.status !== "complete" || !row.signature_hash)) throw new PublicError("not_found", "Signed document not found.", 404);
      const athlete = Array.isArray(row.athlete_profiles) ? row.athlete_profiles[0] : row.athlete_profiles;
      const document = Array.isArray(row.org_documents) ? row.org_documents[0] : row.org_documents;
      const { data: isDirector, error: directorError } = await userClient.rpc("is_org_director", { target_org_id: document?.org_id });
      if (athlete?.owner_user_id !== user.id && (directorError || isDirector !== true)) throw new PublicError("access_denied", "Proof access denied.", 403);
      artifact = await renderProof([
        ["Title", row.signed_title_snapshot], ["Issued by", row.signed_org_name_snapshot],
        ["Stored signer", row.signature_name], ["Signer relationship", row.signer_relationship],
        ["Signed at", row.completed_at], ["Completion ID", row.id], ["Document ID", row.document_id],
        ["Signature SHA-256", row.signature_hash], ["Source file SHA-256", row.signed_file_sha256_snapshot],
        ["Audit JSON", JSON.stringify(row.signature_audit)],
      ], "The exact uploaded document is identified by the source-file hash and retained storage snapshot above.");
      storagePath = `org-document/${row.document_id}/${row.id}.pdf`; table = "org_document_completions"; sourceId = row.document_id; athleteId = row.athlete_id;
    }

    const { error: uploadError } = await admin.storage.from("signed-paperwork").upload(storagePath, artifact, { contentType: "application/pdf", upsert: false });
    if (uploadError && !uploadError.message.toLowerCase().includes("already exists")) throw uploadError;
    // On a retry another PDF may already exist. Hash the retained bytes, never the newly rendered candidate.
    const { data: retained, error: retainedError } = await admin.storage.from("signed-paperwork").download(storagePath);
    if (retainedError || !retained) throw retainedError ?? new Error("Retained proof could not be read");
    const hash = await sha256(new Uint8Array(await retained.arrayBuffer()));
    const { error: updateError } = await admin.from(table).update({ signed_pdf_storage_path: storagePath, signed_pdf_sha256: hash, proof_generated_at: new Date().toISOString() }).eq("id", body.record_id);
    if (updateError) throw updateError;
    await admin.from("paperwork_audit_events").insert({ actor_user_id: user.id, record_type: body.record_type, record_id: sourceId, athlete_id: athleteId, event_type: "proof_generated", metadata: { signed_record_id: body.record_id, pdf_sha256: hash, ip: request.headers.get("x-forwarded-for"), user_agent: request.headers.get("user-agent") } });
    const { data: signed, error: signedError } = await admin.storage.from("signed-paperwork").createSignedUrl(storagePath, 300);
    if (signedError || !signed?.signedUrl) throw signedError ?? new Error("Unable to create proof download URL");
    return Response.json({ storage_path: storagePath, pdf_sha256: hash, signed_url: signed?.signedUrl }, { headers: cors });
  } catch (error) {
    return publicErrorResponse(error, cors);
  }
});
