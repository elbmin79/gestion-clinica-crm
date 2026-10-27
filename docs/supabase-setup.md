# Supabase setup and integration

## Current state

The ordered migrations in supabase/migrations define a clinic-scoped
PostgreSQL schema, role-based row-level security, appointment conflict
constraints, append-only payments with a database-enforced refund balance,
document snapshots, transactional document preparation, finance-only directory/appointment RPCs, appointment
reminder scheduling, and metadata-only audit events. They do not seed patients
or clinic-specific content.

Cookie-based Supabase client helpers, login/logout, a Next.js Proxy session
refresh, a clinic-scoped patient-directory adapter, and a shared agenda adapter
are implemented. When configured, they use the signed-in user's Supabase
session and row-level security. The directory reads and writes patient records,
follow-up notes, diagnoses, and per-patient document snapshots. It reads and
version-saves clinic document templates; only the newest version of a given
template is active for new documents. Prior document snapshots remain intact.
Accepted diagnoses are versioned as history, with only one current accepted
diagnosis per patient; accepting a new one replaces unsigned contracts from the
prior diagnosis while keeping signed records intact.
Prepared contract and consent histories display their saved template revision
and the preparing staff member when identity data is available. A role-checked
RPC creates document snapshots, replaces older pending versions atomically, and
requires an accepted diagnosis before preparing a contract. Existing documents
keep their content snapshot when a template is revised.
The local demo also enforces the accepted-diagnosis requirement in the contract
submit handler, in addition to disabling preparation in the form until a
diagnosis has been accepted.
The Team page can add businesses and
branches for administrators/receptionists and providers plus branch assignments
for administrators. Administrators can edit a provider's name, role, and branch
assignments; administrators and receptionists can edit branch names and
addresses without changing the branch's business association. The agenda reads
appointments for the selected period and
supports creating, rescheduling, and changing appointment status; database
exclusion constraints protect against overlapping patient or professional
bookings. Appointment edits include business, branch, and provider assignments,
with the branch/provider choices constrained by the selected business and
branch. New appointments require a positive clinic-entered deposit, and a
database trigger prevents confirmation or completion before that amount is
recorded. A refund also cannot reduce a confirmed appointment below its
required deposit; appointment-linked and patient-level refund checks reserve
confirmed appointment deposits and share a patient-scoped transaction lock to
prevent concurrent balance races. Existing bookings remain unchanged. Its
filters include professional, branch, business, and status.
Browser clients cannot hard-delete patient or appointment records; patients are
marked inactive and appointments are cancelled so their history remains.
Administrators and receptionists can review appointment payment history and
record a deposit from the appointment detail. Clinicians do not load the finance
workspace; the database remains the final deposit gate before confirmation.
The shared overview uses the clinic directory and shared agenda to show its
summary.
Payments can be read and created by administrators, receptionists, and billing
members. Billing receives only patient name/record number and appointment fields
needed to reconcile, through role-checked database functions; no phone, email,
or diagnosis is returned. Income/refund records are append-only, and a database
trigger rejects refunds beyond available net income. The adapters select
clinics from the user's memberships and do not fall back to demo rows in shared
mode. Confirmed appointments create queue rows for the requested two-day,
one-day, and five-hour reminders. The shared Recordatorios page displays the
current schedule generation, retaining prior sends when an appointment is
rescheduled or cancelled and later confirmed again. The queue reports delivery
eligibility only when the patient has explicit WhatsApp authorization and a
valid international E.164 phone number, without returning the contact number to
the display. The dispatcher rechecks authorization at dispatch time, but has
not been activated because no clinic-owned provider credentials, approved
templates, database, or scheduler are configured.

Patient WhatsApp appointment-message authorization is stored independently
from clinical consent. A security-definer patient-update RPC writes each grant or
revocation to the patient_messaging_consent_history table in the same transaction
as the profile edit, while the patient row holds current status and source. A
server-only dispatcher is implemented for Meta's WhatsApp Cloud API. It claims
due rows through service-role-only RPCs, rechecks consent, appointment status,
current schedule generation, and E.164 phone format before sending, then saves
the provider result. A lost request or ambiguous provider response is marked
`unknown` and never automatically retried to avoid duplicate messages. No
messages are sent unless the provider and scheduler are configured.

