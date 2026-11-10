# Clinic feedback development ledger

Scope comes from the clinic’s November 8, 2026 feedback. This ledger tracks development and verification of the Next.js CRM. The expense ledger is a separate feature below.

| Item | Acceptance criteria | Status |
| --- | --- | --- |
| Scheduling notes | Reception can enter, edit, and clear a note on a saved appointment. The note is still available after reopening. | Shared store tests pass. Playwright verified create, reopen, edit, and clear in demo. |
| Automatic professional assignment | Selecting a doctor-only service selects its sole eligible professional. Branch restrictions, other selected services, and schedule validation still apply. | Eligibility tests pass. Playwright verified catalog configuration and automatic assignment in demo. |
| Session cost | Show the session cost below the deposit. Preserve the agreed amount and currency with the appointment, including manual quotes. | Store and migration tests pass. Playwright verified the USD catalog suggestion, manual override, separate MXN deposit, reopening and clearing in demo. Shared workspaces need the appointment session price migration. |
| Assessment and reviews | Support a general Valoración and 15-minute reviews for Botox, relleno, and enolyse. Keep Valoración Lipoláser separate. Verify clinic prices and assessment duration before using them as defaults. | Template and shared import tests pass. Playwright verified the three 15-minute rows. Prices and general assessment duration remain configurable. |
| Patient arrival | Reception can record arrival once. The assigned professional’s linked staff account receives a notification. Arrival time remains available in the agenda. | PostgreSQL verified authorization, idempotent check-in, targeted inbox, and web/native queueing. Playwright verified timestamp persistence and the demo inbox link. Shared workspaces need the patient arrival migration. |
| First visit and treatment history | Scheduling indicates first visit and prior completed sessions for the relevant treatment. | Store and matching tests pass. Playwright verified first-visit labels, completed sessions outside the current calendar and branch, date cutoff, and patient switching. |
| Patient packages | Link appointments and payments to a purchased package. Show completed and remaining sessions and paid or outstanding amounts. Renewal creates a separate purchase. | PostgreSQL verified scoped purchases, booking capacity, cancellation, payment allocation, and refunds. Playwright verified purchase, booking, completion, partial payment, settlement, and separate renewal. Balances use MXN. Package bookings skip a separate deposit. Shared workspaces need the patient packages migration. |
| Monthly promotions | Staff can set a date-limited promotion for a service or package. A booking keeps the accepted price after the promotion ends. | PostgreSQL verified clinic scope and manager permissions. Playwright verified session and package promotion setup, date-based quote changes, and preserved prices after archiving. Sessions use the booking date and packages use the local purchase date. Shared workspaces need the promotions migration. |
| Bills and expense ledger | Schedule internal monthly reminders for bills such as water and internet, record expenses, and review totals for the selected month. | PostgreSQL verified finance recipients, clinic-local deadlines, deduplication, and paid-bill suppression. Playwright verified bill setup, due dates, payment, expense edits, cash totals, and recurrence. Shared workspaces need the expense ledger migration and the staff notification worker for scheduled reminders. |
| MXN and USD conversion | Convert both directions using a dated published reference rate. Preserve any rate applied to a recorded transaction. | PostgreSQL verified immutable rate references, the original USD amount, and package settlement in MXN. Playwright verified both directions against Frankfurter, rejection of an unconfirmed rate, and the saved rate and MXN close after reload. Shared workspaces need the payment exchange rates migration. |

## Final verification

- The Next.js production build passed with `npm run build -- --webpack`.
- All 192 automated tests passed, including local PostgreSQL coverage for clinic permissions, financial constraints, and notification queues.
- All eight Playwright MCP scenarios passed against the final Next.js demo. They cover all ten feedback items.

## Shared workspace setup

Apply the six feedback migrations in timestamp order. The existing scheduled staff notification worker queues and delivers monthly bill reminders. Confirm that the assigned professional has a linked account and has enrolled a device for push delivery. Use the catalog to identify the clinic's doctor-only services and set the clinic's assessment and review prices.

Verification used synthetic data and local PostgreSQL. Shared migration rollout and live push delivery were outside this verification.
