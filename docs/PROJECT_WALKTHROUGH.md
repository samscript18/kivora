# Project Walkthrough Script

"Welcome to Kivora, a revenue operations workspace for short-term-rental portfolios powered by live Wheelhouse data. Kivora turns portfolio signals into explainable incidents and opportunities, lets revenue teams preview and approve pricing actions safely, verifies provider outcomes, measures results over time, and keeps the full operational record available in the dashboard and Telegram."

"Start on the Kivora landing page and sign in. Kivora is designed as an operating workspace rather than a generic analytics dashboard: every recommendation is tied to a connected organization, an affected listing or portfolio, stored Wheelhouse evidence, a lifecycle state, and an explicit next action."

"After sign-in, the Welcome to Kivora guide appears. Show that setup is navigable: use the numbered steps or the Previous and Next controls. Step one connects Wheelhouse, step two links the user’s personal Telegram companion, and step three enables Market Intelligence. A completed integration remains visible as completed, while users can still return to its step to review it."

"On the Wheelhouse connection step, explain the data boundary. Kivora validates the organization-owned API credential, encrypts it at rest, imports only that organization’s mapped listings, and uses the credential only on the server. The browser never receives the Wheelhouse key."

"Open Settings and show the connected Wheelhouse account, portfolio, listing count, and capability state. A connection can provide live reads before Kivora has proof of write access. After a successful approved Wheelhouse mutation, Kivora records durable write capability. If Wheelhouse rejects the key as read-only, Kivora keeps previews available and clearly prevents live changes."

"Now open the Portfolio page. This is the live operational overview: portfolio health, revenue, occupancy, ADR, RevPAR, dynamic-pricing coverage, active incidents, opportunities, and data freshness are shown together. Explain that metrics come from connected portfolio scans and persisted snapshots, not from invented demo values."

"Open Listings. Select any mapped listing and open its workspace. The workspace is organization-scoped: a listing from another organization cannot be opened by changing a URL. Show the depth of the listing record: current pricing preferences, Wheelhouse recommendations, performance history, reservations where available, recent provider changes, incidents, opportunities, recommendations, simulations, actions, outcomes, activity, and relevant market signals."

"Point out the data-depth behavior. Kivora requests optional Wheelhouse feeds independently. If a provider endpoint does not support a particular listing, the workspace reports that feed as unavailable while preserving the rest of the listing workspace. It does not silently replace unavailable data with fake data."

"Next, open Revenue War Room. This page prioritizes today’s highest-impact work: critical incidents, high-confidence opportunities, market signals, and recent activity. Select an item with Investigate. The exact item selected opens in a scrollable action workspace; it is not a generic preview of the first card in the list."

"In the action workspace, review the evidence and affected scope before acting. Kivora shows the recommendation lifecycle, projected opportunity or revenue at risk, confidence, risk, listed dates, baseline, suggested state, financial-impact method, assumptions, and the latest live preview. The preview is explicitly non-mutating: it asks Wheelhouse for a pricing projection but does not change any rate."

"Demonstrate the recommendation lifecycle. A newly detected item begins as READY. A reviewer can mark it under review, approve it, schedule it, ignore it for a defined period, dismiss it, or cancel a scheduled action. Kivora keeps these states separate from the underlying detection record, so the operating team can distinguish a recommendation that is READY from one that is CANCELLED, APPLIED, VERIFIED, or FAILED."

"Open Opportunities. Use the lifecycle filter first: choose READY to see work that is ready for review, CANCELLED to see items that were intentionally stopped or superseded, and All to inspect the full retained pipeline. Then use the risk filter. The total potential upside changes with the selected filters, so the number always describes the visible work rather than an unrelated portfolio total."

"Select a READY opportunity and click Investigate & Preview. In the workspace, assign a team member if needed, read the stored evidence, and use the pricing strategy preview. Explain that Kivora requires a recent, recommendation-bound simulation before an approved pricing action can execute. This prevents an old preview from being reused after portfolio conditions have changed."

"For a safe live demonstration, stop at the preview if no approved demonstration listing is available. If you have explicit authority over the selected listing, choose Review, then Approve, then Apply & verify. Kivora performs the approved Wheelhouse mutation, records an action record, reads the provider state back, and classifies the outcome honestly. APPLIED means the write was accepted but a full read-back verification was unavailable; VERIFIED means the provider’s current state matched the approved change."

"If an action targets multiple listings, Kivora does not hide partial success. It creates a grouped parent action and records each child result. The action workspace reports verified, applied, and failed children separately, along with the exact activity trail. This is why a grouped action can be PARTIALLY_APPLIED or FAILED even if one individual pricing preset was applied successfully."