No Supabase project is currently configured in this workspace: only the blank
.env.example exists. The migrations have not been applied or validated against a
live or local Supabase/PostgreSQL project, so shared operations cannot yet be
verified end to end. Contracts and consents can be prepared and retained as
pending documents with immutable template snapshots; there is no electronic
signature provider, delivery workflow, or real-signature action. Do not enter real
patient information until the migration, access policies, backups, and
operating environment have been validated.

Without Supabase configuration, local development deliberately remains in
synthetic demo mode. A production deployment fails closed: CRM routes redirect
to the setup/login page and do not expose the browser-local demo. The reminder
dispatch route remains reachable by a scheduler so it can return its own
configuration status; it requires its bearer secret and returns `503` while
delivery settings are incomplete.

## Before connecting the application

1. Create or select a Supabase project owned by the clinic. The clinic must
   choose a hosting region and confirm its privacy, retention, backup, and
   contractual requirements before real patient data is stored.
2. Apply all migrations in filename order to a fresh project and resolve any
   provider-specific migration diagnostics before onboarding data.
3. Create and confirm the first administrator in Supabase Auth. Generate a
   clinic-specific bootstrap file locally from the project root:

   ```sh
   npm run clinic:setup -- --admin-email 'admin@example.com' --clinic-name 'Clinic name' --time-zone 'America/Tijuana'
   ```

   Review `supabase/bootstrap/clinic-admin.generated.sql`, then run it once in
   the empty project in the Supabase SQL Editor as the project owner. The file
   is ignored by Git and the generator refuses to overwrite an existing file.
   It creates the clinic, admin membership, clinic business, and primary
   branch. The migration deliberately does not let users create clinics or
   grant themselves memberships. Add the clinic's professionals in the CRM
   after signing in. The setup command validates the email, clinic name, and
   IANA timezone before generating the SQL.
4. Copy .env.example to .env.local and add the project's URL and publishable
   key. Never expose a Supabase secret or service-role key in browser code.
5. Configure the project and verify the shared directory, team catalog, agenda,
   diagnoses, templates, document preparation, and finance workspace with test
   accounts for each role. RLS and the finance RPC role checks are authorization
   boundaries; allow/deny behavior must be validated before production.
6. Add a trusted delivery and signing integration before moving a document
   status to signed. The client currently cannot update a stored document's
   status in the schema.
7. Configure reminder delivery only after the clinic has selected and approved
   its WhatsApp Business account, phone number, Meta message templates, and
   hosting region. Apply every migration, including
   `202610260013_whatsapp_reminder_dispatch.sql`, before enabling the worker.
   In the server's secret manager (never browser-visible variables), configure
   `SUPABASE_SERVICE_ROLE_KEY`, `REMINDER_DISPATCH_SECRET`,
   `WHATSAPP_CLOUD_API_VERSION`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_LANGUAGE`, and the three
   `WHATSAPP_TEMPLATE_*` names. Configure `CLINIC_TIME_ZONE` to the clinic's
   IANA timezone. Each approved template must be a utility template whose body
   has exactly two text parameters in this order: patient first name and
   appointment date/time. Appointment messages intentionally omit treatment or
   service details. Keep the language and template names exactly as
   approved by Meta. Store `REMINDER_DISPATCH_SECRET` separately in a trusted
   scheduler and call `POST /api/reminders/dispatch` with
   `Authorization: Bearer <secret>` every minute. The route claims at most three
   messages per invocation and declares a 60-second maximum duration; configure
   the chosen host/scheduler to allow that runtime. Do not expose the service-role
   key or Meta access token to browser code. Start with a clinic test number and
   verify delivery, opt-out, provider rejection, and uncertain outcomes before
   enabling patient traffic. Deposit amounts are entered per appointment and
   enforced by the app and database.

Do not import the Velka database or real patient records as part of this setup.
The current reverse-engineering evidence is limited to the agenda screen and
does not establish Velka's database or backend behavior.

