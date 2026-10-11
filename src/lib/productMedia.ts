import { supabaseAdmin } from '@/lib/supabaseAdmin'

const PRODUCT_MEDIA_BUCKET = 'product-media'
const SIGNED_URL_TTL_SECONDS = 30 * 60

export async function signProductMediaPath(path: unknown): Promise<string | null> {
  if (typeof path !== 'string' || !path.trim()) return null
  const normalized = path.trim()
  if (/^https?:\/\//i.test(normalized)) return normalized

  const { data, error } = await supabaseAdmin.storage
    .from(PRODUCT_MEDIA_BUCKET)
    .createSignedUrl(normalized, SIGNED_URL_TTL_SECONDS)

  return error ? null : data.signedUrl
}

export async function signProductMediaPaths(paths: unknown): Promise<string[]> {
  if (!Array.isArray(paths)) return []
  const signed = await Promise.all(paths.map((path) => signProductMediaPath(path)))
  return signed.filter((url): url is string => Boolean(url))
}
