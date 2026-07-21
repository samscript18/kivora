# Kivora — Revenue, on watch

Kivora is an AI revenue operations platform built on the Wheelhouse Revenue Manager API. It continuously turns live listings, preferences, recommendations, and KPIs into a ranked action queue, explains verified problems, previews safe corrections, and applies supported changes only after human approval.

## Why it is different

Most tools stop at reporting. Kivora closes the loop: synchronize, detect, explain, preview, approve, execute, verify, audit, and communicate. Ticketmaster and OpenWeather add forward-looking demand context; Groq converts only supplied live facts into reports and conversational answers; Telegram gives each authenticated team member a separately linked mobile operations channel.

## Wheelhouse depth

- Paginated listings and managed listings
- Preferences, recent changes, flags, price recommendations, rolling/monthly KPIs, reservations, and notifications
- Neighborhood pricing and occupancy integration methods
- Non-mutating preference previews
- Approval-gated preferences, strategy presets, automatic posting, and channel synchronization
- Segments, segment listings, and aggregate metrics
- Market-report time series for underwriting

## Judging alignment

- **API Champ:** the core audit, preview, action, verification, portfolio, segment, and underwriting paths use the Wheelhouse RM API.
- **PMC / RM Shop:** ranked multi-listing workflows, repeatable audits, owner communications, team activity, and per-user Telegram operations reduce daily manual work.
- **Best Platform Combination:** Wheelhouse remains the source of revenue truth while Ticketmaster, OpenWeather, Groq, Privy, MongoDB, and Telegram supply distinct operational capabilities.
- **Quality and feasibility:** rate-aware scans, provider isolation, explicit live-data labels, mutation gates, read-after-write verification, audit logs, CI, Docker, and no synthetic fallbacks.

## Final launch checklist

- [x] Wheelhouse key returns HTTP 200
- [x] Privy frontend and backend credentials configured locally
- [x] MongoDB, Groq, and Telegram bot credentials configured locally
- [ ] Add a distinct `TELEGRAM_LINK_SECRET` for production
- [ ] Add `TICKETMASTER_API_KEY` and `OPENWEATHER_API_KEY`
- [ ] Deploy public frontend/backend HTTPS origins
- [ ] Register the Telegram webhook against the deployed backend
- [ ] Confirm Wheelhouse write access with one explicitly approved low-risk change
- [ ] Record the live walkthrough and submit before the hackathon deadline
