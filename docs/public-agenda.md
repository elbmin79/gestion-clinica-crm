# Public agenda: request and review

Agenda Pública supports a patient-facing request page, explicit service/branch/
professional options, recurring hours and date exceptions, notice/horizon/buffer
rules, and a private staff request inbox. Requests do not hold slots or confirm
appointments. Approval checks current availability again and creates a pending
appointment with the configured deposit. Patients are never matched automatically
by a supplied phone or email; staff explicitly select an existing chart or create
one at approval.

## Setup

- Apply `20261030202528_public_agenda_requests.sql` after the existing catalog,
  availability and staff-push migrations. No existing appointments are changed.
- Configure a stable `PUBLIC_BOOKING_SECRET` (32+ random characters) and the
  server-only Supabase service key. Local development may test without CAPTCHA.
- Production requires `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` for a
  Cloudflare Turnstile widget on the deployed hostname. Tokens are checked on the
  server, including hostname and the `public_booking` action. Production public
  APIs fail closed if the bot-protection configuration is missing.
- Vercel's trusted forwarded header is used for throttling. On another hosting
  platform, configure `PUBLIC_BOOKING_IP_HEADER` only if a trusted reverse proxy
  overwrites it. Without a trusted header, traffic shares a conservative bucket.
- An admin opens Configuración > Agenda Pública, chooses a unique slug, adds
  explicit options with a duration and positive MXN deposit, and assigns weekly
  opening windows. Branch descriptions are not parsed as schedules. Missing or
  variable catalog durations need an explicit public duration.
- Add date exceptions for special opening hours or an all-day closure. Exceptions
  replace recurring windows for that professional and branch on that date. The
  existing Disponibilidad blocks apply as additional closures.
- Save a draft, review it, then publish. The patient URL is `/reservar/<slug>`.
  Unpublishing immediately disables public catalog, slot and submission access.
  This does not reject existing requests automatically.

## Review

Admins and reception see the latest 100 requests, filter by review state, and
approve or reject each request. Approval is atomic and idempotent: a conflict or
changed public duration/deposit rolls back patient creation and the appointment.
A rejected request creates no appointment. Existing charts are never overwritten
with unverified visitor contact data. Newly created charts have WhatsApp opt-in
disabled; authorizing contact for a request does not grant WhatsApp permission.

The appointment remains Por confirmar until its positive deposit is recorded in
Pagos. No online payment or automatic patient message is claimed. The receipt
explicitly states that there is no confirmed appointment, held slot or charge.
Staff push/inbox alerts use the existing new-appointment preference and generic
text. The request itself is visible only to the clinic's admins and reception.
Approving into an appointment uses the existing appointment alerts and Calendar
sync queue. External Google Calendar busy periods are not imported.

## Boundaries and tests

Public APIs return only a published catalog and calculated free start/end times.
They never expose patient records, appointment details, staff account identities,
private block reasons, request listings or contact lookup. Public pages bypass
only the explicit booking paths and never mount the authenticated CRM shell.
Database service functions are callable only by service_role; settings/review
functions check authenticated clinic membership and role internally. All new
public tables have RLS. The private rate table intentionally denies user access.

Public capacity is one appointment per professional even when internal staff
allow parallel appointments. Starts use a 15-minute grid and the CRM's same-day
06:00-to-midnight bounds. Requests do not reserve capacity; multiple different
visitors can request a slot, but only a still-available request can be approved.
Throttling, signed delayed/expiring form challenges, a honeypot, production CAPTCHA,
a unique submission nonce and a pending-request duplicate constraint protect
submissions. Rate identifiers are HMACs; raw client addresses are not stored.

Run `npm test` for the real migration under PGlite, with the existing availability,
service snapshot and deposit guards, plus request-signature and CAPTCHA tests.
Run `npm run build`, then verify public access in a signed-out Playwright context,
submission, staff review, slot conflicts, unpublishing, and layout at mobile sizes.

## Verified in development on 30 October 2026

The migration was applied to the configured development database. Playwright MCP
used a signed-out browser for the public flow and a staff session for review.
A fully synthetic clinic fixture exercised publication, slot loading, submission,
receipt, approval into a pending appointment, explicit existing-patient linking,
rejection, conflicting internal bookings, date closures, and unpublishing.
Two concurrent submissions of one form returned the same receipt and created one
request. The staff request notification was received by the browser's service
worker and its inbox link opened the request tab. The public page made no direct
Auth/REST calls and did not mount the CRM sidebar. Invalid identifiers, tampered
challenges, a honeypot, cross-origin requests, and oversized bodies were rejected.
Desktop/mobile screenshots were checked without horizontal overflow. The form's
empty-catalog state was also exercised.

All temporary clinic, request, appointment and patient records were removed;
publication is off. Existing clinic settings were not automatically published or
filled with invented working hours. 85 automated tests and the production build
passed. Live Turnstile verification still requires deployment-owned widget keys;
the production fail-closed and provider-response checks have automated coverage.
Provider validation follows [Cloudflare's server-side guidance](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

Cleanup exposed two existing whole-clinic deletion bugs. Migrations
`20261030204811_allow_clinic_delete_admin_cascade.sql` and
`20261030204929_skip_audit_for_deleted_clinic_cascades.sql` now let child deletions
cascade after the clinic is gone. Regression tests verify that ordinary
last-admin deletion/demotion is still rejected and ordinary membership changes
remain audited. No trigger or access policy was disabled for cleanup.

The Supabase advisor flags the two authenticated SECURITY DEFINER staff RPCs
because they intentionally perform atomic writes behind read-only table grants.
Both explicitly validate auth.uid(), clinic membership and staff role; anonymous
execution is revoked. The private rate-limit table intentionally has no user
policies. See the [advisor explanation](https://supabase.com/docs/guides/observability/advisors?lint=0029_authenticated_security_definer_function_executable)
when reviewing these intentional boundaries.
