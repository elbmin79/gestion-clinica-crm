# Velka reference findings

## Evidence ledger

- Browser target inventory: `ev_bdea1593c3258eecb72f532631971b77002e75fff8003ec8ac64444ffdc2134b`.
- Agenda screenshot: `ev_0362af229dcde134918cb08e9e18e5fd63cbe8ac3678efeb79ca73add0903e1d`.
- Capture date: 2026-10-26. Target: `https://velka.mx/dashboard/appointment-scheduler?date=2026-10-26`.
- Authority/confidence: live page observation, observed. Scope was two read-only screenshots of the currently open agenda page. The latest was REA-captured as evidence ev_0362af229dcde134918cb08e9e18e5fd63cbe8ac3678efeb79ca73add0903e1d (SHA-256 0613b6bad6d160a58da0a06be53f391385676140f7eeaaac31c6944e08a82720). No navigation, clicks, form submissions, DOM/script inspection, or network capture were performed.

## Observed on the agenda screen

- Left navigation includes Dashboard Médico, Pacientes, Agenda, Pagos, WhatsApp, Auditorías, Mis Consentimientos, Clínicas, Usuarios, Asesoría Legal, Membresía, and Configuración.
- Agenda toolbar shows day/week/month/year views, date navigation, filter, print, and new-appointment controls.
- Summary cards show total appointments, confirmed, pending, virtual, and income.
- The visible schedule begins at 06:00 and presents 15-minute appointment slots.
- At capture time the selected date was 26 October 2026 and the visible summary reported zero appointments. This is a snapshot of that moment, not evidence of a general system rule.
- Notification prompts covered part of the upper-right screen.

## User-provided workflow priorities

The user shared a message from the clinic contact identifying these first priorities:

1. Patient service contracts: open the patient, review and accept the diagnosis, then view the contract for signature.
2. Informed consents.
3. Agenda filters by the assigned professional, branches, and businesses.
4. Appointment messages: confirmation two days before, a reminder one day
   before, and a reminder five hours before the appointment.
5. Require the appointment deposit before confirming the booking.

The clinic's later message also asked for an app to send those messages. This is
a stated requirement, not a behavior verified in Velka. The local CRM now
requires a positive deposit amount on new appointments and blocks confirmation
until payment is recorded; automatic messages are still not connected to a
provider.

These are requirements stated by the clinic contact, not findings inferred from the screenshot.

## Current local prototype and remaining work

- The local CRM has patient records, the diagnosis-to-contract flow, consent and contract template libraries, appointment management, and filters for professional, branch, business, and status.
- The day agenda now exposes accessible 15-minute booking slots. Selecting one opens the appointment form with its date and time prefilled. A direct date picker and live current-time marker are present in the agenda toolbar/view.
- The local day grid now begins at 06:00 and exposes 15-minute booking slots through 23:15. The default 45-minute appointment ends by midnight; the time picker adjusts its latest start when a different duration is selected. The agenda includes the observed print action and summary metrics for virtual appointments and payments. Income and refunds are separate transaction records linked to a patient and optionally to an appointment; the agenda sums them by transaction date and selected professional, branch, and business. These records remain in browser local storage and do not provide accounting reconciliation.
- Current data is synthetic and browser-local. Contract and consent signatures are simulated. The screenshot does not establish Velka's underlying storage, authentication, signature provider, or workflow behavior beyond the visible screen.

## Local base-project walkthrough, 2026-10-26

- The CRM rendered successfully in the in-app browser on `localhost:3000`; the visible demo-mode banner clearly states that records are synthetic and local to that browser.
- The agenda filter panel exposes professional, branch, business, and appointment-status filters. The new-appointment form collects patient, date, time, service, duration, modality, business, professional, branch, and a required deposit amount. It states that confirmation is unavailable until the deposit is recorded.
- The patient chart exposes the diagnosis → contract and consent workflows. The contract form shows that diagnosis acceptance is required before preparation. The consent form selects the patient and a clinic format, and states that preparing the document saves a copy without sending it for signature.
- These screens were inspected without submitting forms or changing patient, appointment, or document records. This is direct UI evidence of the local base project's main workflow connections, not a live shared-database or electronic-signature verification.
- Base-project status: the requested workflow surfaces are implemented and running locally. The clinic-owned Supabase project, clinic-approved legal/document text, and signature/delivery integration are not supplied/configured in this workspace, so those are the remaining clinic-specific handoff items rather than unfinished local screen scaffolding.
- Further captures of other Velka sections would need their own narrowly scoped review if they could include patient data.

