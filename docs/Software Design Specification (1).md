

#  Software Design Specifications 

Version 1.0  
2/19/2026

**FinLedger**

Team: Andrew McDaniel, Dani Lastra, Alex Husseini, Livia John, Scott Nguyen

SWE Application Domain W01

Kennesaw State University

Version Control

| Version | Release | Responsible Party | Major Changes | Date |
| :---- | :---- | :---- | :---- | :---- |
| 0.1 | Initial Document Release for Comment | Andrew McDaniel | Initial SDS draft aligned to SWE4713 requirements \+ sprint schedule \+ current tooling | 2/11/2026 |
| 1.0 | Baseline Release | Andrew McDaniel (Team Lead) | Approved baseline SDS for course submission | 03/03/2026 |

Table of Contents

**[1\. Introduction	4](#introduction)**

[1.1. Purpose	4](#purpose)

[1.2. Scope	4](#scope)

[1.3. Intended Audience	4](#intended-audience)

[**2\. System Overview	4**](#system-overview)

[**3\. Design Considerations	5**](#design-considerations)

[3.1. Assumptions and Dependencies	5](#assumptions-and-dependencies)

[3.2. General constraints	5](#general-constraints)

[3.3. Goals and Guidelines	5](#goals-and-guidelines)

[3.4. Development Methods	5](#development-methods)

[**4\. Development Methods	6**](#development-methods-1)

[**5\. Architectural Strategies	6**](#architectural-strategies)

[**6\. System Architecture	6**](#system-architecture)

[6.1. Authentication Subsystems	6](#authentication-subsystems)

[6.2. User Management Subsystems	7](#user-management-subsystems)

[6.3. Chart of Accounts Subsystem	7](#chart-of-accounts-subsystem)

[6.4. Audit Subsystem	7](#audit-subsystem)

[**7\. Subsystem Architecture	8**](#subsystem-architecture)

[7.1. Request Flow (Protected API)	8](#request-flow-\(protected-api\))

[7.2. Frontend Elements	8](#frontend-elements)

[7.3. Backend Elements	8](#backend-elements)

[7.4. Data Model Elements	8](#data-model-elements)

[**8\. Policies and Tactics	9**](#policies-and-tactics)

[**9\. Detailed System Design	10**](#detailed-system-design)

[9.1. Authentication Module	10](#authentication-module)

[9.2. Accounts Module	11](#accounts-module)

[**10\. Detailed Subsystem Design	13**](#detailed-subsystem-design)

[10.1. User Management and Recovery Subsystem	13](#user-management-and-recovery-subsystem)

[10.2. Email Notification Subsystem	13](#email-notification-subsystem)

[10.3. Logging and Audit Subsystem	13](#logging-and-audit-subsystem)

[10.4. Database and Migration Subsystem	14](#database-and-migration-subsystem)

[10.5. Frontend Routing and Page Module Subsystem	14](#frontend-routing-and-page-module-subsystem)

[10.6. File/Media Subsystem	14](#file/media-subsystem)

[10.7. Accounting Workflow, Reporting, and Dashboard Subsystem	14](#accounting-workflow-reporting-and-dashboard-subsystem)

[**11\. Glossary	14**](#glossary)

[**12\. Bibliography	15**](#bibliography)

1. # Introduction {#introduction}

   1. ## Purpose {#purpose}

   In this Software Design Specification document the architecture and detailed design of FinLedger is described, a web based accounting system developed for SWE 4713\. 

   This turns all of the Software Requirements Specification (SRS) into the technical design decisions that serve as a reference for not just the developers but the reviewers as well . 

   2. ## Scope {#scope}

   Authentication, role based access, chart of accounts management, journal entry workflows, ledger posting, reporting, and audit logging is all supported by FinLedger. The system as a whole is used to demonstrate standard accounting workflows in a web based environment. 

   3. ## Intended Audience {#intended-audience}

   This document is intended for the instructor of the course as well as the team members and any future maintainers of the FinLedger codebase.

2. # System Overview {#system-overview}

   FinLedger is an accounting system that is used to support role based workflows used by administrators, managers, and accountants, that is web based. The core functionalities include:   
- Secure authentication  
- User management   
- A chart of all the accounts maintenance   
- Journal entry processing   
- Ledger posting  
- Reporting  
- Audit logging   
  There is a client server model that the application will follow. All of the backend is implemented using Node.js as well as Express.js, while also using PostgreSQL to be used as a persistent data storage. All of the frontend is built using HTML, CSS, and JavaScript. The authentication is completely handled through JSON Web Tokens.  
    
  All of the major functional modules include authentication, user management, chart of accounts, journalizing, ledger processing, reporting, and audit logging. 


3. # Design Considerations {#design-considerations}

   1. ## Assumptions and Dependencies {#assumptions-and-dependencies}

      The system assumes that the users have access to modern web browsers as well as a stable internet connection. For development, PostgreSQL must be available, whether it"s locally or through Docker. There is also a requirement of email services for notifications such as password expiration. SMTP credentials for a cloud email provider must be provided. Users are assumed to have the basic accounting knowledge as well.   
        
      Running FinLedger depends on an up-to-date Node.js runtime, as well as Docker for repeatable local deployment. Environment variables must be set that describe various credentials and settings. This should be done using a “.env” file.

   2. ## General constraints {#general-constraints}

      There are several constraints that have influenced the system design. The application must be web based, it must enforce password security policies, maintain the audit trails, and prevent the deletion of any financial records. Additionally the project as a whole must be completed within the timeframe of an academic semester. 

   3. ## Goals and Guidelines {#goals-and-guidelines}

      The primary goals of the whole project and design are usability, security, modularity, and traceability. The system emphasizes multiple different tasks such as a consistent interface, separate the responsibilities by role, and lastly be able to trace the financial data from reports all the way back to the journal entries. 

   4. ## Development Methods {#development-methods}

      The team used a sprint model that is managed through Trello. Everything was developed following an iterative cycle of planning, implementation, testing, and review, with a lot of features that are delivered incrementally across five sprints. 

4. # Development Methods {#development-methods-1}

   A layered architecture is used with explicit module responsibilities:  
* Presentation Layer: browser pages and JS modules for UI  
* API Layer: Express server route handlers  
* Business Logic Layer: controller modules  
* Infrastructure and services: Database adapter, email services, logging, and utilities


  The backend services are exposed using a RESTful API. To manage authentication, JWT tokens are used while role based authorization controls all access to any features. 


  PostgreSQL was chosen for its relational structure and transaction reliability. Docker is supported for deployment consistency. Controllers also are used to encapsulate business logic, while at the same time allowing routes to remain not just maintainable but also lightweight. 

5. # Architectural Strategies {#architectural-strategies}

   At a high level, FinLedger consists of four layers:  
- Presentation Layer (Web UI)  
- Application Layer (Express routes)  
- Business Logic Layer (controllers)  
- Data Layer (PostgreSQL database)

  The entire system is decomposed into multiple subsystems that are responsible for authentication, account management, auditing, and reporting. Each one of the subsystems communicates through the well defined interfaces and shares access to the database.


  This decomposition was chosen to make the maintainability easier to function, while also allowing parallel development of features. 

6. # System Architecture {#system-architecture}

   1. ## Authentication Subsystems {#authentication-subsystems}

		Primary elements:

* "src/routes/auth.js"  
* "src/middleware/auth.js"  
* "src/controllers/users.js" ("getUserLoggedInStatus", role checks, password operations)  
* "users" and "logged\_in\_users" tables

  Responsibilities:

* Validate credentials  
* Issue JWT token on successful login  
* Track active sessions and session expiry  
* Enforce temporary-password change restrictions


  2. ## User Management Subsystems {#user-management-subsystems}

		Primary elements:

* "src/routes/users.js"  
* "src/controllers/users.js"  
* "src/services/email.js"  
* "users", "password\_history", "password\_expiry\_email\_tracking" tables  
* "user-icons/" filesystem storage

  Responsibilities:

* User registration, approval/rejection, suspension/reinstatement  
* User profile and security question maintenance  
* Password reset and admin-initiated password reset  
* Notification email delivery

  3. ## Chart of Accounts Subsystem {#chart-of-accounts-subsystem}

     Primary elements:  
* "src/routes/accounts.js"  
* "src/controllers/accounts.js"  
* "accounts", "account\_categories", "account\_subcategories" tables  
* "account\_audits", "account\_metadata\_edits" tables


  Responsibilities:

* Account creation, listing/filtering/sorting, and field updates  
* Activation/deactivation with balance-based guardrail  
* Category and subcategory management  
* Automatic audit metadata capture

  4. ## Audit Subsystem {#audit-subsystem}

     Primary elements:  
* DB trigger "trg\_accounts\_write\_audit\_and\_metadata" (migration "007\_update\_accounts\_audit\_trigger.sql")  
* "src/utils/logger.js"  
* "app\_logs" and "audit\_logs" tables


  Responsibilities:

* Record account balance and metadata mutation history  
* Record runtime diagnostic and audit events  
* Support filtered query/readback of logs

7. # Subsystem Architecture {#subsystem-architecture}

   1. ## Request Flow (Protected API) {#request-flow-(protected-api)}

1. Browser calls API with "Authorization: Bearer \<token\>" and "X-User-Id".  
2. "authMiddleware" validates token/session and user context.  
3. Route handler performs authorization checks (for example, admin-only).  
4. Route delegates business operation to controller.  
5. Controller executes SQL via "src/db/db.js".  
6. Response is returned as JSON.

   2. ## Frontend Elements {#frontend-elements}

* "web/index.html" hosts the app shell.  
* "web/js/app.js" manages hash routes and dynamic page/module loading.  
* Page modules under "web/js/pages/" handle per-screen interactions.  
* Utility functions under "web/js/utils/" provide authenticated fetch, a DOM modification helper, and formatting support.

  3. ## Backend Elements {#backend-elements}

* "src/server.js" wires middleware, route modules, static assets, and scheduled jobs.  
* Routes grouped by domain ("auth", "users", "accounts", "images", "user\_docs").  
* Controllers implement domain logic and SQL orchestration.  
* Utilities centralize logging, cleanup, and shared helpers.

  4. ## Data Model Elements {#data-model-elements}

     Schema is built from ordered SQL files ("docker/postgres/00x\_\*.sql") and migrations ("docker/postgres/migrations/\*.sql").

     

     Current schema domains:

* Users/Auth  
* Accounts/Categories/Audits  
* Journals/Ledger (schema-ready)  
* Adjustments and Statements (schema-ready)  
* Logs and Documents

8. # Policies and Tactics {#policies-and-tactics}

   1. Authentication and Session Policy  
* JWT generated at login ("/api/auth/login").  
* Validity requires a matching active row in "logged\_in\_users".  
* Session TTL is extended on status checks through all restriction API endpoints.  
* Middleware denies access for missing or invalid headers or an expired session.  
  2. Password and Account Security Policy  
* Password hashing via PostgreSQL "crypt(..., gen\_salt("bf"))".  
* Password complexity enforced in controller logic.  
* Password history checked to prevent reuse.  
* Failed login attempts are tracked and can force suspension after 3 unsuccessful login attempts.   
* Temporary passwords require immediate forced change flow.  
* Password expiration warnings and auto-suspension are executed by scheduled jobs.  
  3. Authorization Policy  
* Admin-only routes enforce role checks using "isAdmin".  
* Manager/admin checks are available for account listing context ("isManager", "isAdmin").  
* Unauthorized operations return HTTP 401/403 with structured JSON errors.  
  4. Data Integrity Policy  
* Unique constraints on usernames, emails, account names/numbers.  
* Check constraints on role/status/account field enumerations.  
* Account deactivation is not allowed when account balance is non-zero.  
* Account change auditing performed at DB trigger level.  
  5. Logging and Operations Policy  
* Logs can be emitted to console, file, and DB based on env configuration.  
* Retention cleanup for app/audit logs is scheduled daily.  
* Unreferenced files under "user-icons/" and "user-docs/" are periodically removed.

9. # Detailed System Design {#detailed-system-design}

   1. ## Authentication Module {#authentication-module}

      1. ### Classification: 

         Core backend module spanning API route handlers and global middleware.

      2. ### Definition: 

         Implements login, logout, session status, and request-time authentication enforcement.

      3. ### Responsibilities: 

* Validate credentials and account state  
* Issue signed JWT  
* Track login/logout state in DB  
* Enforce temporary-password restrictions  
* Attach authenticated user context to request

  4. ### Constraints: 

* Requires valid "JWT\_SECRET" environment variable or “.env” file variable  
* Requires "users" and "logged\_in\_users" tables.  
* Protected requests must include both token and user-id header.

  5. ### Composition: 

* "src/routes/auth.js"  
* "src/middleware/auth.js"  
* "src/controllers/users.js" auth-related functions  
* "src/db/db.js" for queries/transactions 

  6. ### Uses/ Interactions: 

* Reads/writes "users" and "logged\_in\_users"  
* Uses logger utilities for traceability  
* Exposes auth state to frontend via HTTP headers and status endpoint

  7. ### Resources:

* Postgres connection pool  
* JWT signing library ("jsonwebtoken")  
* Scheduled jobs in "src/server.js" for session and account lifecycle upkeep

  8. ### Processing:

Login sequence:  
1\. Validate username existence and active status.  
2\. Verify password via "crypt" comparison.  
3\. Apply failed-attempt and suspension logic.  
4\. Generate JWT and store active session row.  
5\. Reset failed-attempt counters.

Request authentication sequence:  
1\. Allow public routes bypass.  
2\. Validate required headers.  
3\. Verify active session and extend expiry.  
4\. Enforce temp-password-only allowed-path set.

9. ### Interface / Exports:  

   API endpoints:  
* "GET /api/auth/status"  
* "POST /api/auth/login"  
* "POST /api/auth/logout"


  Middleware export:

* "module.exports \= authMiddleware"

  2. ## Accounts Module {#accounts-module}

     1. ### Classification: 

Core backend business module for chart-of-accounts management.

2. ### Definition: 

   Implements account creation, listing, filtering, updates, status transitions, and category/subcategory management.

   3. ### Responsibilities: 

* Generate deterministic account numbers  
* Validate statement/account field normalization  
* Support list/count APIs with filter/sort controls  
* Enforce active/inactive status policy  
* Manage category/subcategory lifecycle

  4. ### Constraints: 

* Account create/update mutating operations are admin-only at route level.  
* Statement type must resolve to "IS", "BS", or "RE".  
* Deactivation requires zero balance.  
* Field updates restricted to allow-list.

  5. ### Composition: 

* "src/routes/accounts.js"  
* "src/controllers/accounts.js"  
* "accounts", "account\_categories", "account\_subcategories" tables  
* Audit trigger and tables for automatic change capture

  6. ### Uses/ Interactions:

* Uses user-role checks from "src/controllers/users.js"  
* Uses DB user-scoped setting ("set\_config("app.user\_id", ...)") for trigger attribution  
* Interacts with frontend accounts page module ("web/js/pages/accounts\_list.js")

  7. ### Resources:

* Database transaction support for account number generation and category operations  
* Logger \+ input sanitation utilities

  8. ### Processing:

     Account creation sequence:  
     1\. Normalize/validate statement type.  
     2\. Resolve category/subcategory IDs.  
     3\. Build account number from category prefix \+ subcategory order \+ account order \+ suffix.  
     4\. Insert account row.  
       
     Account update sequence:  
     1\. Validate allowed field.  
     2\. Normalize value by field type.  
     3\. Execute update with user-scoped DB setting.  
     4\. Trigger writes account metadata and/or balance audits.

     9. ### Interface / Exports:

        API endpoints:  
* "GET /api/accounts/account\_count"  
* "GET /api/accounts/list/:offset/:limit"  
* "POST /api/accounts/create"  
* "POST /api/accounts/update-account-field"  
* "GET /api/accounts/account-categories"  
* "POST /api/accounts/add-category"  
* "DELETE /api/accounts/category/:categoryId"  
* "DELETE /api/accounts/subcategory/:subcategoryId"  
* "POST /api/accounts/set-account-status"


  Controller exports include list/create/update/status/category operations.

10. # Detailed Subsystem Design {#detailed-subsystem-design}

    1. ## User Management and Recovery Subsystem {#user-management-and-recovery-subsystem}

       Implements:  
* Registration ("/api/users/register\_new\_user")  
* Approval/rejection/suspension/reinstatement flows  
* Profile update and security question update  
* Password reset via email token \+ security question verification  
* Admin-driven temporary password reset

		  
		Primary Database Tables:

* "users"  
* "password\_history"  
* "password\_expiry\_email\_tracking"  
* "logged\_in\_users"

		Primary Components:

* "src/routes/users.js"  
* "src/controllers/users.js"  
* "web/pages/dashboard.html" and "web/js/pages/dashboard.js" for administrator user-management screens  
* "web/pages/profile.html" and "web/js/pages/profile.js" for self-service profile maintenance  
* "web/pages/public/forgot-password\_init.html" and "web/pages/public/forgot-password\_submit.html"

		Processing Notes:

* New registrations enter a pending state until an administrator approves or rejects the request.  
* Administrator workflows support create, delete, deactivate, reinstate, suspend, reset-password, and direct-email operations from the dashboard surface.  
* Password recovery combines reset-token issuance with stored security-question verification before a new password is accepted.  
* Scheduled jobs in "src/server.js" enforce password-expiration warnings, automatic suspension, stale failed-login cleanup, and inactive-session logout.

  2. ## Email Notification Subsystem {#email-notification-subsystem}

     "src/services/email.js" uses Nodemailer (npm package) with SMTP host/port/auth environment configuration. "src/services/email\_renderer.js" and the EJS templates under "src/services/email\_templates/" provide consistent templated messages. Email notifications are used for:

* Registration acknowledgement  
* Account approval notification  
* Password reset links  
* Password expiration warning  
* Suspension due to expired password  
* Admin-generated password reset  
* Journal submission notification to managers/administrators  
* Journal approval/rejection notification to the submitting user  
* Direct administrator-to-user messages  
* Report delivery with CSV attachment

  3. ## Logging and Audit Subsystem {#logging-and-audit-subsystem}

     "src/utils/logger.js" supports:

* Configurable level thresholds by destination  
* App log writes to DB/file/console  
* Audit log writes to "audit\_logs" table  
* Query helpers for log retrieval


  "src/routes/audit\_logs.js" and "src/controllers/audit\_logs.js" expose filtered audit-log queries for the audit page.


  Database-level event logging complements application-level logs. Trigger coverage extends beyond accounts to users, documents, journals, journal lines, ledger entries, trial-balance runs, adjustment metadata/lines, and statement runs.

  4. ## Database and Migration Subsystem {#database-and-migration-subsystem}

* Base schema SQL files are executed in deterministic order.  
* Schema migrations are tracked in "schema\_migrations".  
* "scripts/init-db.js" can template admin seed values and apply unapplied migrations.  
* "scripts/reset-db.js" drops user tables and clears user file storage directories.  
* Base schema currently covers users/auth, documents, accounts, journals, ledger, trial balance, adjustments, and statement-run persistence.

  5. ## Frontend Routing and Page Module Subsystem {#frontend-routing-and-page-module-subsystem}

* Route map defined in "web/js/app.js".  
* Hash-based routes load HTML partials and optional page JS modules.  
* Current protected route modules include dashboard, accounts list, transactions, reports, audit, profile, and forced-password-change flows.  
* Rendered backend page endpoints in "src/routes/rendered\_routes.js" provide server-side role-aware markup for dashboard, accounts, transactions, audit, profile, and forgot-password submission.  
* Authenticated API calls use "web/js/utils/fetch\_with\_auth.js".  
* Session-expiry headers are interpreted client-side for warning/logout behavior.

  6. ## File/Media Subsystem {#file/media-subsystem}

* User icons stored in "user-icons/" and served by "src/routes/images.js".  
* Journal supporting documents stored in "user-docs/" with metadata recorded in "documents", "journal\_entry\_documents", and "journal\_entry\_line\_documents".  
* Upload and download for journal documents is handled through "src/routes/transactions.js".  
* "src/routes/user\_docs.js" exists as a placeholder for future standalone document-management endpoints and is not the primary document path used by the current accounting workflow.

  7. ## Accounting Workflow, Reporting, and Dashboard Subsystem {#accounting-workflow-reporting-and-dashboard-subsystem}

     Implements:
* Journal entry creation with balanced debit/credit lines, optional reference codes, and required supporting documents  
* Approval/rejection queue for general and adjusting entries  
* Ledger posting, running-balance views, and T-account presentation  
* Adjusting-entry creation with reason and period-end metadata  
* Trial balance, income statement, balance sheet, and retained earnings generation  
* Dashboard summary cards, workflow alerts, and financial-ratio analytics

     Primary Components:
* "src/routes/transactions.js" and "src/controllers/transactions.js"  
* "src/routes/adjustments.js" and "src/controllers/adjustments.js"  
* "src/routes/reports.js" and "src/controllers/reports.js"  
* "src/controllers/dashboard.js"  
* "web/pages/transactions.html" and "web/js/pages/transactions.js"  
* "web/pages/reports.html" and "web/js/pages/reports.js"  
* "web/pages/dashboard.html" and "web/js/pages/dashboard.js"

     Primary Database Tables:
* "journal\_entries"  
* "journal\_entry\_lines"  
* "ledger\_entries"  
* "journal\_entry\_documents" and "journal\_entry\_line\_documents"  
* "adjustment\_metadata" and "adjustment\_lines"  
* "trial\_balance\_runs", "trial\_balance\_lines", and "statement\_runs"

     Processing Notes:
* New journal and adjustment entries are created in "pending" status; managers and accountants can prepare entries, while approval is restricted to managers.  
* Administrator users can view ledger and reporting data, but journal preparation and approval actions are intentionally blocked in the transactions routes.  
* Manager approval posts journal lines into "ledger\_entries" and updates account balances inside a DB transaction; posting is written to be idempotent per journal line.  
* Rejected entries remain stored with manager comments for correction and audit visibility.  
* Report generation reads posted ledger data, persists run headers for traceability, and supports CSV export, print, and email delivery.  
* Dashboard analytics derive liquidity, leverage, and profitability indicators from active account balances and posted ledger activity.

11. # Glossary {#glossary}

* JWT \- JSON Web Token: A unique token represented in Javascript Object Notation used for stateless session tracking.   
* Administrator: User role with highest system privileges, including user and account administration.  
* Manager: User role focused on review/approval workflows and reporting functions.  
* Accountant: User role focused on transactional preparation and operational accounting tasks.  
* Session Row: Record in "logged\_in\_users" used to enforce active login state and expiry.  
* Chart of Accounts (CoA): Structured list of accounts with category/subcategory and reporting classifications.  
* Audit Trail: Historical record of account and system events for traceability.  
* Migration: Incremental SQL script applied after base schema creation to evolve structure safely.

12. # Bibliography {#bibliography}

1. FinLedger SRS: "Software Requirements Specification.pdf"    
2. FinLedger SPMP: "Software Project Management Plan.pdf"    
3. Server entrypoint: "src/server.js"    
4. Backend routes/controllers: "src/routes/\*.js", "src/controllers/\*.js"    
5. Middleware and infrastructure: "src/middleware/auth.js", "src/db/db.js", "src/utils/\*.js", "src/services/email.js"    
6. Database schema and migrations: "docker/postgres/\*.sql", "docker/postgres/migrations/\*.sql"  
