# Google Calendar OAuth setup

Each CRM account can manage only the Google Calendar connection for the professional profile linked to that account. The settings page never lists other professionals' accounts. A signed-in account can select a calendar where its Google account has write access; multiple professionals can select the same shared Google Calendar if each account has permission. Appointments for professionals without an individual connection stay in the CRM and are not sent to a clinic-wide calendar. The previous clinic-wide connection is no longer used for new appointment syncs; existing Google events are left untouched. Sync is one-way: Google Calendar edits do not change CRM appointments. Events use a generic title and description and omit patient names, notes, diagnoses, and service details. Cancellations remove the matching CRM-created Google event; disconnecting leaves already-synced events in Google Calendar.

## Google Cloud

Create a Web application OAuth client and register this exact production redirect URI:

```text
https://gestion-clinica-crm.vercel.app/api/integrations/google-calendar/callback
```

This is a server-side OAuth flow, so the Authorized redirect URI is required; the Authorized JavaScript origins list can stay empty. Configure the OAuth audience and app branding in Google Auth Platform. While the app is in **Testing**, add the connecting Google account as a test user; external apps in Testing receive refresh tokens that expire after seven days. For lasting production connections, publish the app and complete any Google consent-screen verification required for the requested Calendar scope. Google classifies Calendar event access as sensitive user data, so an unverified app may show a warning or face user limits.

Keep **Use this client for an AI-powered agent** unchecked. This application calls the Google Calendar API directly, not Google's Calendar MCP server.

The OAuth request uses these scopes:

```text
openid
email
https://www.googleapis.com/auth/calendar.events
https://www.googleapis.com/auth/calendar.calendarlist.readonly
```

Add both Calendar scopes under **Google Auth Platform → Data Access** before testing the consent flow. The events scope is needed to write to calendars shared with the authorizing account; the calendar-list scope lets the CRM offer calendars the account can edit. Google accounts must have **Make changes to events** access to a shared calendar. After deploying the scope change, each account must reconnect and grant the updated access.

The CRM only writes to the calendar selected for the professional's appointments. Google classifies Calendar event access as sensitive user data, so production OAuth verification may be required for external users.

The app requests offline access so it can keep syncing without the user present.

## Vercel environment

Add these values to the Production environment:

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | The `client_id` from the downloaded web client JSON |
| `GOOGLE_CLIENT_SECRET` | The `client_secret` from that JSON; mark it Secret |
| `GOOGLE_REDIRECT_URI` | The exact URI above |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Base64 for a random 32-byte key; mark it Secret |
| `CRON_SECRET` | A long random bearer secret for scheduled sync; mark it Secret |

Generate the encryption key locally with Node.js:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Generate a separate value for `CRON_SECRET`:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Do not commit the generated key or OAuth client JSON. Changing the encryption key later requires reconnecting Google accounts unless old keys are retained for decryption.

## Database

Apply the Google Calendar OAuth and provider-calendar migrations in `supabase/migrations/` to the connected Supabase project before using Connect. The OAuth and sync-job tables are inaccessible to browser roles; server routes validate clinic membership and provider assignment before using the service-role client. Appointment writes enqueue sync jobs in the database. The authenticated sync endpoint handles new changes immediately, and `vercel.json` schedules a daily retry sweep (Vercel Hobby cadence). More frequent scheduled retries require a Vercel plan that supports them.

After adding the environment variables, updating the Google consent scopes, and applying the migrations, redeploy Vercel. In **Configuración → Google Calendar**, a signed-in professional can connect their Google account and select a writable calendar for the CRM professional profile linked to their account. Only that account's linked profile appears. Use **Resincronizar citas** to queue upcoming appointments for that professional for the next 90 days.

Google's public OAuth verification also requires the domains used for app branding and redirect URIs to be verified. The Vercel hostname can be used for development and initial authorization, but a custom domain owned by the clinic may be needed for public production verification.
