# Services feature: implementation map

Analysis date: 29 October 2026. Implementation status: shared catalog and multi-service appointment linking shipped locally and applied to the connected clinic.

## Delivered in the first release

- Replaced the Settings placeholder with a searchable catalog, category/lifecycle/branch filters, inline create/edit, and archive/reactivate actions.
- Imported 55 clinic service records into the connected clinic. Unknown values remain null or explicitly unresolved; package totals and currencies are preserved as published.
- Added clinic-scoped tables, staff-read/admin-write RLS, append-only audit events, atomic catalog save with branch/provider eligibility, and server-generated historical service snapshots for appointment selections.
- Added branch and professional assignment in the service editor. Appointment forms support multiple assigned, active services with configured duration, suggest their combined duration, and let staff adjust it in 15-minute increments up to 12 hours. Manual/legacy service entry still works.
- Verification: PostgreSQL migration/security/multi-service/snapshot tests, all 51 project tests, Next.js production build, and Playwright checks for the live catalog, imported records, USD/package rendering, search, responsive layout, and successful loading of `service_ids` in the live agenda.

Package purchase/redemption balances, service consent-template workflows, and public booking remain future scope. For service availability, an empty branch/professional scope means the active service is available clinic-wide; explicit scope selections restrict it. Services with unknown duration remain selectable and require staff to enter the visit duration. The open business decisions below still apply.

## Evidence and current state

- Inspected the signed-in Velka Services page, its add/edit forms, treatment picker, help dialog, and the service picker in a new, unsaved appointment.
- Velka settings: https://velka.mx/dashboard/settings?section=doctor-services
- Velka has four active services: Alopecia / Caída de Cabello (30 min, MXN 2,000, description “Tratamiento capilar”), Ácido Hialurónico, Toxina Botulínica, and Depilación Láser (each shown as 30 min; no displayed price for these three).
- Velka distinguishes a general treatment from the clinic's named service. Its service form includes description, duration, optional price, MXN display, optional consent, online availability, and a follow-up flag. Services can be deactivated rather than deleted.
- Velka's appointment form permits multiple services, and separately exposes appointment duration, consultation type, and fees. Opening its selector confirmed the same four catalog entries. Automatic price/duration behavior after selection was not tested, because this inspection did not change selections or save external records.
- Our Configuración → Servicios is currently a placeholder. The connected database has no service/package catalog tables. Appointments store one free-text service and a required deposit, without a service price/currency snapshot.
- Our payment ledger currently enforces MXN. Current booking durations are discrete choices of 15–120 min; starts use a 15-minute grid.
- The supplied full list is the authoritative price source for this import. Existing Velka entries are reconciliation evidence, rather than automatic overrides of the brochure.
- No Velka settings or appointments were saved during analysis.

## Product model

Use one clinic-owned catalog with business/branch availability and eligible professionals. A service belongs to a treatment family and category; named variants and commercial offers attach to that service.

Examples:

- Family: Toxina botulínica. Variants: Frente / 20 unidades; Entrecejo / 12; Patitas de gallo / 18; Antifaz completo / 50. Do not infer a product brand from unit counts.
- Service: Morpheus 8. Offers: one session / USD 300; three sessions / USD 500. Each visit has its own appointment duration.
- Service: Depilación. Area variants have ten-session package offers; unspecified single-session prices remain unquoted.
- Service: Lipoláser. Separate treatment-area choices from pricing tiers (half, one, two, three areas). Assessment is MXN 500, clarified by the clinic.

Suggested categories: Faciales, Corporales, Depilación, Inyectables, Sueroterapia, Lipoláser, and Consultas/revisiones when needed. Keep the two brochure facial lists as source/brand distinctions, rather than duplicate categories. Some entries under the second facial heading explicitly treat corporal areas and should be categorized accordingly.

## Source-to-catalog mapping

“—” means not supplied, never zero. MXN and USD amounts stay in their original currency. Unspecified package session counts stay unset.

