# Kivora acceptance status

This document distinguishes completed code-level verification from work that requires an authenticated browser, a controlled database environment, or explicit authorization to mutate a live Wheelhouse portfolio.

## Verified in the current codebase

- Backend unit and lifecycle suite: 28 passing tests.
- Backend production build: passing.
- Backend lint: passing.
- Frontend TypeScript check: passing.
- Frontend lint: passing.
- Frontend optimized production build: passing for all application routes.
- Git whitespace check: passing.
- Local API readiness probe: HTTP 200 when the local configured service is running.
- Deployed readiness probe: HTTP 200 at the time of the audit, with database connected, configuration valid, scheduled worker present, and active Wheelhouse connections detected.

## Implemented behaviors covered by the audit

- organization-aware Wheelhouse credentials and listing mappings;
- listing workspace depth, optional-feed degradation, and scroll-safe viewport presentation;
- exact work-item selection instead of opening the first item;
- persistent recommendation, simulation, action, grouped-action, scheduled-action, and outcome lifecycles;
- explicit `APPLIED` versus `VERIFIED` semantics;
- deferred Wheelhouse sync handling for 423/429;
- matching recommendation strategy enforcement;
- multi-connection background scans with per-connection checkpoints;
- durable write-capability proof after an approved provider write;
- tenant-bound approval authentication;
- role enforcement for analysis, connection/integration configuration, reports, and shared settings;
- stale organization selection recovery;
- user-scoped notifications and permission-aware settings controls;
- report currency/timezone defaults and delivery controls.
- lifecycle filtering for the opportunities pipeline, including historical cancelled recommendations;
- Redis-backed Wheelhouse read cache with write/sync invalidation and cache regression coverage;
- navigable onboarding steps and responsive Telegram callback/action feedback.

## Remaining acceptance gates

The following are intentionally not claimed complete by code compilation alone:

| Gate | Why it remains |
| --- | --- |
| Browser end-to-end acceptance | Requires a signed-in browser session and interaction across breakpoints, dialogs, scrolling, organization switching, and role changes. |
| Live Wheelhouse write and revert | Must be performed only with explicit authority over an appropriate production/staging listing. |
| Mongo-backed integration tests | Unit mocks do not prove compound indexes, locks, checkpoints, and concurrency against a real database. |
| Load testing | Large portfolio scans, concurrent users, report export throughput, and scheduled bursts require dedicated load infrastructure. |
| Accessibility testing | Keyboard, focus, screen-reader, and automated axe checks need an E2E harness. |
| Provider contract fixtures | Every optional Wheelhouse/external endpoint should be retained as a safe fixture and periodically validated. |
| Live SMTP invitation delivery | Unit tests verify Nodemailer configuration and message construction, but sender verification, host egress, Brevo acceptance, and inbox placement require a controlled deployed test. |

## Recommended release gate

Before declaring a deployment fully accepted:

1. Run the repository verification commands.
2. Deploy to a staging environment with production-equivalent configuration.
3. Perform organization and role browser E2E coverage.
4. Send one teammate invitation to a controlled inbox and verify delivery plus link acceptance using the intended email identity.
5. Run a controlled live read and one explicitly approved low-risk pricing action.
6. Verify the Wheelhouse read-back result, Kivora audit/action state, notification, and supported revert.
7. Run real-Mongo concurrency/checkpoint tests and a portfolio-scale load test.
8. Record outcomes and owner approval in the release record.
