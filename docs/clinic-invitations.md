# Clinic invitations

Administrators invite an email from **Equipo y sucursales → Acceso a la clínica**,
choose a role, review its permissions, and send one authentication email. Pending
invitations can be resent after 60 seconds or revoked. Invitations do not create
memberships until the authenticated recipient accepts. The application invitation
expires after seven days; the Auth email token may expire sooner.

New accounts must save a password before clinic access activates. Existing
confirmed accounts receive a sign-in link and accept without replacing their
password. Professional records and login access remain separate: an administrator
can link an accepted member to a professional afterward.

## Deployment

Apply both invitation migrations in order:

- `20261031174240_clinic_invitations.sql`
- `20261031175123_invitation_password_completion.sql`

Configure the server-only `SUPABASE_SERVICE_ROLE_KEY` and set `APP_URL` to the
canonical CRM origin, such as `https://gestion-clinica-crm.vercel.app`.
Without APP_URL, the action uses the request Origin validated by Next.js.

In Supabase Auth URL configuration, set Site URL to that origin and allow the
CRM callback URL, including its query parameters. For example, a redirect rule
`https://gestion-clinica-crm.vercel.app/auth/callback**` covers the invitation's
encoded `next` parameter. Add localhost equivalents only for development.

The **Invite user** and **Magic link** email templates must preserve the
redirect passed by the app. Use `{{ .ConfirmationURL }}` as the button href,
without overriding `redirect_to`, hard-coding the login screen, or routing all
emails to password recovery. Invitation links go through `/auth/callback` and
then `/accept-invite?id=…`. Configure custom SMTP for real team delivery and
check provider limits. Sending failures are reported to the administrator and
never grant clinic access.

No email provider settings or templates are changed by the SQL migrations.

## Verification

`npm test` includes invitation delivery tests without email, and PGlite tests
for RLS, cross-clinic authorization, password completion, replay, resends,
revocation, expiry, and permission preservation. These do not contact Supabase.

For an opt-in browser smoke test against a configured project, run a local
production build/server and provide a locally installed Playwright package:

```powershell
node --env-file=.env.local scripts/invitation-smoke.mjs setup
$env:PLAYWRIGHT_MODULE = 'file:///absolute/path/to/playwright/index.mjs'
node --env-file=.env.local scripts/invitation-browser-smoke.mjs
```

The fixture creates only an isolated synthetic clinic and `@example.invalid`
accounts. It uses generated Auth links and never sends email. Screenshots and
temporary credentials live under ignored `.invitation-qa/`. Tokens are single
use; `invitation-smoke.mjs new-recipient` prepares a fresh invite for another run.

After testing, delete the synthetic clinic and Auth accounts recorded in the
fixture, then run `invitation-smoke.mjs cleanup`. Existing database guards reject
admin membership removal even on a whole-clinic cascade; a database owner must
remove only the fixture's synthetic admin membership before that cleanup can run.
Never disable these guards globally or remove a real clinic to clean up a test.
