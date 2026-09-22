'use client'

import { useEffect, useState, use } from 'react'
import { Elements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import StripeCheckoutForm from '@/components/StripeCheckoutForm'
import { checkYouthRegistration } from '@/lib/youthPrivacy'

const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
const stripePromise = stripePublishableKey ? loadStripe(stripePublishableKey) : null

type FormMeta = {
  id: string
  title: string
  description: string | null
  sport: string | null
  age_group: string | null
  org_name: string | null
  enrollment_fee_cents?: number | null
  amountCents?: number | null
  pricingPhase?: 'early_bird'|'standard'|'late'
  required_waiver_ids?: string[]
  waivers?: Array<{ id: string; title: string; body: string }>
  required_documents?: Array<{ id: string; label: string; instructions?: string; required?: boolean }>
}

type DocumentUpload = { id: string; requirement_id: string; filename: string; token: string }

export default function PublicEnrollPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const [form, setForm] = useState<FormMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [signedWaiverIds, setSignedWaiverIds] = useState<string[]>([])
  const [coppaConsent, setCoppaConsent] = useState(false)
  const [documentUploads, setDocumentUploads] = useState<Record<string, DocumentUpload>>({})
  const [uploadingDocument, setUploadingDocument] = useState<string | null>(null)

  const [fields, setFields] = useState({
    athlete_name: '', athlete_email: '', date_of_birth: '',
    guardian_name: '', guardian_email: '', guardian_phone: '', notes: '', waiver_signer_name: '',
  })
  const youth = checkYouthRegistration(fields.date_of_birth)
  const contactReady = youth.isMinor
    ? Boolean(fields.guardian_name.trim() && fields.guardian_email.trim() && (!youth.isUnder13 || coppaConsent))
    : Boolean(fields.athlete_email.trim())

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/enroll/${slug}`)
      if (!res.ok) { setNotFound(true); setLoading(false); return }
      const data = await res.json()
      setForm(data.form)
      setLoading(false)
    }
    load()
  }, [slug])

  const submitApplication = async (paymentIntentId?: string) => {
    if (!fields.athlete_name.trim() || !contactReady) return
    setSubmitting(true)
    setError('')
    const res = await fetch(`/api/enroll/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...fields,
        signed_waiver_ids: signedWaiverIds,
        registration_source: 'direct_link',
        coppa_consent_given: coppaConsent,
        payment_intent_id: paymentIntentId || undefined,
        document_uploads: Object.values(documentUploads),
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (!res.ok) { setError(data?.error || 'Unable to submit. Please try again.'); return }
    setSubmitted(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fields.athlete_name.trim() || !contactReady) return
    if (youth.error) { setError(youth.error); return }
    if ((form?.required_waiver_ids || []).some((id) => !signedWaiverIds.includes(id))) {
      setError('Complete every required waiver acknowledgment before continuing.')
      return
    }
    if ((form?.waivers || []).length > 0 && !fields.waiver_signer_name.trim()) {
      setError('Enter the full legal name of the person signing the waivers.')
      return
    }
    const missingDocument = (form?.required_documents || []).find((item) => item.required !== false && !documentUploads[item.id])
    if (missingDocument) {
      setError(`Upload ${missingDocument.label} before continuing.`)
      return
    }
    if ((form?.amountCents ?? form?.enrollment_fee_cents ?? 0) <= 0) {
      await submitApplication()
      return
    }
    if (!stripePromise) {
      setError('Payment is not configured yet.')
      return
    }
    setSubmitting(true)
    setError('')
    const res = await fetch(`/api/enroll/${slug}/intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, coppa_consent_given: coppaConsent }),
    })
    const data = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (!res.ok || !data?.clientSecret) {
      setError(data?.error || 'Unable to start payment. Please try again.')
      return
    }
    setClientSecret(data.clientSecret)
  }

  const uploadDocument = async (requirementId: string, file?: File) => {
    if (!file) return
    setUploadingDocument(requirementId)
    setError('')
    const body = new FormData()
    body.set('requirement_id', requirementId)
    body.set('file', file)
    const response = await fetch(`/api/enroll/${slug}/documents`, { method: 'POST', body })
    const payload = await response.json().catch(() => ({}))
    setUploadingDocument(null)
    if (!response.ok) { setError(payload?.error || 'Unable to upload the document.'); return }
    setDocumentUploads((current) => ({ ...current, [requirementId]: payload.upload }))
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f9f9]">
        <p className="text-sm text-[#9b9b9b]">Loading...</p>
      </div>
    )
  }

  if (notFound || !form) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f9f9]">
        <div className="text-center">
          <p className="text-lg font-semibold text-[#191919]">Form not found</p>
          <p className="mt-1 text-sm text-[#9b9b9b]">This enrollment link may have expired or been removed.</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f9f9f9] px-4">
        <div className="w-full max-w-md rounded-2xl border border-[#dcdcdc] bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-[#191919]">Application sent!</h1>
          <p className="mt-2 text-sm text-[#4a4a4a]">
            Your application was sent to {form.org_name ?? 'the program'}. The program director will review it and reach out.
          </p>
          <p className="mt-3 text-sm text-[#4a4a4a]">Check your email for a secure link to manage this registration{youth.isMinor ? ' and complete guardian approval' : ''}. No password is required.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f9f9f9] px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 text-center">
          {form.org_name && (
            <p className="text-xs font-semibold uppercase tracking-widest text-[#9b9b9b]">{form.org_name}</p>
          )}
          <h1 className="mt-1 text-2xl font-bold text-[#191919]">{form.title}</h1>
          {form.description && <p className="mt-2 text-sm text-[#4a4a4a]">{form.description}</p>}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {form.sport && (
              <span className="rounded-full border border-[#dcdcdc] px-3 py-0.5 text-xs text-[#4a4a4a]">{form.sport}</span>
            )}
            {form.age_group && (
              <span className="rounded-full border border-[#dcdcdc] px-3 py-0.5 text-xs text-[#4a4a4a]">{form.age_group}</span>
            )}
            <span className="rounded-full border border-[#dcdcdc] px-3 py-0.5 text-xs text-[#4a4a4a]">
              {(form.amountCents ?? form.enrollment_fee_cents) ? `$${((form.amountCents ?? form.enrollment_fee_cents ?? 0) / 100).toFixed(2).replace(/\.00$/, '')}` : 'Free'}
            </span>
          </div>
        </div>

        {clientSecret && stripePromise ? (
          <div className="rounded-2xl border border-[#dcdcdc] bg-white p-6 shadow-sm">
            <div className="mb-4 rounded-2xl border border-[#dcdcdc] bg-[#f9f9f9] p-4 text-sm text-[#4a4a4a]">
              Pay {(form.amountCents ?? form.enrollment_fee_cents) ? `$${((form.amountCents ?? form.enrollment_fee_cents ?? 0) / 100).toFixed(2).replace(/\.00$/, '')}` : '$0'} to submit this application for {fields.athlete_name}.
            </div>
            <Elements stripe={stripePromise} options={{ clientSecret }}>
              <StripeCheckoutForm clientSecret={clientSecret} onSuccess={submitApplication} />
            </Elements>
            <button
              type="button"
              onClick={() => setClientSecret('')}
              className="mt-4 w-full rounded-full border border-[#dcdcdc] px-4 py-3 text-sm font-semibold text-[#191919]"
            >
              Edit application details
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-[#dcdcdc] bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#191919] mb-1">Athlete name *</label>
              <input
                required
                className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                placeholder="Full name"
                value={fields.athlete_name}
                onChange={(e) => setFields((p) => ({ ...p, athlete_name: e.target.value }))}
              />
            </div>
            {(form.required_documents || []).length > 0 && (
              <fieldset className="rounded-xl border border-[#dcdcdc] p-4">
                <legend className="px-1 text-xs font-semibold text-[#191919]">Registration documents</legend>
                <p className="mt-1 text-xs text-[#6b6b6b]">PDF, JPG, PNG, DOC, or DOCX. Maximum 10 MB per file.</p>
                <div className="mt-3 space-y-4">
                  {(form.required_documents || []).map((document) => (
                    <div key={document.id}>
                      <label className="block text-sm font-semibold text-[#191919]">{document.label}{document.required !== false ? ' *' : ''}</label>
                      {document.instructions ? <p className="mb-2 text-xs text-[#6b6b6b]">{document.instructions}</p> : null}
                      <input
                        type="file"
                        required={document.required !== false && !documentUploads[document.id]}
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        disabled={uploadingDocument === document.id}
                        onChange={(event) => uploadDocument(document.id, event.target.files?.[0])}
                        className="block w-full text-xs text-[#4a4a4a] file:mr-3 file:rounded-full file:border-0 file:bg-[#191919] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white"
                      />
                      {uploadingDocument === document.id ? <p className="mt-1 text-xs text-[#6b6b6b]">Uploading securely...</p> : null}
                      {documentUploads[document.id] ? <p className="mt-1 text-xs font-semibold text-emerald-700">Uploaded: {documentUploads[document.id].filename}</p> : null}
                    </div>
                  ))}
                </div>
              </fieldset>
            )}
            {(form.waivers || []).length > 0 && (
              <fieldset className="rounded-xl border border-[#dcdcdc] p-4">
                <legend className="px-1 text-xs font-semibold text-[#191919]">Required waivers</legend>
                <div className="mt-2 space-y-4">
                  {(form.waivers || []).map((waiver) => (
                    <div key={waiver.id} className="rounded-xl bg-[#f9f9f9] p-4">
                      <h2 className="text-sm font-semibold text-[#191919]">{waiver.title}</h2>
                      <div className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-[#4a4a4a]">{waiver.body}</div>
                      <label className="mt-3 flex items-start gap-2 text-sm font-medium text-[#191919]">
                        <input required type="checkbox" className="mt-1" checked={signedWaiverIds.includes(waiver.id)} onChange={(event) => setSignedWaiverIds((current) => event.target.checked ? Array.from(new Set([...current, waiver.id])) : current.filter((id) => id !== waiver.id))} />
                        <span>I have read and agree to this waiver.</span>
                      </label>
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-semibold text-[#191919] mb-1">Signer&apos;s full legal name *</label>
                    <input required className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm" value={fields.waiver_signer_name} onChange={(event) => setFields((current) => ({ ...current, waiver_signer_name: event.target.value }))} autoComplete="name" />
                    <p className="mt-1 text-xs text-[#6b6b6b]">Typing your name and checking each box creates your electronic signature.</p>
                  </div>
                </div>
              </fieldset>
            )}
            <div>
              <label className="block text-xs font-semibold text-[#191919] mb-1">{youth.isUnder13 ? 'Athlete email (not collected for under 13)' : `Athlete email ${youth.isMinor ? '(optional)' : '*'}`}</label>
              <input
                required={!youth.isMinor}
                type="email"
                disabled={youth.isUnder13}
                className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                placeholder={youth.isUnder13 ? 'Use parent or guardian email below' : 'athlete@email.com'}
                value={fields.athlete_email}
                onChange={(e) => setFields((p) => ({ ...p, athlete_email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#191919] mb-1">Date of birth</label>
              <input
                type="date"
                className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                value={fields.date_of_birth}
                onChange={(e) => setFields((p) => ({ ...p, date_of_birth: e.target.value }))}
              />
            </div>

            <p className="pt-2 text-xs font-semibold text-[#9b9b9b] uppercase tracking-widest">Parent / guardian {youth.isMinor ? '(required)' : '(optional)'}</p>

            <div>
              <label className="block text-xs font-semibold text-[#191919] mb-1">Guardian name</label>
              <input
                className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                placeholder="Full name"
                value={fields.guardian_name}
                onChange={(e) => setFields((p) => ({ ...p, guardian_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#191919] mb-1">Guardian email</label>
              <input
                type="email"
                className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                placeholder="parent@email.com"
                value={fields.guardian_email}
                onChange={(e) => setFields((p) => ({ ...p, guardian_email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#191919] mb-1">Guardian phone</label>
              <input
                type="tel"
                className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                placeholder="(555) 000-0000"
                value={fields.guardian_phone}
                onChange={(e) => setFields((p) => ({ ...p, guardian_phone: e.target.value }))}
              />
            </div>
            {youth.isUnder13 && (
              <label className="flex items-start gap-3 rounded-xl border border-[#dcdcdc] bg-[#f9f9f9] p-4 text-sm text-[#4a4a4a]">
                <input required type="checkbox" className="mt-1" checked={coppaConsent} onChange={(event) => setCoppaConsent(event.target.checked)} />
                <span>I am this child&apos;s parent or legal guardian. I consent to Coaches Hive collecting the child&apos;s name, date of birth, participation, waiver, and payment-related information to administer this sports registration. Information is shared with the participating organization and service providers described in the Privacy Policy. I understand I may request access or deletion.</span>
              </label>
            )}
            <div>
              <label className="block text-xs font-semibold text-[#191919] mb-1">Notes</label>
              <textarea
                className="w-full rounded-xl border border-[#dcdcdc] px-3 py-2 text-sm"
                rows={3}
                placeholder="Anything you'd like the program to know..."
                value={fields.notes}
                onChange={(e) => setFields((p) => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-[#b80f0a]">{error}</p>}

          <button
            type="submit"
            disabled={!fields.athlete_name.trim() || !contactReady || Boolean(youth.error) || submitting}
            className="mt-5 w-full rounded-full bg-[#191919] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? 'Working...' : ((form.amountCents ?? form.enrollment_fee_cents) ? 'Continue to payment' : 'Submit application')}
          </button>
        </form>
        )}

        <p className="mt-4 text-center text-xs text-[#9b9b9b]">
          Powered by <span className="font-semibold">Coaches Hive</span>
        </p>
      </div>
    </div>
  )
}