| Source group | Service / variant | Individual price | Duration | Package / notes |
|---|---|---:|---|---|
| Faciales 1 | Facial Limpieza | MXN 700 | 30 min | MXN 2,500; sessions unspecified |
| Faciales 1 | Dermapen ácido hialurónico | MXN 1,000 | 30 min | MXN 2,500; sessions unspecified |
| Faciales 1 | Dermapen PDRN de Salmón | MXN 1,000 | 30 min | MXN 3,500; sessions unspecified |
| Faciales 1 | Dermapen Pink K Coreano | MXN 799 | 30 min | MXN 3,500; sessions unspecified |
| Faciales 1 | Mesoject Gun + Dermapen PINK | USD 80 | 30 min | — |
| Faciales 1 | Mesoject Gun | MXN 3,500 | 30 min | MXN 5,000 / 5 sessions |
| Faciales 1 | Oxygen Bubbles | MXN 999 | 30 min | MXN 4,000 / 5 sessions |
| Faciales 1 | Radiofrecuencia Fraccionada | USD 100 | 30 min | USD 250 / 3 sessions |
| Faciales 1 | Morpheus 8 | USD 300 | 30 min | USD 500 / 3 sessions |
| Corporales | Drenaje Linfático | — | 25–30 min | MXN 2,500; sessions unspecified |
| Corporales | Masaje relajante / Descontracturante | MXN 800 | 60 min | MXN 2,500; sessions unspecified |
| Corporales | Emszero | MXN 500 | 30 min | MXN 2,500; sessions unspecified |
| Corporales | Emszero – Peptonas | — | 30 min | MXN 3,500; source says no unit session has been sold |
| Corporales | Dermalift | — | 30 min | MXN 4,000; sessions unspecified |
| Corporales | Depilación, general entry | Per area | 15–30 / up to 60 min | Map to the area catalog; retain source duration range |
| FloreZen list | HIFU 7D Ultraformer – Full Face | USD 130 | — | — |
| FloreZen list | Exilis Luxury 360 | MXN 2,000 | — | Area not specified in this entry |
| FloreZen list | Dermalift Profiler | MXN 1,500 | — | Keep separate from Dermalift until equivalence confirmed |
| FloreZen list | HIFU 7D Ultraformer – 1 Área Facial | MXN 1,200 | — | — |
| FloreZen list | HIFU 7D Ultraformer – 1 Área Corporal | USD 50 | — | Corporal variant |
| FloreZen list | Exilis Luxury 360 – 1 Área Corporal | MXN 1,200 | — | Corporal variant |
| FloreZen list | Hifu V'lase – Full Face | USD 70 | — | — |
| FloreZen list | Hydrafacial GlowUp – Rostro / Full Face | MXN 1,200 | — | — |
| Sueroterapia | EL BOOST | MXN 1,500 | — | — |
| Depilación | Piernas completas | — | — | MXN 4,000 / 10 sessions |
| Depilación | Rostro completo | — | — | MXN 3,000 / 10 sessions |
| Depilación | Medias piernas | — | — | MXN 3,000 / 10 sessions |
| Depilación | Brazos completos | — | — | MXN 3,000 / 10 sessions |
| Depilación | Bikini Hollywood | — | — | MXN 2,500 / 10 sessions |
| Depilación | Media cara | — | — | MXN 2,500 / 10 sessions |
| Depilación | Medios brazos | — | — | MXN 2,500 / 10 sessions |
| Depilación | Bikini Brasileño | — | — | MXN 1,800 / 10 sessions |
| Depilación | Axilas | — | — | MXN 1,500 / 10 sessions |
| Depilación | Bikini | — | — | MXN 1,500 / 10 sessions |
| Depilación | Patillas | — | — | MXN 1,500 / 10 sessions |
| Depilación | Línea interglúteo | — | — | MXN 1,500 / 10 sessions |
| Depilación | Bigote | — | — | MXN 999 / 10 sessions |
| Depilación | Mentón | — | — | MXN 999 / 10 sessions |
| Depilación | Nariz | — | — | MXN 999 / 10 sessions |
| Depilación | Entrecejo | — | — | MXN 999 / 10 sessions |
| Inyectables | Frente | MXN 2,000 | — | 20 units |
| Inyectables | Entrecejo | MXN 1,200 | — | 12 units |
| Inyectables | Patitas de Gallo | MXN 1,800 | — | 18 units |
| Inyectables | Antifaz Completo | MXN 4,000 | — | 50 units |
| Inyectables | Relleno de Ácido Hialurónico | MXN 4,000 | — | Candidate match for Velka's generic Ácido Hialurónico |
| Inyectables | Aplicación de Enzimas | MXN 1,500 | — | Per session |
| Inyectables | NCTF o NCPR | MXN 1,800 | — | Per session; confirm whether to split into product variants |
| Inyectables | ADN de Salmón | MXN 1,500 | — | Per session; distinct from Dermapen PDRN |
| Inyectables | Sculptra | USD 450 | — | USD 1,200 / 3 sessions |
| Lipoláser | Valoración | MXN 500 | — | Currency clarified by the clinic |
| Lipoláser | 1/2 área | USD 300 | — | Area selected at booking |
| Lipoláser | 1 área | USD 550 | — | Area selected at booking |
| Lipoláser | 2 áreas | USD 850 | — | Area selections retained |
| Lipoláser | 3 áreas | USD 1,100 | — | Area selections retained |
| Velka only | Alopecia / Caída de Cabello | MXN 2,000 | 30 min | Retain for review; not listed in the brochure |