## Agenda review, 2026-10-26

- REA browser target inventory: `ev_bdea1593c3258eecb72f532631971b77002e75fff8003ec8ac64444ffdc2134b`; target `5A564743BEBA906664D59AE8A19D3CD5` at `https://velka.mx/dashboard/appointment-scheduler?date=2026-10-26`.
- REA screenshot Evidence: `ev_14ef006783909ffdee5cafdf2ea7b2c409bdf6b64c068975c9060e334da145f7` (SHA-256 `2f93e29f30a01ec9ad830bdd7dd1d10c851344a7b2a3a0eff1ed3b2965adc0d9`) and `ev_80b4084ae7b2864c790e2f67e77b9ae92f91960abaa13296c92e57586fea82d1` (SHA-256 `9e8bed23e135a4a20b94145fd6e92f64e9fa2487a2351ac469eeaf09ff3b8c10`). Both are viewport-only screenshots. The second includes platform notification prompts.
- A separate local browser inspection of the agenda filter panel (not sent to REA) showed patient search, clinic selection, treatment selection, appointment status checkboxes, and modality choices (all, internal, online). The clinic selector contained five clinic names. No patient names or entered form values were read during that control inspection.
- At the observed date, the agenda displayed day/week/month/year modes, previous/next date controls, print, and a new-appointment action. Summary cards showed total, confirmed, pending, virtual, and income. The day schedule exposes 15-minute slots from 06:00 through at least 23:15. The selected date showed zero appointments.
- This page did not expose professional, branch, or business selectors in the inspected filter panel. The clinic's stated need for filtering by assigned professional, branch, and business remains an explicit requirement for the new CRM rather than an observed Velka feature.
- REA was used only for target discovery and visible-viewport screenshots. No REA DOM, script source, network, storage, or patient-record inspection was performed. The agenda route was opened and its filter panel was expanded for visual inspection; no record was created or edited.

## Read-only agenda capture, 2026-10-26

- The user authorized sending a viewport-only agenda screenshot to REA.
- REA browser target inventory: Evidence `ev_bdea1593c3258eecb72f532631971b77002e75fff8003ec8ac64444ffdc2134b`; selected page `5A564743BEBA906664D59AE8A19D3CD5` at `https://velka.mx/dashboard/appointment-scheduler?date=2026-10-26`.
- REA screenshot Evidence `ev_6fe789c049d68786d0e3ce56a41cfdf630e5c0f55efb9a9c5ff82aadd3c33496`, captured 2026-10-26 22:08 UTC. SHA-256 `8d31c22f53d1a2be5aab8b22b1e841207e7616006d9be67bdcc1404fe791c09e`.
- This single 1249 × 1221 viewport showed the selected day view, date controls, Filter / Print / New appointment actions, summary cards, and empty 15-minute slots starting at 06:00. The summary showed zero appointments and zero income at capture time. Two notification prompts obscured the upper-right region. No patient record was visible.
- Scope remained screenshot-only: REA did not scroll, navigate, or evaluate page JavaScript, and no record was created or edited.

## Read-only consent and contract review, 2026-10-26

- The user authorized read-only REA captures of Velka's contract and informed-consent pages, including the possibility that visible patient or document details might appear.
- REA screenshot Evidence `ev_8375becf1d5dc6211009b33cd6e1cba658a453937c64a55443b461ef56b93088` captured `https://velka.mx/dashboard/my-consents` (SHA-256 `2da2628d63824eb65f85d54be06f0939d04b9c73985d06f7947683f0ffc49e28`). The visible page is a consent-catalog assignment screen for the signed-in account, with available consent types, assigned/plan counts, and a selection/assignment action. No consent was selected or assigned.
- A patient medical-legal documents page was opened read-only in the browser. The matching account-name profiles were incomplete and flagged as possible duplicates; the document view showed no contracts or consents. No diagnosis was accepted and no records were merged or edited.
- REA automatic review rejected transmission of a screenshot of that broader patient medical-legal profile as outside the specific page scope. No further screenshot attempt was made. The agent-performed REA browser scenario provider also failed before navigation; the REA doctor command could not run because the npm registry was unreachable (`ENOTFOUND`).
- Therefore the consent page has direct screenshot evidence; a patient-specific contract viewer remains unobserved. To capture it safely, the correct profile must already have an actual contract viewer open, and the capture must be limited to that viewer rather than the patient directory/profile.
