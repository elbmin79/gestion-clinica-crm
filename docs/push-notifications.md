# Staff notifications and Web Push

The Push settings section supports per-clinic, per-user appointment preferences,
a persistent inbox, multiple devices, and browser Web Push. Alerts contain no
patient names, services, phone numbers, or clinical text.

## Installation

1. Apply `supabase/migrations/20261030194825_team_push_notifications.sql` to the
   intended CRM database after reviewing it. No existing appointments are backfilled.
2. Configure `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a clinic-owned HTTPS URL or mailto URI),
   and a random `CRON_SECRET` in the server environment. Generate a matched key
   pair with `npx web-push generate-vapid-keys`. Keep the private key stable;
   changing it requires devices to unsubscribe and enroll again. Do not commit it.
3. Serve production over HTTPS. Localhost works for development.
4. Schedule authenticated GET or POST `/api/notifications/dispatch` every minute,
   using `Authorization: Bearer <CRON_SECRET>`. `vercel.json` includes this schedule;
   the hosting plan must support minute-level cron. An external scheduler can call
   the same route. Each invocation claims at most five deliveries; scale the
   schedule/worker capacity for larger clinics.
5. For local delivery, run `npm run notifications:worker` alongside `npm run dev`.
   `CRM_ORIGIN` may override the default `http://localhost:3000`.
6. Each staff member opens Configuración > Notificaciones Push, saves preferences,
   selects Activar este dispositivo, accepts the browser permission, and uses
   Enviar prueba. Test requests are limited to one per minute per user.

Local `.env.local` keys are development-only; configure the deployment separately.
A managed browser using a nonstandard push service can explicitly configure
`PUSH_EXTRA_SERVICE_HOSTS` as exact, operator-approved hostnames. Standard browser
push hosts are built in. Arbitrary client-provided destinations are rejected.

## Behavior and access

- Admins and reception receive clinic-wide alerts. Clinicians need an active
  professional linked to their account; they receive alerts for assigned
  appointments. Reassignment also notifies the prior professional. Billing does
  not receive appointment alerts, but can register a device and send a test.
- New bookings, cancellation transitions, and changes to time, duration, branch,
  or professional create alerts transactionally. No-op updates and service-only
  edits do not. Each recipient gets one inbox entry per appointment change.
- Own changes are excluded by default. Event opt-outs affect both inbox and push.
  The device-delivery preference affects push only; it preserves inbox alerts.
- Preferences are shared across that user's devices for one clinic. Each browser
  subscription belongs to one user/clinic at a time. Enabling it in another clinic
  moves this device's subscription there. Other devices are unchanged.
- Signing out unsubscribes this browser and removes its registration. Membership
  removal cascades preferences, subscriptions, inbox items and pending deliveries.
- The bell refreshes every 15 seconds and on window focus. Its action feedback
  remains session-only; appointment alerts and their read state persist. The
  inbox displays the most recent 100 alerts. Borrar todas also cancels queued
  push delivery for those removed inbox entries.
- Notification clicks open the authenticated agenda in the correct clinic and
  load the current appointment. No patient data is put in the push payload.
- Delivery uses leased claims and checks membership, role and preferences again
  before sending. Temporary failures retry with backoff (three attempts max).
  Expired subscriptions are removed. Stable tags replace retries on devices;
  exactly-once delivery cannot be guaranteed by browser push services.
- A provider accepting a push does not prove that the OS displayed it. Device
  notification settings, network availability and browser policy still apply.
- The service worker never caches authenticated data. iPhone/iPad require a
  compatible OS and installation to the Home Screen before opting in.

## Verification

`npm test` includes PGlite regression tests of the actual migration: routing,
opt-outs, reassignment, tenant/owner access, immutable content, leases, retries,
and membership revocation. Dispatcher tests cover expiry, provider failures,
permission rechecks, endpoint validation and payload privacy. `npm run build`
verifies the production bundle. Browser tests should additionally cover saved
preferences, unread/read persistence, alert links, notification permission denial,
device enable/test/disable, and cross-device delivery.

Demo mode stores only synthetic alerts/preferences in this browser and never
sends push. Enable Incluir mis cambios to see alerts from your own demo actions.

## Verified on localhost (30 October 2026)

- Applied the reviewed migration to the configured shared CRM database after
  explicit approval. The migration filename matches the remote history version.
- Playwright MCP verified shared preference persistence, real browser enrollment,
  a delivered test notification, and real new-booking, rescheduling and
  cancellation pushes. The browser's service-worker notification list confirmed
  each received message. Alert links opened the correct shared appointment.
- Device disable removed the browser subscription; re-enrollment succeeded.
  Denied permission disabled activation with recovery instructions. Repeated
  test delivery was rejected with HTTP 429. A single synthetic alert's read
  status persisted after a reload.
- API checks rejected anonymous access (401), cross-clinic and cross-origin
  requests (403), and invalid push destinations (400).
- Demo browser tests verified event opt-outs, saved preferences, read persistence,
  appointment links and new/change/cancellation alerts. Desktop light/dark and
  390px mobile layouts were checked without horizontal overflow.
- The temporary shared appointment and its nine generated recipient alerts were
  removed after testing. No existing appointments were backfilled or modified.
- Production build and all 78 Node/PGlite tests passed. The server-only delivery
  queue intentionally has no user RLS policies; it is accessed through restricted
  service-role functions. The security advisor reported no new warnings from
  this feature (the private deny-all table is listed as informational).

The dev server and local worker must stay running for localhost delivery. The
production deployment still needs its own VAPID keys, secret and scheduler setup.
Only the MCP Chromium environment was used for real device delivery; physical
Safari/iOS/Android devices were not exercised in this session.
