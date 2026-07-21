# Kivora — Revenue, on watch

Kivora is an autonomous revenue control room built on the Wheelhouse Revenue Manager API. It continuously audits vacation-rental portfolios, detects revenue leaks, explains their cause, quantifies the impact, simulates the safest correction, and executes only after human approval.

## Why it is different

Most tools stop at reporting. Kivora closes the operational loop: detect, prove, approve, execute, verify, document and communicate. The primary demo recovers $6,711 threatened by a manual Art Basel pricing override.

## Wheelhouse usage

- Listings and managed-listing pagination
- Rolling KPIs and price recommendations
- Listing preferences and changelog
- Neighborhood pricing and occupancy signals
- Non-mutating preference previews
- Approval-gated preference updates
- Manual channel synchronization and read-after-write verification
- Market-report time series for underwriting

## Safety and resilience

API credentials never reach the browser. Kivora respects the 60-request/minute limit with scan batching and bounded exponential backoff. All live changes require approval and produce audit records. Integration failures are displayed directly; Kivora never substitutes synthetic portfolio data or claims an action succeeded when it did not.

## Submission checklist

- [ ] Add production Wheelhouse API key
- [ ] Add MongoDB URI
- [ ] Deploy frontend and backend
- [ ] Configure Telegram webhook
- [ ] Capture six screenshots and three-minute video
- [ ] Register and submit before Demo Day
