# CRM clínico prototype

Next.js App Router prototype for patient, consent, service-contract, team,
branch, and agenda workflows. All seeded records are synthetic; changes made in
the demo persist in browser local storage on this device.

The agenda can be filtered by professional, branch, and business. The professional choices narrow to people assigned to the selected branch or business, and changing location clears an incompatible professional selection. Businesses,
branches, and professionals can be added from the Equipo y sucursales page;
administrators can edit a professional's role and branch assignments, while
admins and receptionists can edit branch names and addresses. Demo catalog
changes persist in this browser. Patient records include a diagnosis
acceptance step followed by a service-contract preview, and a patient-specific
action to prepare an informed consent. Consent and contract signatures are
simulation-only and update the local demo status.
Diagnosis summaries can be reviewed and revised; unchanged accepted summaries
do not create duplicate diagnosis-history entries, and revised diagnoses remain
versioned in the patient history.
Contract and consent viewers can print the saved document copy without printing
the surrounding CRM interface; this does not create an electronic signature.
Appointments must reference a patient record and reject overlapping times for
the same patient or professional. Bookings can be scheduled for 15 to 120
minutes and their duration can be changed later; the selected duration is
persisted and included in local overlap checks and shared appointment updates.
Staff can start a new booking from a patient chart; that flow keeps the patient
selected and suggests their assigned branch and professional. Agenda bookings
still require staff to choose a patient deliberately.
Appointment services are free text with sample and previously used suggestions;
choosing a prior service at the selected branch pre-fills its last recorded
duration and positive deposit from that branch. Staff can adjust those values
for each booking and edit the service later in the appointment details.
Patient records can be edited from their detail view; contact, service,
professional, branch, and status fields are included in directory search.
Consent formats can be added with clinic-provided text and are also stored only
in this browser. Placeholder formats without text are marked as unavailable and
cannot be requested; the request handler also rejects empty content. Patient
and document counts reflect the records in this demo.

## Run locally

```sh
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) in a browser. Keep the
development process running while using the app; stopping it makes the local
address unavailable. Demo changes are stored in that browser profile.

The local demo seeds consent and contract templates with conspicuously labeled
workflow samples. They contain no approved legal terms and are only there to
walk through document preparation and review. Replace them with clinic-approved
content before using shared clinic data.

The demo mode has synthetic records and saves changes in local browser storage.
An optional Supabase mode connects patient records, clinic branches,
professionals, follow-up notes, appointments, diagnoses, document templates,
prepared contract/consent snapshots, and append-only payments to clinic-scoped
tables through authenticated Supabase access and row-level security. The
overview dashboard reads clinic-shared patients, appointments, and follow-up
notes when Supabase is configured. No Supabase project is configured here,
so shared-data operations cannot yet be verified end to end. Do not enter real
patient information until the migration and access policies are applied and
reviewed.
Consent and contract preparation stores a copy for review; shared preparation
replaces an older pending version atomically, and contracts require an accepted
diagnosis. Demo-mode signatures are simulated, and shared mode has no
electronic-signature provider.
Clinic-provided document copy must be reviewed before production use.

Supabase/PostgreSQL schema migrations are available in `supabase/migrations/`.
They have not been applied or validated against a live database. See
`docs/supabase-setup.md` for setup requirements and the current module boundary.
After applying the migrations, the clinic owner can provision the initial
clinic/admin/business/branch with `supabase/bootstrap/clinic-admin.sql`.

In demo mode, patient records include a local follow-up timeline for call, message, administrative, and other internal notes. These demo notes use browser storage; do not enter real or sensitive clinical information.

The overview dashboard shows recent follow-up notes linked to patient records. Its signature metric counts each pending contract or consent separately, while canceled appointments are excluded from current schedule totals. In shared mode, the dashboard uses clinic-shared patients, appointments, and follow-up notes.

The Recordatorios page filters scheduled items by message type and delivery state. Items without WhatsApp authorization or a valid phone number are counted and shown as blocked; overdue eligible demo reminders are shown as omitted. This page does not send messages.

The patient directory supports combined text, status, branch, and professional filters with working pagination and page-size controls.

The agenda includes day, week, month, year, and daily list views. Appointments can be filtered by professional, branch, business, and status; the list opens the same editable appointment detail.

New appointments require a clinic-entered deposit amount. That deposit must be
recorded against the appointment before staff can confirm or complete it; the
shared database enforces the same rule. The Recordatorios page schedules
one-day and five-hour reminders for confirmed appointments; pending
appointments have a separate two-day confirmation request.
Demo reminders are illustrative only. Shared-mode delivery has a server-only
WhatsApp Cloud API dispatcher, but it remains disabled until the clinic
configures approved templates, credentials, the database migration, and a
trusted scheduler. The queue marks items eligible only when the patient has
explicit WhatsApp authorization and an E.164 phone number; no contact number is
returned to the queue display.

WhatsApp appointment-message authorization is recorded separately from clinical
consent. The patient directory shows the current opt-in state and captures its
source; shared-mode grants and revocations are written to an append-only audit
history. The server-only dispatcher sends only configured WhatsApp templates
and rechecks current authorization, confirmed appointment status, schedule
version, and phone validity immediately before sending. Ambiguous provider
outcomes are marked uncertain and are not automatically retried. No messages
are sent until the clinic configures the provider and scheduler described in
`docs/supabase-setup.md`.

Contracts has a clinic-managed template library. Saving a revision creates a
new active version and archives the prior copy. Preparing a contract attaches
the selected text as a snapshot to the patient record, so later template edits
do not rewrite prepared records. Demo signatures remain simulated and are not
legally valid.

Each prepared contract or consent is retained as a per-patient document history entry with its own request/signature status and content snapshot. Preparing another document no longer overwrites the previous record; legacy demo statuses are retained as history entries when a new document is created.

In shared mode, accepting a diagnosis supersedes the prior accepted version and
replaces pending contracts tied to it. Signed contracts remain in history, and
new contracts record the diagnosis version they were prepared from.

On the day agenda, selecting an open 15-minute slot between 06:00 and 23:15 opens the booking form with that date and time prefilled. The default 45-minute booking ends by midnight, and the time limit adjusts to the selected duration. The full day grid runs through midnight. A date picker and live current-time marker help navigate the schedule. Appointments store modality. Income and refunds are separate payment records linked to a patient and optionally to an appointment; the agenda summarizes those movements by transaction date and selected professional, branch, and business. The agenda can also be printed with a simplified print layout.

Shared agenda date navigation, period ranges, the current-time marker, and the
“Hoy” action use the clinic's configured timezone, independent of the staff
member's device timezone.


Payment records are immutable in this demo; corrections are recorded as refunds. Payment history and summaries are stored only in this browser and are not an accounting ledger or reconciliation system.


Consent formats support revisions: creating a new version starts from the selected format's title, type, and text. Patient document copies retain their original content snapshot when a later version is saved.

Patient expediente views now include a structured clinical consultation timeline
and attachments for signed consent/contract copies. Shared-mode uploads require
the private Storage bucket and policies from migrations `202610270001` onward.
Demo-mode file attachments are stored in browser IndexedDB; all demo data is
synthetic and must not include real patient or clinical information.

Pending appointments queue a two-day WhatsApp confirmation request. The
confirmation dispatcher and signed inbound webhook support confirm, cancel, and
manual reschedule follow-up. They require the migrations and Meta configuration
in `docs/supabase-setup.md`; they do not send messages in the current workspace.
