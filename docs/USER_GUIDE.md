# Kivora user guide

## Start here

After signing in, choose the correct organization from the workspace selector in the left sidebar. Kivora reloads organization-scoped data when you switch. If you see data that does not belong to the expected account, stop and verify the selected organization before taking action.

If you are new to an organization, use the setup guide in Settings:

1. Connect Wheelhouse with a credential that can read the intended portfolio.
2. Let Kivora import listings and create the initial portfolio mapping.
3. Optionally connect Telegram for personal alerts and approvals.
4. Wait for the first scan or run one if your role allows it.

## Dashboard and portfolio

The Dashboard gives an operational summary, not a booking guarantee. Use it to identify what requires attention. The Portfolio page shows live connected inventory and latest stored performance. The listing card/status should be interpreted as follows:

- **Dynamic On**: Wheelhouse automatic rate posting is enabled for that listing.
- **Review needed**: Kivora has evidence of a pricing, pace, or operational condition worth reviewing.
- **Connected**: Kivora can read current portfolio data.
- **Fully connected**: Kivora has both live read health and a recorded successful approved provider write for that connection.

## Investigating an incident or opportunity

Use War Room, Incidents, or Opportunities and select **Investigate**. The workspace contains the exact item you selected, along with:

- what happened and affected listings/dates;
- the evidence and financial impact method;
- assumptions and recommendation;
- current live preview, if a safe preview exists;
- prior simulations, actions, outcomes, activity, and comments;
- permission/capability status.

Use Review to indicate that the item has been assessed. Ignore is for a temporarily irrelevant recommendation; dismiss requires a reason. Reopen moves a dismissed, ignored, or failed recommendation back to a reviewable state when new evidence warrants it.

## Pricing previews and actions

The simulator and listing simulator tab show conservative, balanced, and aggressive Wheelhouse previews. These are non-mutating. Kivora stores the selected simulation with an expiry time.

To apply a pricing change:

1. Check the evidence and assumption cards.
2. Run or review the matching live preview.
3. Review the recommendation.
4. A revenue manager or higher approves it.
5. Use **Apply & verify** or schedule it before expiry.
6. Read the final action result.

The status meanings matter:

- **Verified**: the settings were read back and match Kivora’s expectation.
- **Applied**: Wheelhouse accepted the write but read-back could not conclusively verify it.
- **Failed**: no safe conclusion of success; inspect the action details.
- **Partially applied**: in a grouped operation, some listings completed while others did not.

If an action was verified and has a supported reversion, the workspace offers a revert action that restores the stored prior settings. Use this only after reviewing the live state and business impact.

## Dynamic pricing issues

If a listing shows automatic rate posting disabled, the dynamic-pricing recovery workflow can remove the base-price override, enable automatic posting, request a listing sync, and read back the preference state. It does not make an unapproved change.

If Wheelhouse reports a sync queue lock or rate limit after the preference write, Kivora records the sync as deferred. This does not by itself mean the pricing change failed.

## Market intelligence

Market Intelligence combines external event and weather signals with your connected listing locations. An analyst can refresh these signals. Use external signals as context for review, not as a command to raise prices by themselves. Kivora creates an actionable recommendation only where the rule includes sufficient Wheelhouse portfolio evidence.

## Reports

Generate executive, portfolio, owner, or revenue reports from the Reports page. Analysts can generate and edit drafts; revenue managers can finalize and deliver them. PDF and CSV exports are private authenticated downloads.

Reports retain their own version and generated facts. If the portfolio changes later, generate a new report rather than assuming an older report updates itself.

## Notifications and Telegram

The top-bar bell and Activity page show your in-app notifications. Mark them read after handling them. In Settings, you can control your own notification preferences, such as channels, categories, quiet hours, severity, and minimum financial impact. Organization and portfolio defaults require an organization administrator.

Telegram is personal: connecting it links your Kivora user to your Telegram account. It can deliver briefings, report updates, and signed action controls. Kivora acknowledges a signed button immediately, shows a typing indicator while it evaluates the request, and returns the recorded execution/verification result with a link to the action workspace. Never forward a signed action message or link as a substitute for another user’s authorization.

On the Opportunities page, filter the pipeline by lifecycle (for example `READY`, `CANCELLED`, or `ALL`) as well as risk. Lifecycle comes from the linked recommendation; it is distinct from the underlying detection record.

## Settings

The Settings page adapts to role:

- Revenue managers manage Wheelhouse connections and portfolios.
- Organization administrators manage organization identity, team membership, platform/organization external-intelligence credentials, and organization notification defaults.
- Analysts can use underwriting and analysis workflows.
- Viewers can read settings and manage personal notification preferences but cannot change shared operations.

When an administrator invites a teammate, Kivora reports whether the invitation email was sent. If delivery fails, copy the one-time invitation URL shown immediately after creation and share it through a trusted channel. The URL cannot be recovered later because Kivora stores only a hash of its token; revoke the invitation and create a replacement if the link is lost. The recipient must sign in with the exact invited email address.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| A listing opens with “Active organization listing not found” | Confirm the selected organization, then ask a revenue manager to test the correct Wheelhouse connection and run a scan. |
| The workspace says read-only | The API key can read but Wheelhouse has rejected writes. Ask an authorized administrator to replace it with a write-capable credential if appropriate. |
| Apply result is `APPLIED`, not `VERIFIED` | Open the action details; the write may be accepted while read-back is delayed/unavailable. Do not repeat automatically. |
| A scheduled action cancelled | Review recommendation/simulation expiry and the current live baseline; the safety check detected changed conditions. |
| You cannot see an action button | Your role or the current connection capability does not authorize it. |
| Data looks stale | Check the most recent scan and use the permitted refresh/scan control. If it persists, inspect connection health. |
| A teammate did not receive an invitation | Check whether Settings reported email delivery as sent or failed. If failed, use the one-time link shown when the invitation was created and ask an operator to check SMTP configuration. If sent, check spam/quarantine and confirm the invited address before creating a replacement. |
