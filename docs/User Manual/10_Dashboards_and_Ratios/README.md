# Dashboards and Ratios

## Dashboard (Current)

The `Dashboard` page is the current landing page after login.

Shared elements:

- Static cards for `Cash on Hand`, `Payables`, and `Receivables`
- Last-updated timestamp
- Refresh button behavior for dashboard data section(s)

Role-based rendering:

- Administrator:
  - Full `User Management` workspace (approvals, suspended users, user table, create/delete/reset/suspend/email tools).
- Manager and accountant:
  - Simplified `Your Workspace` card only.

## Ratios (Current Status)

Financial ratio calculations are not currently implemented in the dashboard UI.

Not available yet:

- Ratio formulas and computed outputs
- Ratio threshold rules
- Green/yellow/red ratio state coding

## Alerts and Notifications

Current in-app feedback uses the global message line for action results.

Not available yet:

- Dedicated persistent dashboard notification center
- Ratio-driven alert widgets

## Documentation Note

Update this section when dynamic financial metrics and ratio logic are implemented.
