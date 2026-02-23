# Navigation and UI

This section describes current navigation patterns and shared UI behavior.

## Navigation Model

FinLedger uses a single-page application (SPA) shell.

- Header and navigation remain visible while route content changes.
- Main page content renders in the central app container.
- Hash routes control page selection (for example `#/dashboard`).
- If no route is provided, the app loads `Dashboard`.

## Header Layout

Global header elements:

- FinLedger logo and product name
- Logged-in user label (`You are logged in as ...`)
- Calendar button (opens pop-up calendar)
- Main navigation links
- Profile button (name + avatar)

Logo behavior:

- Selecting the logo navigates to `Dashboard`.

## Main Navigation

Primary links:

- `Dashboard`
- `Accounts` (`#/accounts_list`)
- `Transactions` (`#/transactions`)
- `Reports` (`#/reports`)
- `Help`
- `Login` or `Logout` (based on session state)

Route behavior:

- Active link is highlighted.
- Browser title updates to `FinLedger - <Page Name>`.

## Route Access and Redirect Behavior

Current outcomes:

- Valid route: page loads into the main content area.
- Unknown route: `Not Found` page.
- Missing/expired auth: `Not Logged In` or `Login` flow.
- Unauthorized role: `Not Authorized`.
- Temporary password required: `Change Password`.

## Transactions Page Visibility by Role

Transactions is now rendered server-side with role-aware sections.

- `manager` and `accountant`: Journal, Journal Queue, and Ledger sections.
- `administrator`: Ledger section only (read-only intent).
- Other/unknown roles: Access-restricted message on Transactions page.

## Global Message Line

FinLedger uses a message line below the header for user feedback.

- Messages are resolved from the message catalog.
- Errors use error styling.
- Success states use success styling.
- Dismiss control clears the current message.

## Profile Menu

Top-right profile menu actions:

- `Go to profile`
- `Logout`

Interaction:

- Opens on hover/focus.
- Closes on pointer leave, route change, or `Esc`.

## Help and Tooltips

Help behavior:

- `Help` is a top-level page.
- Help content is organized in expandable sections.

Tooltip behavior:

- Many controls use `title` hover text for quick guidance.

## Calendar Widget

Calendar popup controls:

- Previous month
- Today
- Next month
- Month selector
- Year selector

Display:

- Month grid with current day highlight.
- Popup closes when clicking outside.

## Loading and Transitions

Global loading overlay behavior:

- Displays during route and async page loads.
- Hides after content load completes.
- Uses a minimum display interval to reduce flicker.

## Current Module UX Status

- `Dashboard`: operational admin/user workspace with live and static elements.
- `Accounts`: primary account-management workflow is implemented.
- `Transactions`: role-gated journal/queue/ledger UI scaffold is implemented; backend workflow integration is still in progress.
- `Reports`: placeholder report UI is implemented; full report-generation workflows are still in progress.

## Layout Consistency

Shared UX patterns:

- Common header/navigation shell
- Card/table layout components
- Global message line
- Global loading overlay
- Role-aware control visibility
