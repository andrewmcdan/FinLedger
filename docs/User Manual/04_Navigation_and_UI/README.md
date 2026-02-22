# Navigation and UI

This section describes current navigation and shared UI behavior.

## Navigation Model

FinLedger uses a single-page application (SPA) pattern.

- The page frame (header and navigation) stays on screen.
- Main content is loaded into the center content area.
- URL hash routes control which page appears (for example `#/dashboard`).

Default route:

- If no route is provided, FinLedger loads `Dashboard`.

## Header Layout

The global header includes:

- FinLedger logo and product name
- Logged-in user label (`You are logged in as ...`)
- Calendar icon (opens pop-up calendar)
- Main navigation links
- Profile button with user name and avatar

Logo behavior:

- Selecting the logo returns the user to `Dashboard`.

## Main Navigation

Primary navigation links:

- `Dashboard`
- `Accounts` (route key: `#/accounts_list`)
- `Transactions`
- `Reports`
- `Help`
- `Login` or `Logout` (depends on session state)

Active-page behavior:

- The current route is highlighted in the navigation bar.
- Browser title updates to `FinLedger - <Page Name>`.

## Route Access and Redirect Behavior

Current route outcomes:

- Valid route: requested page loads into the main content area.
- Unknown route: user is shown the Not Found page.
- Not logged in or expired session: user is redirected to `Not Logged In` or `Login` depending on context.
- Insufficient permission: user is redirected to `Not Authorized`.
- Temporary password required: user is redirected to `Change Password`.

## Global Message Line

FinLedger uses a global message line below the header for success/error feedback.

Behavior:

- Message codes are resolved from the message catalog.
- Error messages use alert-style presentation.
- Success messages use status-style presentation.
- The dismiss button clears the message.
- Editing form inputs automatically clears the current message.

## Profile Menu

The top-right profile control opens a menu with:

- `Go to profile`
- `Logout`

Interaction behavior:

- Opens on hover/focus.
- Closes on mouse leave, route change, or `Esc`.

## Help and Tooltips

Help:

- `Help` is a top-level navigation item.
- The Help page is organized as expandable accordion topics.
- Topics cover account access, profile/security, admin tools, reports, and support.
- Support includes a public link to download the User Manual PDF.

Tooltips:

- Many interactive controls use hover text (`title`) for quick guidance.
- Examples include page actions, table controls, and form inputs.

## Calendar Widget

The header calendar icon opens a pop-up calendar.

Calendar controls:

- Previous month
- Today
- Next month
- Month dropdown
- Year dropdown

Display behavior:

- Shows a month grid with the current day highlighted.
- Closes when clicking outside the calendar popup.

## Loading and Page Transition Behavior

FinLedger uses a global loading overlay for page changes and long-running actions.

Behavior:

- Overlay appears during route/page loads.
- Overlay hides after content finishes loading.
- A short minimum display time is applied to prevent flashing.

## Current Module UX Status

- `Dashboard`: operational/admin workspace, plus static summary cards.
- `Accounts`: implemented account-management UI.
- `Transactions`: simple activity feed with refresh timestamp update.
- `Reports`: simple period selector and static summary text.

## Layout Consistency

Shared patterns across pages:

- Common header/navigation shell
- Card and table layout components
- Global message line for feedback
- Global loading overlay for route/action loading
- Role-aware visibility for privileged controls
