# Overview and Roles

## System Overview

FinLedger is a single-page web application with authenticated navigation and role-aware controls.

Current user-facing modules are:

- Dashboard
- Accounts (Chart of Accounts)
- Transactions
- Reports
- Help
- Profile

Important current-state note:

- Journal entry, ledger, adjusting-entry, and full financial-statement workflows are not exposed as complete UI/API user workflows yet, even though related database tables exist.

## UI Landmarks

- Header: FinLedger branding, logged-in user label, calendar button, and top navigation.
- Top navigation: `Dashboard`, `Accounts`, `Transactions`, `Reports`, `Help`, and `Login`/`Logout`.
- Profile menu: top-right avatar/name menu with `Go to profile` and `Logout`.
- Global message line: page-level success/error message area below the header.
- Main content area: route content loaded without full page reload.
- Loading overlay: shown during route loads and longer actions.

## Role Summary

FinLedger supports three roles: `administrator`, `manager`, and `accountant`.

- Administrator:
  - Full user administration on Dashboard (approve/reject, create, edit, suspend/reinstate, delete, reset password, email user).
  - Full Chart of Accounts administration (create/edit/deactivate/reactivate accounts, manage categories/subcategories).
  - Can access audit log APIs.
- Manager:
  - No admin user-management controls.
  - Read-only use of current Accounts list UI.
  - Can access audit log APIs.
  - Can use current Transactions, Reports, Help, and Profile pages.
- Accountant:
  - No admin user-management controls.
  - Read-only use of current Accounts list UI.
  - Can use current Transactions, Reports, Help, and Profile pages.
  - Cannot access audit log APIs.

## Module Map

- Dashboard:
  - Static summary cards plus admin-only user-management workspace.
- Accounts:
  - Implemented Chart of Accounts list and admin account/category management.
- Transactions:
  - Current page is a simple activity view with refresh timestamp behavior.
- Reports:
  - Current page is a lightweight period selector and static summary text.
- Help:
  - Accordion help topics plus User Manual PDF link.
- Profile:
  - Personal info updates, password change, and security question updates.

For authentication and password policy details, see `docs/User Manual/02_Login_and_Security/README.md`.
For administrator workflows, see `docs/User Manual/03_User_Administration/README.md`.
