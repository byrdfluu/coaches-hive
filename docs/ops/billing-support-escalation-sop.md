# Billing + Support Escalation SOP

Owner: Coaches Hive Admin  
Last updated: 2026-01-20

## Purpose
Provide a consistent, fast response process for billing issues and support escalations.

## Scope
- Billing: subscriptions, org fees, marketplace payments, session payments, payouts, refunds.
- Support: bugs, access issues, disputes, data errors, compliance uploads.
- Channels: in-app support, email (support@coacheshive.com), internal admin alerts.

## Roles
- Support Lead (you): triage, updates, customer communication.
- Billing Owner (you): refunds, credits, payout corrections.
- Engineering (you/agent): root-cause fixes and patches.

## Severity Levels
- P0: Platform down, payments blocked platform-wide, major data loss risk.
- P1: Widespread billing failures, multiple users unable to pay or access plans.
- P2: Single org/coach/athlete blocked, payout delayed, charge dispute.
- P3: Minor bug, confusion, how-to, cosmetic issue.

## SLAs
- P0: Respond within 15 min, updates hourly.
- P1: Respond within 1 hr, updates every 4 hrs.
- P2: Respond within 1 business day.
- P3: Respond within 2 business days.

## Notion Setup (Required)
Create these Notion databases:
- Support Queue (tickets)
- Billing Log (payments/refunds/credits)
- Escalations (P0/P1 incidents)

### Support Queue Properties
- Title
- Severity (P0/P1/P2/P3)
- Type (Billing/Support)
- Role (Athlete/Coach/Org/Admin)
- Org Name
- User Email
- Status (New/In progress/Waiting/Resolved)
- Owner
- Created
- Last Updated
- Resolution Summary

### Billing Log Properties
- Title
- User Email
- Org Name
- Amount
- Type (Charge/Refund/Credit/Payout)
- Status
- Payment ID / Order ID
- Notes
- Created

### Escalations Properties
- Title
- Severity (P0/P1)
- Impact Summary
- Start Time
- Current Status
- Owner
- Updates
- Resolution Summary

## Intake Workflow (All Issues)
1. Capture request: user, org, role, feature, timestamp, evidence (screenshots/logs).
2. Confirm severity level.
3. Acknowledge within SLA with next-step ETA.
4. Log the issue in Notion > Support Queue with tags: Billing/Support, severity, role.

## Billing SOP
### Common Billing Scenarios
- Subscription failed or past due.
- Org fee payment missing.
- Marketplace order dispute/refund.
- Session payment failed or duplicate.
- Payout delayed or mismatched.

### Billing Triage Steps
1. Verify user/org role and plan status in admin portal.
2. Check payment records: `session_payments`, `org_fee_assignments`, `orders`, `coach_payouts`.
3. Confirm amounts: gross, platform fee, net.
4. Identify error type: failed payment, missing payment method, duplicate, dispute.

### Billing Fixes
- Failed payment: prompt card update, retry payment, confirm receipt.
- Duplicate charge: refund duplicate, document in notes.
- Dispute: mark as dispute, pause payout if needed, respond with proof.
- Payout delay: verify payout status, update ETA, issue manual adjustment if required.

### Billing Resolution
1. Confirm in system (status updated).
2. Notify user with receipt/credit confirmation.
3. Log the action in Notion > Billing Log with payment ID and amount.
4. Update Notion > Support Queue with resolution + timestamps.

## Support Escalation SOP
### Escalation Triggers
- P0 or P1 issue.
- Multiple users impacted.
- Security or data risk.
- Payment flow blocking revenue.

### Escalation Steps
1. Create an incident in Notion > Escalations (P0/P1).
2. Assign owner and open escalation channel.
3. Freeze changes if data integrity is at risk.
4. Collect logs, steps to reproduce, affected IDs.
5. Apply fix or mitigation.
6. Post updates in Notion > Escalations per SLA.

### Post-Resolution
1. Notify impacted users.
2. Update Notion > Escalations with root cause and fix.
3. Create a follow-up task in Notion (Support Queue or Engineering board).

## Communication Templates
### Acknowledgement (P1/P2)
Subject: We’re on it — Coaches Hive support  
Body:  
Hi [Name], thanks for reporting this. We’re investigating now and will update you by [time].  

### Status Update
We’ve identified the issue and are working on a fix. Next update by [time].  

### Resolution
This is resolved. Summary: [what happened], [what was fixed], [what we did for you].  

### Refund/Credit
We issued a refund/credit of [$X]. You’ll see it within [timeframe].  

## Refund + Credit Rules
- Session payment failed or double: refund duplicate immediately.
- Marketplace dispute: hold payout until resolution; follow platform policy.
- Subscription overcharge: refund difference and confirm plan settings.

## Logging + Audit
- Log all billing changes and refunds in Notion > Billing Log.
- Attach evidence (screenshots, order IDs, payment IDs) to the ticket.

## Weekly Review
Every Monday:
- Review open P1/P2 tickets.
- Check dispute queue.
- Review payout delays.
- Identify recurring issues and create a fix task.

## Success Metrics
- Response time by severity.
- Resolution time by severity.
- Refund count and cause.
- Dispute rate.
