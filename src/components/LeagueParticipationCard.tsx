'use client'

import { useCallback, useEffect, useState } from 'react'

type LeagueSignature = {
  signer_name: string
  signer_capacity: string
  signed_at: string
  signature_hash: string
}

type LeagueDocument = {
  id: string
  title: string
  document_type: string
  target_type: string
  due_at: string | null
  is_required: boolean
  storage_path: string | null
  signed_url: string | null
  signature: LeagueSignature | null
}

type League = {
  id: string
  name: string
  sport?: string | null
  general_location?: string | null
  seasons?: Array<{ name?: string | null; registration_status?: string | null }>
  announcements?: Array<{ title: string; body: string }>
  games?: unknown[]
  documents?: LeagueDocument[]
}

const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export default function LeagueParticipationCard() {
  const [data, setData] = useState<League[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<LeagueDocument | null>(null)
  const [signerName, setSignerName] = useState('')
  const [signerCapacity, setSignerCapacity] = useState('authorized_representative')
  const [authority, setAuthority] = useState(false)
  const [consent, setConsent] = useState(false)
  const [signing, setSigning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/league/participation', { cache: 'no-store' })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'League information is temporarily unavailable.')
      setData(payload?.leagues || [])
      setSignerCapacity(payload?.signer_capacity || 'authorized_representative')
      setSignerName((current) => current || payload?.default_signer_name || '')
      setError('')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'League information is temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const openDocument = (document: LeagueDocument) => {
    setSelected(document)
    setAuthority(false)
    setConsent(false)
    setError('')
  }

  const sign = async () => {
    if (!selected) return
    setSigning(true)
    setError('')
    try {
      const response = await fetch('/api/league/participation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: selected.id,
          signer_name: signerName,
          authority_attested: authority,
          consent_attested: consent,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || 'Unable to sign this document.')
      setSelected(null)
      await load()
    } catch (signError) {
      setError(signError instanceof Error ? signError.message : 'Unable to sign this document.')
    } finally {
      setSigning(false)
    }
  }

  if (loading) return <section className="rounded-2xl border border-[#dcdcdc] bg-white p-5"><p className="text-sm">Loading league information…</p></section>
  if (error && !data.length) return <section className="rounded-2xl border border-[#dcdcdc] bg-white p-5"><p className="text-sm text-[#b80f0a]">{error}</p><button type="button" onClick={load} className="mt-2 text-sm font-semibold underline">Retry</button></section>
  if (!data.length) return null

  return (
    <section className="rounded-2xl border border-[#dcdcdc] bg-white p-5">
      <h2 className="text-lg font-semibold">League participation</h2>
      {error && <p className="mt-3 text-sm text-[#b80f0a]">{error}</p>}
      <div className="mt-4 space-y-4">
        {data.map((league) => (
          <article key={league.id} className="rounded-xl bg-[#f7f6f4] p-4">
            <h3 className="font-semibold">{league.name}</h3>
            <p className="mt-1 text-sm text-[#4a4a4a]">{[league.sport, league.general_location, league.seasons?.[0]?.name].filter(Boolean).join(' · ')}</p>
            {league.announcements?.[0] && <p className="mt-3 text-sm"><strong>{league.announcements[0].title}:</strong> {league.announcements[0].body}</p>}
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#4a4a4a]">
              <span>{league.games?.length || 0} scheduled games</span>
              <span>{league.documents?.length || 0} document requirements</span>
              <span>Registration: {league.seasons?.[0]?.registration_status || 'not set'}</span>
            </div>
            {(league.documents?.length || 0) > 0 && (
              <div className="mt-4 space-y-2 border-t border-[#dcdcdc] pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#6b5f55]">League requirements</p>
                {league.documents?.map((document) => (
                  <div key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dcdcdc] bg-white p-3">
                    <div>
                      <p className="text-sm font-semibold">{document.title}{document.is_required ? ' · Required' : ''}</p>
                      <p className="text-xs text-[#6b6b6b]">
                        {document.signature ? `Signed ${new Date(document.signature.signed_at).toLocaleDateString()}` : [label(document.target_type), document.due_at ? `Due ${new Date(document.due_at).toLocaleDateString()}` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button type="button" onClick={() => openDocument(document)} className="rounded-full border border-[#191919] px-3 py-2 text-xs font-semibold">
                      {document.signature ? 'View signature' : 'Review & sign'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="League document signature">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs uppercase tracking-[0.2em] text-[#6b5f55]">League document</p><h3 className="mt-1 text-xl font-semibold">{selected.title}</h3></div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close" className="rounded-full border border-[#dcdcdc] px-3 py-1">×</button>
            </div>
            <p className="mt-2 text-sm text-[#6b6b6b]">{label(selected.document_type)} · Signing as {label(signerCapacity)}</p>
            {selected.signed_url ? <a href={selected.signed_url} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm font-semibold underline">Review document</a> : <p className="mt-4 text-sm text-[#b80f0a]">The league has not attached a file yet.</p>}

            {selected.signature ? (
              <div className="mt-5 rounded-2xl bg-[#f3faf5] p-4 text-sm">
                <p className="font-semibold text-[#1f7a3f]">Electronically signed</p>
                <p className="mt-2">Signer: {selected.signature.signer_name}</p>
                <p>Capacity: {label(selected.signature.signer_capacity)}</p>
                <p>Signed: {new Date(selected.signature.signed_at).toLocaleString()}</p>
                <p className="mt-2 break-all font-mono text-xs text-[#6b6b6b]">Audit hash: {selected.signature.signature_hash}</p>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <label className="block text-sm font-semibold">Full legal name<input value={signerName} onChange={(event) => setSignerName(event.target.value)} className="mt-2 w-full rounded-xl border border-[#dcdcdc] px-3 py-2 font-normal" /></label>
                <label className="flex gap-3 text-sm"><input type="checkbox" checked={authority} onChange={(event) => setAuthority(event.target.checked)} />I confirm I am authorized to sign in this capacity.</label>
                <label className="flex gap-3 text-sm"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />I consent to electronic records and an electronic signature.</label>
                <p className="text-xs text-[#6b6b6b]">Your identity, consent, document snapshot, time, account, and audit hash are retained with this signature.</p>
                <button type="button" onClick={sign} disabled={signing || !selected.storage_path || signerName.trim().length < 2 || !authority || !consent} className="w-full rounded-full bg-[#191919] px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{signing ? 'Signing…' : 'Sign document'}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
