Premium dashboard rollback snapshot

To restore the pre-change files from the project root:
  Copy-Item .rollback/premium-dashboard-before-2026-10-27/src/app/app-shell.jsx src/app/app-shell.jsx -Force
  Copy-Item .rollback/premium-dashboard-before-2026-10-27/src/app/globals.css src/app/globals.css -Force

This snapshot was created before the dashboard visual refinement on 2026-10-27.
