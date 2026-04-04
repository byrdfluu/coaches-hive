# Guardian Approval Email Template Requirements

This is the template contract for the Postmark `guardian_approval_request` email used by:

- [src/app/api/guardian-approvals/request/route.ts](/Users/juwan/Desktop/Main%20CH%20Code/chmain/CHMain/src/app/api/guardian-approvals/request/route.ts)

The app only sends a template alias plus model data. The visual HTML lives in Postmark, so cross-device consistency must be fixed in the Postmark template itself.

## Current Send Contract

Template alias:

- `guardian_approval_request`

Template model fields currently sent:

- `first_name`
- `full_name`
- `support_email`
- `athlete_name`
- `action_url`
- `message_preview`

## Why Phone And Desktop Look Different

Different mail clients are restyling the same template:

- dark mode color inversion on desktop clients
- mobile width compression and font scaling
- transparent logo/background treatment rendering differently across clients

This is a template-rendering problem, not a sign that the platform is sending two different emails.

## Required Template Rules

- Use a fixed light-mode card layout. Do not rely on client dark-mode inversion.
- Apply inline background and text colors on every major table cell.
- Use a single-column email-safe table layout with a max width of `600px`.
- Use `width="100%"` containers so the template collapses cleanly on phones.
- Use a non-transparent logo treatment that already includes the intended background treatment.
- Do not rely on CSS classes alone; Gmail and Outlook strip or ignore many styles.
- Use a bulletproof CTA button built from tables, not a plain text link alone.
- Keep body copy inside padded table cells, not bare text on the root body.
- Keep support footer copy visible in both light and dark mail clients.

## Visual Requirements

- Header background: `#b80f0a`
- Main body background: `#ffffff`
- Primary text: `#191919`
- Secondary text: `#4a4a4a`
- Outer canvas: neutral light background, not auto-dark
- CTA label: `Review request`
- CTA color: `#b80f0a` background with white text

## Logo Requirements

- Do not use a transparent logo asset directly over a client-managed background.
- Export a logo block that already looks correct on the red header.
- Avoid dark transparent padding around the mark, which is what commonly shows up in Gmail mobile/dark-mode combinations.

## Content Requirements

- Heading: `Guardian approval requested`
- Greeting should use the guardian first name when available.
- Body should clearly state the athlete name and that approval is needed to continue.
- CTA must point to the absolute `action_url`.
- Footer must include the support email.

## Client Test Matrix

Before locking the template, verify it in:

- Gmail web
- Gmail mobile on iPhone
- Apple Mail on iPhone
- Apple Mail on macOS
- Outlook web

## Expected Outcome

The email should look materially the same on phone and desktop:

- same light card
- same red header
- same readable logo
- same CTA prominence
- no dark-mode inversion breaking the brand or logo
