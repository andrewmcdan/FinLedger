# Overview and Roles

## System Overview

FinLedger is a single-page web application with authenticated navigation and role-aware controls.

Current user-facing modules are:

- Dashboard
- Accounts (Chart of Accounts)
- Transactions
- Reports
- Audit
- Help
- Profile

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
    - Full report generation and report-email actions.
    - Can use the Audit page and audit log APIs.
- Manager:
    - No admin user-management controls.
    - Read-only use of current Accounts list UI.
    - Can create journal entries, review queue entries, and perform manager approval actions in Journal Queue.
    - Can generate and email financial reports.
    - Can use the Audit page and audit log APIs.
    - Can use current Transactions, Reports, Help, and Profile pages.
- Accountant:
    - No admin user-management controls.
    - Read-only use of current Accounts list UI.
    - Can create journal entries and review Journal Queue status, but cannot approve/reject queue entries.
    - Can open Reports UI, but report-generation/report-email APIs are restricted to administrator and manager roles.
    - Can use the Audit page and audit log APIs.
    - Can use current Transactions, Reports, Help, and Profile pages.

## Module Map

- Dashboard:
    - Dynamic summary cards, ratio cards, important messages, and admin-only user-management workspace.
- Accounts:
    - Implemented Chart of Accounts list and admin account/category management.
- Transactions:
    - Journal entry creation, journal queue review/approval workflow, and posted ledger views.
- Reports:
    - Trial balance, income statement, balance sheet, and retained earnings report generation with CSV/email/print actions.
- Audit:
    - Dedicated audit-report page with date-range, account, and user filters.
- Help:
    - Accordion help topics plus User Manual PDF link.
- Profile:
    - Personal info updates, password change, and security question updates.

For authentication and password policy details, see `docs/User Manual/02_Login_and_Security/README.md`.
For administrator workflows, see `docs/User Manual/03_User_Administration/README.md`.