"Open Activity. Find the action that was just reviewed or applied. Show the sequence: work item assignment, review, approval, simulation, execution, provider read-back verification, and any outcome record. The audit record is organization-scoped and makes it possible to understand who made a decision, when it happened, and what Kivora observed afterward."

"Open Incidents. Incidents represent revenue risk or broken pricing behavior, such as a listing that needs dynamic pricing restored. Review the live evidence, run a non-mutating preview, and, only with permission, approve the recovery action. Kivora checks authorization and Wheelhouse write capability before it attempts a mutation."

"Open Market Intelligence. Kivora combines Ticketmaster events and OpenWeather signals with listing locations as context for decisions. Show that a signal identifies the affected location, dates, confidence, and listings. Kivora does not treat an event or weather signal alone as an instruction to change rates; an actionable recommendation requires sufficient portfolio and Wheelhouse evidence."

"Open Simulator. Select a listing and compare conservative, balanced, and aggressive pricing strategies. Explain that simulations are dated, listing-scoped, and stored with their assumptions. A simulator result is a planning input, not a booking guarantee and not a write to Wheelhouse."

"Open Reports. Generate or open an executive, portfolio, owner, or revenue report. Reports are built from stored organization-scoped facts, carry their own version and status, and can be finalized and delivered through the permitted channels. Kivora keeps projected opportunity, revenue protected, and realized revenue distinct rather than presenting them as the same metric."

"Now demonstrate Telegram. From Settings or the Welcome guide, link Telegram to the current Kivora user. The connection is personal and organization-bound. In Telegram, send `/briefing` for a portfolio summary or `/opportunities` for ranked active opportunities. Kivora displays a typing indicator while it is preparing a response."

"When Kivora sends an incident or opportunity alert to Telegram, use Details & previews. The bot immediately acknowledges the signed button, then retrieves the recommendation and creates short-lived, single-use signed intents for follow-up actions. A user can request a strategy preview, approve and execute, schedule, ignore, dismiss, cancel a scheduled action, or revert when that action is permitted."

"For an approval demo, use a test recommendation and a listing you are authorized to change. Telegram first creates a fresh preview, then requires the signed approval action. After execution, Kivora sends an outcome with the action status, verified-listing count, and a link to the dashboard action workspace. The same execution record appears in both Telegram and Kivora; Telegram is an operational companion, not a bypass around dashboard authorization or audit controls."

"Finally, explain the provider protection built into normal use. Kivora caches cacheable Wheelhouse GET responses in Redis using a credential-fingerprinted, exact-path key. Successful pricing writes and explicit provider syncs invalidate the affected listing reads. This reduces repeated provider calls and avoids serving a stale pricing view after a change, while keeping one organization’s provider data isolated from another’s."

"Close by returning to Revenue War Room. The full Kivora loop is now visible: connect a real portfolio, observe live operational signals, investigate the exact affected work item, review stored evidence and a fresh non-mutating preview, make a controlled approval decision, apply only an authorized action, verify the provider result, measure the outcome, and retain a complete activity trail across dashboard, reports, notifications, and Telegram."

## Recommended Demo Sequence

```text
1. Sign in and use the Welcome guide step navigation.
2. Show an existing Wheelhouse connection and mapped portfolio.
3. Open Portfolio, Listings, and one listing workspace.
4. Open War Room and investigate a specific incident or opportunity.
5. Open Opportunities and filter: READY → CANCELLED → ALL.
6. Run a non-mutating strategy preview.
7. If authorized, approve and apply one safe action; otherwise stop at preview.
8. Inspect the resulting Activity/audit trail and measured outcome.
9. Show Market Intelligence, Simulator, and Reports.
10. Use Telegram: `/briefing`, `/opportunities`, then a signed Details & previews action.
```

## Recommended Telegram Prompts

```text
/briefing

/opportunities

Which listing has the highest revenue opportunity today, and what evidence supports it?

Summarize the current portfolio risks and recommend the safest next action.
```

## Presenter Notes

- Never perform a Wheelhouse mutation without explicit authority over the selected listing.
- Call a preview a preview. It is not a rate change.
- Do not promise revenue results: projections, protected revenue, and realized outcomes are distinct measurements.
- If an optional provider feed is unavailable, present Kivora’s unavailable-state behavior as a reliability feature.
- Use a test or hypothetical Wheelhouse portfolio for approval and verification demonstrations whenever possible.
