import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { getSessionRole, jsonError } from '@/lib/apiAuth'
import { resolveAuthorizedAthleteContext } from '@/lib/authorizedAthleteContext'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store, max-age=0' }
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime', 'video/x-m4v'])

async function contextFor(request: Request, form?: FormData) {
  const { session, supabase, error } = await getSessionRole(['athlete'])
  if (error || !session) return { error, session: null, supabase: null, athlete: null }
  const url = new URL(request.url)
  const requested = String(form?.get('athlete_profile_id') || url.searchParams.get('athlete_profile_id') || '').trim() || null
  const athlete = await resolveAuthorizedAthleteContext(session.user.id, requested)
  if (!athlete) return { error: jsonError('Athlete profile not found.', 404), session: null, supabase: null, athlete: null }
  return { error: null, session, supabase, athlete }
}

async function decorate(rows: Array<Record<string, any>>) {
  return Promise.all(rows.map(async (row) => {
    const { data } = await supabaseAdmin.storage.from('private-athlete-media').createSignedUrl(row.storage_path, 300)
    return { ...row, media_url: data?.signedUrl || null }
  }))
}

export async function GET(request: Request) {
  const { error, athlete } = await contextFor(request)
  if (error || !athlete) return error
  const { data, error: dbError } = await supabaseAdmin.from('athlete_highlights')
    .select('id,athlete_id,media_type,storage_path,file_name,mime_type,size_bytes,duration_seconds,created_at')
    .eq('athlete_id', athlete.profileId).order('created_at', { ascending: false })
  if (dbError) return jsonError('Unable to load highlights.', 500)
  return NextResponse.json({ highlights: await decorate(data || []) }, { headers: noStore })
}

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  if (!form) return jsonError('Upload form is required.')
  const { error, session, supabase, athlete } = await contextFor(request, form)
  if (error || !session || !supabase || !athlete) return error
  const file = form.get('file')
  if (!(file instanceof File) || file.size === 0) return jsonError('Select a photo or video.')
  if (!allowedTypes.has(file.type)) return jsonError('Use a supported photo or video format.')
  const mediaType = file.type.startsWith('video/') ? 'video' : 'image'
  const maxBytes = mediaType === 'video' ? 200 * 1024 * 1024 : 20 * 1024 * 1024
  if (file.size > maxBytes) return jsonError(mediaType === 'video' ? 'Video must be 200 MB or smaller.' : 'Image must be 20 MB or smaller.')
  const duration = Number(form.get('duration_seconds') || 0)
  if (mediaType === 'video' && (!Number.isFinite(duration) || duration <= 0 || duration > 180)) return jsonError('Video must be 3 minutes or shorter.')
  const id = randomUUID()
  const extension = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || (mediaType === 'video' ? 'mov' : 'jpg')
  const path = `${session.user.id}/athlete-highlights/${athlete.profileId}/${id}.${extension}`
  const { error: uploadError } = await supabase.storage.from('private-athlete-media').upload(path, file, { contentType: file.type, upsert: false })
  if (uploadError) return jsonError('Unable to upload highlight.', 500)
  const { data, error: dbError } = await supabaseAdmin.from('athlete_highlights').insert({
    id, athlete_id: athlete.profileId, media_type: mediaType, storage_path: path,
    file_name: file.name, mime_type: file.type, size_bytes: file.size,
    duration_seconds: mediaType === 'video' ? duration : null, created_by: session.user.id,
  }).select('*').single()
  if (dbError) {
    await supabaseAdmin.storage.from('private-athlete-media').remove([path])
    return jsonError('Unable to save highlight.', 500)
  }
  return NextResponse.json({ highlight: (await decorate([data]))[0] }, { status: 201, headers: noStore })
}

export async function DELETE(request: Request) {
  const { error, session, athlete } = await contextFor(request)
  if (error || !session || !athlete) return error
  const id = new URL(request.url).searchParams.get('id') || ''
  if (!id) return jsonError('Highlight id is required.')
  const { data: existing } = await supabaseAdmin.from('athlete_highlights')
    .select('id,storage_path,created_by').eq('id', id).eq('athlete_id', athlete.profileId).maybeSingle()
  if (!existing || existing.created_by !== session.user.id) return jsonError('Highlight not found.', 404)
  const { error: dbError } = await supabaseAdmin.from('athlete_highlights').delete().eq('id', id)
  if (dbError) return jsonError('Unable to delete highlight.', 500)
  const { error: storageError } = await supabaseAdmin.storage.from('private-athlete-media').remove([existing.storage_path])
  if (storageError) return jsonError('Highlight record was deleted, but its file cleanup failed.', 500)
  return NextResponse.json({ ok: true }, { headers: noStore })
}
