export type SupportTemplate = {
  id: string
  title: string
  channel: string
  updated: string
  body: string
  keywords: string[]
}

export const SUPPORT_TEMPLATES: SupportTemplate[] = [
  {
    id: 'TMP-01',
    title: 'Payment retry steps',
    channel: 'Email',
    updated: '2 days ago',
    body:
      'Thanks for reaching out! Please retry your payment from Settings → Billing. If it still fails, send us the last 4 digits and the error message, and we will take it from there.',
    keywords: ['payment', 'card', 'billing', 'invoice', 'fee'],
  },
  {
    id: 'TMP-02',
    title: 'Marketplace dispute intake',
    channel: 'Email',
    updated: '1 week ago',
    body:
      'We can help with this dispute. Please share the order ID, date of purchase, and a brief summary of what happened. We will review and respond within 24 hours.',
    keywords: ['dispute', 'refund', 'chargeback', 'marketplace', 'order'],
  },
  {
    id: 'TMP-03',
    title: 'Coach onboarding assist',
    channel: 'Chat',
    updated: '3 weeks ago',
    body:
      'Happy to help you onboard! Start with profile → payouts → availability. If you get stuck, tell us which step is blocking you.',
    keywords: ['onboarding', 'setup', 'availability', 'payout', 'stripe'],
  },
  {
    id: 'TMP-04',
    title: 'Org admin verification',
    channel: 'Email',
    updated: '1 month ago',
    body:
      'We can verify your org quickly. Please confirm the org name, your role, and any supporting documentation. We will update you once the review is complete.',
    keywords: ['verification', 'verify', 'org', 'admin', 'approval'],
  },
  {
    id: 'TMP-05',
    title: 'Login & access help',
    channel: 'Email',
    updated: '2 weeks ago',
    body:
      'Let’s get you back in. Please confirm the email on the account and whether you see any specific error message. We can reset access once verified.',
    keywords: ['login', 'access', 'password', 'sign in', '2fa'],
  },
]

export const suggestTemplateId = (subject: string, body: string = '') => {
  const haystack = `${subject} ${body}`.toLowerCase()
  for (const template of SUPPORT_TEMPLATES) {
    if (template.keywords.some((keyword) => haystack.includes(keyword))) {
      return template.id
    }
  }
  return null
}
