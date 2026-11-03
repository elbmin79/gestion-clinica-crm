# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

Existing CRM: Next.js App Router at the repository root. Native CRM: React Native with Expo and Expo Router in `apps/mobile`, selected for the requested iOS and Android client. Share platform-neutral CRM logic through npm workspace packages; do not embed the web app in a WebView.

## Users

The existing clinic team: administrators, receptionists, clinicians, and billing members. The native client must preserve the current clinic roles and permission gates. The public booking flow is also part of the requested product parity.

## Product Purpose

Operate the clinic CRM across patient records, appointments, clinical documentation, payments, reminders, WhatsApp, team access, services, availability, settings, and public booking. Success means the same clinic team can use the same records and workflows in the native app as in the existing CRM.

## Positioning

One clinic workspace shared by the existing web CRM and native iOS/Android clients, backed by the same Supabase Auth users, clinic memberships, database, storage, row-level security, and server-side integrations.

## Operating Context

Clinic staff use the CRM while coordinating schedules, care records, payments, documents, and patient communication. The mobile client is intended to be installed and previewed by the clinic's client team on both iOS and Android.

## Capabilities and Constraints

- Preserve functional parity with the current CRM routes, roles, permissions, business rules, integrations, and public booking flow.
- Reuse the current Supabase project, schema, migrations, Auth identities, RLS policies, storage, and server-only integrations. Do not create a second clinic database.
- The native app has its own device session; it does not share the web browser's cookie session.
- The Supabase publishable key may be bundled in the native app. Secret and service-role keys remain server-only.
- Server actions, cookie-authenticated routes, web push, browser storage, and browser-only file/print APIs need native-compatible equivalents or a secure authenticated server API.
- Native screens must follow iOS and Android navigation, accessibility, safe-area, and system-control conventions. The app must not be a WebView wrapper.
- Expo account, Apple/Google distribution credentials, final bundle identifiers, and public-booking entry behavior are open deployment decisions.

## Evidence on Hand

- Repository source: clinic routes, role and permission definitions, Supabase stores, API routes, and `supabase/migrations/`.
- Operational boundary and setup notes: `docs/supabase-setup.md` and `docs/clinic-invitations.md`.
- Existing visual assets and styles live in `src/app/`; the current login identifies the product as Elixir Clinic.
- No App Store Connect account, Expo project, Android signing credentials, or registered client devices have been confirmed in the repository.

## Accessibility & Inclusion

Respect native screen readers, dynamic text/font scaling, keyboard behavior, safe areas, reduced motion, and platform-standard navigation on both systems. Color mode must work in light and dark appearances.
