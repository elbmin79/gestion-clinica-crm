---
target: whole CRM outside WhatsApp
total_score: 26
max_score: 40
na_heuristics:
p0_count: 0
p1_count: 4
target_identity: "file:D:\\BandIA\\MedicalCRM\\src\\app\\app-shell.jsx"
target_fingerprint: "sha256:638a642d0f5a9583276c3040b4c6ed7ca0adb0ff6a3e3861f12b56e9d46016c6"
target_path: "D:\\BandIA\\MedicalCRM\\src\\app\\app-shell.jsx"
timestamp: 2026-11-01T02-44-28Z
slug: src-app-app-shell-jsx
---
# CRM Frontend Review

Method: dual-agent (A: source design review · B: detector/browser evidence)
Target: src/app/app-shell.jsx; representative areas included agenda, patient records, payments, documents, team/access, settings, public booking, and integrations.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Loading and status coverage is good; error and retry feedback varies. |
| 2 | Match System / Real World | 3 | Spanish clinic workflows fit; a few internal terms remain. |
| 3 | User Control and Freedom | 2 | Modal-heavy workflows make exit and recovery awkward. |
| 4 | Consistency and Standards | 3 | Shared patterns exist, but many page-specific exceptions remain. |
| 5 | Error Prevention | 3 | Appointment, deposit, refund, and document prerequisites are guarded. |
| 6 | Recognition Rather Than Recall | 3 | Navigation and filters help; patient records demand too much scanning. |
| 7 | Flexibility and Efficiency | 3 | Multiple agenda modes, filters, and patient search support varied work. |
| 8 | Aesthetic and Minimalist Design | 2 | Patient records and agenda expose many details/actions at once. |
| 9 | Error Recovery | 2 | Some flows have retries/context retention; others use brief generic feedback. |
| 10 | Help and Documentation | 2 | Important caveats exist, but in-product guidance is uneven. |
| **Total** | | **26/40** | Good foundation; consistency and simplification needed for premium end-to-end quality. |

## Design Specificity Verdict

Moderately product-specific. Spanish clinical terminology, branch/provider workflows, and the patient-to-appointment-to-document journey ground the product in clinic operations. The shell still uses conventional dashboard patterns, and patient records are unusually dense.

## Strengths

- Patients, appointments, diagnoses, documents, and payment history are connected into real workflows.
- Shared backend rules cover appointment conflicts, deposit requirements, refund limits, role-checked finance access, and clinic-scoped data.
- Public booking communicates that a submission is a request, not a confirmed appointment, and avoids exposing private data.
- Broad operational coverage includes services, availability, permissions, push, Calendar, public booking, and WhatsApp.

## Priority Issues

1. Patient record dialog is overloaded with clinical history, diagnoses, files, documents, appointments, and actions. Consider an overview plus distinct Clinical, Documents, and Activity areas.
2. Error recovery is uneven; keep users near the failed field/action, preserve input, and explain a clear recovery step.
3. Agenda exposes many simultaneous filters. Promote common controls and tuck less-used ones behind a discoverable “More filters.”
4. Run a rendered accessibility/responsive review of custom dialogs and icon actions, covering keyboard focus, touch targets, contrast, and narrow screens.

## Production Boundary

The repo documents appointment reminders as mock-only with production dispatch failing closed; consent/contract records do not have a real signature provider; payments are not a full accounting/reconciliation system. Google Calendar and public booking have integration paths but depend on deployment setup, migrations, and provider configuration.

## Persona Red Flags

- First-time staff may not know what to do next in the dense patient record or when an async operation fails.
- Keyboard and screen-reader users need focus lifecycle verification for custom dialogs and icon-only actions.
- Power users benefit from broad filter/view options, though the number of controls can slow common agenda tasks.

## Minor Observations

The main app shell concentrates many workflows in a large component, increasing maintenance risk as features grow. Browser review was unavailable; Impeccable detector returned zero source findings. No code changes or tests were run.
