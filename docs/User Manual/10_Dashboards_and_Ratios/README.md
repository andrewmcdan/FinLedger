# Dashboards and Ratios

## Dashboard (Current)

The `Dashboard` page is the current landing page after login.

Shared elements:

- Summary cards (for example `Cash on Hand`, `Payables`, `Receivables`) with status pills
- `Quick Access` links to role-appropriate workflows
- `Financial Ratios` section
- `Important Messages` section for workflow alerts
- Color guide for dashboard status tones (good/warning/review)
- Last-updated timestamp in the dashboard header

Role-based rendering:

- Administrator:
    - Full `User Management` workspace (approvals, suspended users, user table, create/delete/reset/suspend/email tools).
- Manager and accountant:
    - Dashboard summary/ratio/message cards and quick-access links without admin user-management controls.

## Ratios

Dashboard ratio cards are calculated when enough posted accounting data exists.

When ratio data is insufficient:

- The ratio section shows a fallback notice instead of metric cards.

## Alerts and Notifications

Dashboard alerts are shown in the `Important Messages` section and can include links to related workflows.

The global message line is still used for immediate action-result messages (success/error) across pages.

- A separate inbox-style notification center is not currently implemented.

## Documentation Note

Keep this section aligned with dashboard card logic and role-based quick links as they evolve.
