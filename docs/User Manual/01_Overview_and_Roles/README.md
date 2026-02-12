# Overview and Roles

**System Overview**

FinLedger is a web-based financial management system that supports core accounting workflows, including user administration, chart of accounts, journal entries, ledger review, adjusting entries, and financial reporting. The application is organized into modules that align with the sprint feature lists and is accessed through a single-page web interface.

**UI Landmarks**

Use these landmarks when navigating the application or referencing UI elements:

- **Header and branding**: The top-left header area shows the FinLedger logo, application name, and a logged-in user banner. The banner reads “You are logged in as …” when authenticated.
- **Main navigation**: The top navigation bar includes `Dashboard`, `Accounts`, `Transactions`, `Reports`, `Help`, and a `Login`/`Logout` link depending on session state.
- **Profile menu**: The top-right profile button shows the current user name and avatar. It opens a small menu with `Go to profile` and `Logout`.
- **Calendar popup**: A calendar icon in the header opens a pop-up calendar for quick date reference.
- **Main content area**: Page content loads into the central area below the header. This is where module screens (Dashboard, Chart of Accounts, Ledger, Reports, etc.) appear.
- **Loading overlay**: A full-page loading overlay appears during page loads or long actions.

**Role Summary**

FinLedger supports three roles. The UI exposes or hides controls based on the user’s role.

- **Administrator**: Manages users (create, update, approve/reject registrations, suspend/reinstate, reset passwords) and manages the Chart of Accounts (add/edit/deactivate accounts, manage categories and subcategories). Administrators also access user and system reports and can email users from within the application.
- **Manager**: Creates and approves journal entries, reviews pending approvals, and runs financial reports (trial balance, income statement, balance sheet, retained earnings). Managers can also view ledgers and account event logs.
- **Accountant**: Prepares journal entries and adjusting entries, attaches source documents, and tracks approval status. Accountants can view ledgers and account details but do not approve entries.

**Module Map (High Level)**

- **Dashboard**: Landing page that summarizes key metrics, alerts, and role-specific information.
- **Accounts**: Chart of Accounts management and navigation to ledgers.
- **Transactions**: Ledger and journal entry access.
- **Reports**: Financial reporting (trial balance, income statement, balance sheet, retained earnings).
- **Help**: In-app help content organized by topic.
- **Profile**: User profile management, password changes, and security questions.

For login details and security rules, see `docs/User Manual/02_Login_and_Security/README.md`.
For user administration tasks, see `docs/User Manual/03_User_Administration/README.md`.
