# Velka reference notes

## Scope and evidence

The signed-in Velka Medical agenda was passively inspected through REA on
2026-10-26. Evidence ID: `ev_09ed221134a47d866fb744a5132aaa38d06b3a32fcec057f4c2b6a9a55a87264`.
The inspected page was `/dashboard/appointment-scheduler`. The capture did not
navigate, click, or submit anything. Patient details and stored values are not
part of these notes.

The page exposed day, week, month, and year view controls, a `Filtrar` control,
and `Agendar cita` actions. Its navigation also links to patients, payments,
messages, audits, consents, hospitals, users, legal, membership, and settings.
Filter choices, appointment creation steps, patient/contract workflows, and
backend behavior were not observed in this capture. The reference is evidence
for visible structure only, not a specification of Velka's database or access
rules.

## Clinic-specific priorities

The clinic identified these as the first workflows to tailor:

1. A service contract for a patient after the diagnosis is accepted.
2. Informed consents.
3. An agenda that can be filtered by the person providing the service, branch,
   and business.

The current CRM prototype has screens for these workflows and the agenda
filters. Its demo signatures are simulated. The shared database can prepare
and retain document snapshots, but a signature provider and legally reviewed
clinic documents are still required before real signing or clinical use.
