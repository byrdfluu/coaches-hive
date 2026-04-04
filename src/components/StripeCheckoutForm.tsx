'use client'

import { CardElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { useEffect, useState } from 'react'

type SavedMethod = {
  id: string
  brand: string
  last4: string
  exp_month?: number
  exp_year?: number
}

type StripeCheckoutFormProps = {
  clientSecret: string
  onSuccess: (paymentIntentId: string) => Promise<void>
}

const BRAND_LABELS: Record<string, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  discover: 'Discover',
  jcb: 'JCB',
  diners: 'Diners',
  unionpay: 'UnionPay',
}

export default function StripeCheckoutForm({ clientSecret, onSuccess }: StripeCheckoutFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [savedMethods, setSavedMethods] = useState<SavedMethod[]>([])
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null)
  const [loadingMethods, setLoadingMethods] = useState(true)

  useEffect(() => {
    fetch('/api/payments/methods')
      .then((r) => r.json())
      .then((data) => {
        const methods: SavedMethod[] = data.methods || []
        setSavedMethods(methods)
        if (methods.length > 0) setSelectedMethodId(methods[0].id)
      })
      .catch(() => {})
      .finally(() => setLoadingMethods(false))
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!stripe || !elements) return

    setProcessing(true)
    setErrorMessage('')

    let result

    if (selectedMethodId) {
      result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: selectedMethodId,
      })
    } else {
      const cardElement = elements.getElement(CardElement)
      if (!cardElement) {
        setErrorMessage('Payment form is not ready.')
        setProcessing(false)
        return
      }
      result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement },
      })
    }

    if (result.error) {
      setErrorMessage(result.error.message || 'Payment failed.')
      setProcessing(false)
      return
    }

    if (result.paymentIntent?.status === 'succeeded') {
      await onSuccess(result.paymentIntent.id)
    } else {
      setErrorMessage('Payment did not complete.')
    }

    setProcessing(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!loadingMethods && savedMethods.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#4a4a4a]">Saved cards</p>
          {savedMethods.map((method) => (
            <label
              key={method.id}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                selectedMethodId === method.id
                  ? 'border-[#191919] bg-[#f5f5f5]'
                  : 'border-[#dcdcdc] bg-white hover:border-[#9a9a9a]'
              }`}
            >
              <input
                type="radio"
                name="payment_method"
                value={method.id}
                checked={selectedMethodId === method.id}
                onChange={() => setSelectedMethodId(method.id)}
                className="accent-[#191919]"
              />
              <span className="text-sm font-semibold text-[#191919]">
                {BRAND_LABELS[method.brand.toLowerCase()] ?? method.brand} •••• {method.last4}
              </span>
              <span className="ml-auto text-xs text-[#9a9a9a]">
                {method.exp_month?.toString().padStart(2, '0')}/{method.exp_year}
              </span>
            </label>
          ))}
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${
              selectedMethodId === null
                ? 'border-[#191919] bg-[#f5f5f5]'
                : 'border-[#dcdcdc] bg-white hover:border-[#9a9a9a]'
            }`}
          >
            <input
              type="radio"
              name="payment_method"
              value="new"
              checked={selectedMethodId === null}
              onChange={() => setSelectedMethodId(null)}
              className="accent-[#191919]"
            />
            <span className="text-sm font-semibold text-[#191919]">Use a new card</span>
          </label>
        </div>
      )}

      {selectedMethodId === null && (
        <div className="rounded-2xl border border-[#dcdcdc] bg-white px-3 py-3">
          <CardElement options={{ hidePostalCode: true }} />
        </div>
      )}

      {errorMessage && <p className="text-xs text-[#b80f0a]">{errorMessage}</p>}

      <button
        type="submit"
        disabled={processing || !stripe || loadingMethods}
        className="w-full rounded-full bg-[#b80f0a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#b80f0a] disabled:opacity-60"
      >
        {processing ? 'Processing...' : 'Pay now'}
      </button>
    </form>
  )
}