Lipoláser area choices: Brazos, Papada, Entrepierna, Vientre bajo, Banana rolls, Joroba, Área del brasier, Piernas, Monte venus, Rodillas, Tobillos, Chaparreras, Love handles, Espalda, Abdomen alto, and Jowls.

The 50-unit Antifaz offer is its own published offer: its MXN 4,000 price must not be reconstructed from the three individual-area prices. Package totals are not individual-session fees, and a package price divided by its session count is not a published unit offer.

## Implementation sequence

### 1. Normalize and review the import

- Build structured seed data with stable service codes and source references.
- Separate service identity, area/product variant, individual offer, package offer, quantity/unit, currency, duration/range, and optional description.
- Detect duplicate aliases without automatically merging clinically distinct products.
- Mark unresolved values and proposed business/branch assignments for review. Do not infer professional eligibility from a brochure or grant every service to every professional.
- Keep slogans and contact details out of service records; those belong to clinic identity/marketing.

### 2. Add the database foundation

Proposed tables (names finalized during implementation):

- `clinic_services`: category, treatment family, clinic-specific name, description, code, default duration or range, lifecycle state and revision.
- `service_variants`: area/product/unit options where applicable.
- `service_offers`: individual/package type, total amount, MXN/USD currency, session count, quote-required state, and optional validity dates only when supplied.
- `service_branches` and `service_providers`: explicit availability and eligibility, with optional branch-specific price/duration overrides.
- `service_consent_templates`: references to existing nonempty clinic-approved templates; do not invent consent text.
- `appointment_service_items`: service/variant/offer references plus immutable booking snapshots of names, quantities, quoted amounts and currencies, and relevant revision/template references.

Use clinic-scoped foreign keys, row-level security, administrator-only catalog writes, permitted staff reads, server-side validation, atomic booking/item saves, and audit records. Archive services/offers instead of removing referenced history. Existing appointment text remains usable during migration.

### 3. Replace the Settings placeholder with the catalog

- Searchable table with service, category, business/branches, duration, price/currency, offers, and active/inactive/setup-needed status.
- Filters for category, business, branch, status, and incomplete configuration.
- Add/edit service editor with sections for identity, availability, scheduling, prices/packages, and consent/follow-up settings.
- Show package count and total explicitly, and “Por cotizar” / “Por definir” for missing data.
- Provide archive/reactivate actions with clear effects on future selection and existing appointments.
- Keep clinical staff able to consult the catalog; separate administrative editing permissions.
- Preserve the current app's light/dark styles, compact information density, keyboard controls, and mobile behavior.

### 4. Connect creation and editing of appointments

- Replace the primary free-text service field with searchable, multi-select catalog items scoped to the branch and eligible professional.
- Pre-fill known duration and display itemized quoted prices, while keeping permitted staff adjustments explicit.
- For several sequential services with known durations, suggest the sum. Staff may adjust the overall visit duration; selecting services does not create overlapping appointments automatically.
- Extend the current hardcoded duration choices to include 105 minutes and longer combined visits when needed, using validated 15-minute increments and the clinic's booking limits. Apply the same rules in create/edit forms, overlap detection, and database validation; preserve the same-day midnight boundary.
- Ask for appointment duration when catalog duration is absent. Preserve the Drenaje 25–30 min source range and offer a visible 30-minute scheduling suggestion within the current grid.
- Keep custom/legacy services available through an explicit custom-service path, with the same required duration/deposit validation.
- Clear incompatible service selections when branch/professional changes, with an explanation.
- Preserve existing bookings and all demo appointments; avoid retroactively linking services based only on fuzzy name matches.
- Display catalog items in appointment details, list view, and patient appointment history.

### 5. Integrate agenda colors and clinical documents

- Resolve service-color rules through stable service/treatment identity for new catalog bookings, preserving the existing text-rule fallback for legacy/custom bookings.
- Keep Iliana's review-first red rule; Morpheus/Morpheus8 and NCTF resolve pink at Elixir–Macristy. Combined visits containing a review use the review-priority rule, with item details available.
- Link service-specific consent templates and prepare document snapshots through the existing patient-document workflow. A template association does not imply patient consent or a signature.
- Store follow-up defaults only when the clinic supplies them. Offer staff an explicit follow-up scheduling action; do not infer a clinical interval or enable new outbound messaging.

### 6. Keep pricing, deposits, and package balances distinct

- Catalog and booking quotes support MXN and USD explicitly. Mixed-currency selections show separate currency totals.
- Existing deposits and recorded payments remain MXN. Any USD-to-MXN settlement needs an explicit agreed conversion and recorded rate; no silent conversion or dollar-for-peso treatment.
- Service price is separate from required deposit and actual received payments. Do not record income when a service is merely selected.
- Package definitions and prices belong in this first catalog release. Purchasing packages and redeeming remaining sessions require a separately scoped balance/transaction workflow; do not represent informational package offers as purchased entitlements.
- Public booking remains a separate, currently unavailable module. Store future eligibility only if useful; its presence must not imply a live public agenda.

### 7. Test, import, and verify

- Unit tests: aliases, null/quote-required prices, currencies, duration suggestions, multiple selections, price snapshots, package quantities, and review-priority colors.
- Database tests: membership and role boundaries, cross-clinic references, rollback on invalid item/offer, immutable historical snapshots, and archive/reactivation behavior.
- Browser tests: catalog creation/editing/search/filtering, reloading saved changes, service selection in appointment create/edit, branch/professional changes, missing-duration handling, mixed currencies, and existing free-text appointment compatibility.
- Visual checks in desktop/mobile and both themes; no inaccessible reliance on color.
- Re-runnable import with a review summary. No automatic import of Velka patients, appointments, or clinical notes.
- Apply tested migrations, import reviewed catalog data, verify persistence against the connected clinic, and leave Velka unchanged.

## Decisions to settle before activating the full import

1. Which services are offered by each business/branch and which professionals may perform them? The FloreZen heading suggests a brand association but does not establish every branch assignment.
2. Missing durations and package session counts; preserve them as pending setup rather than inventing values. Internal booking can require staff-entered duration where needed.
3. The clinic's USD settlement/exchange-rate policy.
4. Whether Velka-only Alopecia is still offered; whether Dermalift equals Dermalift Profiler; whether NCTF/NCPR should be separate variants.

Implementation can start with the schema, catalog UI, and reviewable draft import before these business decisions are settled. Activation and quoting must respect unresolved fields.
