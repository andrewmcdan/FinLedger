# Software Test Specification

Version 1.0  
2/19/2026

**FinLedger**

Team: Andrew McDaniel, Dani Lastra, Alex Husseini, Livia John, Scott Nguyen

SWE Application Domain W01  
Kennesaw State University

Version Control

| Version | Release | Responsible Party | Major Changes | Date |
| :---- | :---- | :---- | :---- | :---- |
| 0.1 | Initial Document Release for Comment | Andrew McDaniel | Initial draft | 2/20/2026 |
| 1.0 | Baseline Release | Andrew McDaniel (Team Lead) | Approved baseline STS for course submission | 03/03/2026 |

Table of Contents

[**1\. Introduction	4**](#introduction)

[1.1. Document Overview	4](#document-overview)

[1.2. Abbreviations and Glossary	4](#abbreviations-and-glossary)

[1.2.1. Abbreviations	4](#abbreviations)

[1.2.2. Glossary	4](#glossary)

[1.3. References	4](#references)

[1.4. Conventions	5](#conventions)

[**2\. Tests Preparation	5**](#tests-preparation)

[2.1. Backend Automated Test Preparation	5](#backend-automated-test-preparation)

[2.1.1. Hardware Preparation	5](#hardware-preparation)

[2.1.2. Software Preparation	6](#software-preparation)

[2.1.3. Other Test Preparation	6](#other-test-preparation)

[2.1.4. Safety, Security, and Privacy Precautions	6](#safety,-security,-and-privacy-precautions)

[2.1.5. Test Platform Configuration Verification	6](#test-platform-configuration-verification)

[2.2. UI E2E Test Preparation	6](#ui-e2e-test-preparation)

[2.2.1. Hardware Preparation	6](#hardware-preparation-1)

[2.2.2. Software Preparation	6](#software-preparation-1)

[2.2.3. Other Test Preparation	7](#other-test-preparation-1)

[2.2.4. Safety, Security, and Privacy Precautions	7](#safety,-security,-and-privacy-precautions-1)

[2.2.5. Test Platform Configuration Verification	7](#test-platform-configuration-verification-1)

[**3\. Test Descriptions (index)	7**](#test-descriptions-\(index\))

[3.1. Suite-Level Execution Definitions	7](#suite-level-execution-definitions)

[3.1.1. Backend Automated Regression Suite	7](#backend-automated-regression-suite)

[3.1.2. UI E2E Regression Suite	8](#ui-e2e-regression-suite)

[3.2. Automated Backend Tests	9](#automated-backend-tests)

[3.2.1. Server Smoke Test	9](#server-smoke-test)

[3.2.2. Authentication Middleware Tests	9](#authentication-middleware-tests)

[3.2.3. Users Controller Integration Tests	10](#users-controller-integration-tests)

[3.2.4. Accounts Controller Integration Tests	10](#accounts-controller-integration-tests)

[3.2.5. Transactions Controller Integration Tests	10](#transactions-controller-integration-tests)

[3.2.6. Authentication Route Integration Tests	11](#authentication-route-integration-tests)

[3.2.7. User Route Integration Tests	11](#user-route-integration-tests)

[3.2.8. Accounts and Audit Route Integration Tests	12](#accounts-and-audit-route-integration-tests)

[3.2.9. Transactions and Journal Submission Route Integration Tests	12](#transactions-and-journal-submission-route-integration-tests)

[3.2.10. Adjustments Route Integration Tests	13](#adjustments-route-integration-tests)

[3.2.11. Reports Route Integration Tests	13](#reports-route-integration-tests)

[3.2.12. Dashboard Route Integration Tests	13](#dashboard-route-integration-tests)

[3.2.13. Miscellaneous Route Integration Tests	14](#miscellaneous-route-integration-tests)

[3.2.14. Service and Utility Tests	14](#service-and-utility-tests)

[3.3. UI E2E Test Catalog	15](#ui-e2e-test-catalog)

1. # Introduction {#introduction}

   1. ## Document Overview {#document-overview}

   This Software Tests Specification (STS) document defines how tests for the FinLedger project are prepared, executed, and evaluated for the current implementation state.

   

   This STS covers:

- Software integration and verification tests executed with Node's built-in `node:test` runner across middleware, controllers, routes, services, and utilities.  
- End-to-end UI tests executed using Playwright against the current browser workflows.  
- Test evidence collection using console output, database state validation, attached UI screenshots, and Playwright HTML reports.

	The scope of this document reflects the implemented automated-test baseline through the current project state.

2. ## Abbreviations and Glossary {#abbreviations-and-glossary}

   1. ### Abbreviations {#abbreviations}

- **STS**: Software Test Specification  
- **SRS:** Software Requirements Specification  
- **E2E:** End-to-end. Refers to tests that are initiated through the UI and verified in the backend.  
- **API:** Application Programming Interface  
- **UI:** User Interface.

  2. ### Glossary {#glossary}

- **Test case:** A single verifiable check with defined inputs, procedure, and expected results.  
- **Test suite:** A grouped set of test cases executed together.  
- **Traceability:** Mapping between requirements and the tests that verify them.  
- **Baseline:** The specific code and environment state against which tests are executed.

  3. ## References {#references}

| \# | Document Category | Document Title |
| :---: | :---- | :---- |
| R1 | Planning Artifact | Project Proposal |
| R2 | Planning Artifact | Software Requirements Specification |
| R3 | Planning Artifact | Software Design Specification |
| R4 | Planning Artifact | Software Project Management Plan |
| R5 | Sprint Specifications | Sprint 1 Requirements |
| R6 | Sprint Specifications | Sprint 2 Requirements |
| R7 | Sprint Specifications | Sprint 3 Requirements |
| R8 | Sprint Specifications | Sprint 4 Requirements |
| R9 | Sprint Specifications | Sprint 5 Requirements |

  4. ## Conventions {#conventions}

Test ID format:

- "FL-SMOKE-xxx" for server smoke tests.  
- "FL-MW-AUTH-xxx" for authentication middleware tests.  
- "FL-BE-USR-xxx" for ‘users’ controller integration tests.  
- "FL-BE-ACC-xxx" for ‘accounts’ controller integration tests.  
- "FL-BE-TRN-xxx" for ‘transactions’ controller integration tests.  
- "FL-RT-AUTH-xxx" for authentication route integration tests.  
- "FL-RT-USR-xxx" for ‘users’ route integration tests.  
- "FL-RT-ACC-xxx" for accounts and audit route integration tests.  
- "FL-RT-TRN-xxx" for transactions and journal-submission route integration tests.  
- "FL-RT-ADJ-xxx" for adjustment route integration tests.  
- "FL-RT-RPT-xxx" for reports route integration tests.  
- "FL-RT-DB-xxx" for dashboard route integration tests.  
- "FL-RT-MISC-xxx" for message/image/document auxiliary route integration tests.  
- "FL-SVC-xxx" for service-layer tests.  
- "FL-UT-xxx" for utility tests.  
- "FL-UI-S1-xxx" for the current Playwright UI tests in `tests/ui/sprint1.ui.spec.js` (legacy file/prefix naming retained).

Verification method codes:

- I \= Inspection  
- A \= Analysis  
- D \= Demonstration  
- T \= Test  
    
  Unless otherwise specified, automated test cases in this document use method "T".

Pass criteria:

- Command exits with code "0".  
- All listed test cases complete without assertion failures.  
- For UI tests, Playwright report artifacts are generated, attached step screenshots are available, and retry traces/failure screenshots are available when triggered by the Playwright configuration.

2. # Tests Preparation {#tests-preparation}

   1. ## Backend Automated Test Preparation {#backend-automated-test-preparation}

      Impacted tests: \`FL-SMOKE-\*\`, \`FL-MW-\*\`, \`FL-BE-\*\`, \`FL-RT-\*\`, \`FL-SVC-\*\`, \`FL-UT-\*\`

      1. ### Hardware Preparation {#hardware-preparation}

- Linux, Windows, or MacOS workstation or CI runner with network access to PostgreSQL test instance (Docker).  
- Sufficient Disk space for database data, logs, and test artifacts.

  2. ### Software Preparation {#software-preparation}

1. Install dependencies:

   ‘npm ci’

   

2. Ensure ‘.env.test’ file is present and contains proper values.

   

3. Initialize the test DB:

   ‘npm run db-init:test’

   

4. Execute backend automated tests:

   ‘npm test’

   Note: the `pretest` script also invokes `npm run db-init:test`, so direct `npm test` execution reinitializes the test database automatically.

   3. ### Other Test Preparation {#other-test-preparation}

- Avoid reusing production DB credentials in ‘.env.test’.  
- Ensure no long-running process is already bound to the test server port if backend route tests are started manually outside the standard test runner.

  4. ### Safety, Security, and Privacy Precautions {#safety,-security,-and-privacy-precautions}

- Use only test credentials and test datasets.  
- Do not commit sensitive secrets from ‘.env’/’.env.test’ to source control.  
- Do not run destructive DB operations against non-test DB.

  5. ### Test Platform Configuration Verification  {#test-platform-configuration-verification}

1. Run and verify:  
2. ‘node \-v' (Node runtime is available)  
3. ‘npm \-v' (npm is available)  
4. ‘npm run db-init:test' completes without DB connection or migration errors  
5. ‘npm test' reports all backend tests passing

   2. ## UI E2E Test Preparation {#ui-e2e-test-preparation}

      Impacted tests: \`FL-UI-S1-\*\`

      1. ### Hardware Preparation {#hardware-preparation-1}

- Same hardware requirements as backend tests.  
- Headless browser support.

  2. ### Software Preparation {#software-preparation-1}

1. Install Dependencies

   ‘npm ci’

   

2. Install browser binaries (once per environment)

   ‘npx playwright install chromium’

   

3. Ensure Playwright config is present

   ‘playwright.config.js’

   

4. Execute UI tests

   ‘npm run test:ui’

   Note: Playwright starts the application by using the `webServer.command` defined in `playwright.config.js`, which runs `npm run db-init:test` and then launches `src/server.js` with `.env.test`.

   3. ### Other Test Preparation {#other-test-preparation-1}

- Ensure no conflicting process is using the configured port (default `TEST_PORT` 3050 unless overridden).  
- Ensure the `.env.test` values used by the Playwright web server point to a disposable test database.

  4. ### Safety, Security, and Privacy Precautions {#safety,-security,-and-privacy-precautions-1}

- Run UI tests only against local or non-production environments.  
- Use seeded admin test account only.  
- Treat generated test artifacts as internal verification records.

  5. ### Test Platform Configuration Verification  {#test-platform-configuration-verification-1}

		Run and verify:

1. ‘npm run test:ui’ completes with exit code ‘0’  
2. ‘npx playwright show-report’ opens an HTML report with test results and attached screenshots.  
3. ‘test-results/’ and ‘playwright-report/’ folders are generated after the test run and contain the expected artifacts. 

3. # Test Descriptions (index) {#test-descriptions-(index)}

   1. ## Suite-Level Execution Definitions {#suite-level-execution-definitions}

      1. ### Backend Automated Regression Suite {#backend-automated-regression-suite}

| Test ID | FL-SUITE-BE-001 |
| :---- | :---- |
| Test Description | Executes all Node backend tests (\`node:test\`) |
| Entry Requirement | Current auth, user-management, accounts, transactions, adjustments, reports, dashboard, service, and utility implementations are present |
| Initial Conditions | ‘.env.test’ file configured; PostgreSQL test DB reachable |
| Test Inputs | Source files in tests/server.test.js, tests/middleware/\*.test.js, tests/controllers/\*.test.js, tests/routes/\*.test.js, tests/services/\*.test.js, tests/utils/\*.test.js |
| Data Collection | Capture command output from npm test |
| Test Outputs | Pass/fail summary and per-test status lines |
| Assumptions and Constraints | Test DB can be truncated/reinitialized |
| Expected Results | Exit code 0; all backend tests pass |

Test Procedure:

| Step Num | Operator Actions | Expected Result |
| :---- | :---- | :---- |
| 1 | Run ‘npm run db-init:test’ | Test DB schema and data properly initialized |
| 2 | Run ‘npm test’ | Test runner executes server, middleware, controller, route, service, and utility tests successfully.  |
| 3 | Review Summary | All backend tests pass. |

2. ### UI E2E Regression Suite {#ui-e2e-regression-suite}

| Test ID | FL-SUITE-UI-001 |
| :---- | :---- |
| Test Description | Execute current Playwright UI regression tests |
| Entry Requirement | Implemented login, registration validation, profile password-change, and transactions-page browser workflows |
| Initial Conditions | Playwright installed, Chromium installed, .env.test configured |
| Test Inputs | tests/ui/sprint1.ui.spec.js |
| Data Collection | Attach step screenshots to Playwright report, collect traces on retry, and capture failure screenshots per config	 |
| Test Outputs | Console pass/fail \+ playwright-report/ \+ test-results/	 |
| Assumptions and Constraints | Web server starts from webServer.command in config; the Playwright file name remains sprint1.ui.spec.js although it now covers additional smoke scenarios	 |
| Expected Results | Exit code 0; all UI tests pass; screenshots available in report	 |

Test Procedure:

| Step Num | Operator Actions | Expected Result |
| :---- | :---- | :---- |
| 1 | Run ‘npm run test:ui’ | Playwright starts server and runs UI tests |
| 2 | Run ‘npx playwright show-report’ | HTML report opens successfully |
| 3 | Open each test result | Step-level screenshots are attached and viewable |

2. ## Automated Backend Tests {#automated-backend-tests}

   1. ### Server Smoke Test {#server-smoke-test}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-SMOKE-001 | server responds to base GET request and confirms the application starts under the test harness | tests/server.test.js |

      2. ### Authentication Middleware Tests {#authentication-middleware-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-MW-AUTH-001 | public-path bypass, protected-route header validation, and invalid-session handling | tests/middleware/auth.test.js |
| FL-MW-AUTH-002 | authenticated requests refresh session-expiry headers correctly | tests/middleware/auth.test.js |
| FL-MW-AUTH-003 | temporary-password restrictions and protected page access behavior are enforced | tests/middleware/auth.test.js |

      3. ### Users Controller Integration Tests {#users-controller-integration-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-BE-USR-001 | session lookup helpers, admin checks, and user identity retrieval behave correctly for valid, missing, and expired sessions | tests/controllers/users.test.js |
| FL-BE-USR-002 | approval, rejection, suspension, reinstatement, and logged-in-user listing update account state correctly | tests/controllers/users.test.js |
| FL-BE-USR-003 | password change, temp-password clearing, password history, security-question update, and answer verification rules are enforced | tests/controllers/users.test.js |
| FL-BE-USR-004 | createUser handles pending-user creation, duplicate username suffixing, invalid-role rejection, and email-trigger behavior | tests/controllers/users.test.js |
| FL-BE-USR-005 | scheduled lifecycle helpers handle inactive logout, expired-suspension restoration, password-expiry warnings, and expired-password suspension | tests/controllers/users.test.js |
| FL-BE-USR-006 | profile update, direct password-set, deleteUserById, and username lookup utilities behave correctly | tests/controllers/users.test.js |

      4. ### Accounts Controller Integration Tests {#accounts-controller-integration-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-BE-ACC-001 | createAccount accepts valid same-category/subcategory combinations and rejects invalid statement/category selections | tests/controllers/accounts.test.js |
| FL-BE-ACC-002 | addCategory and addSubcategory preserve ordering when duplicate order indexes are inserted | tests/controllers/accounts.test.js |
| FL-BE-ACC-003 | account create/update operations write audit history and no-op updates avoid unnecessary audit rows | tests/controllers/accounts.test.js |

      5. ### Transactions Controller Integration Tests {#transactions-controller-integration-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-BE-TRN-001 | approveJournalEntry posts ledger rows, rolls balances, and remains idempotent for already-processed journals | tests/controllers/transactions.test.js |
| FL-BE-TRN-002 | rejectJournalEntry requires a reason, updates status/comment, and avoids ledger posting on rejection | tests/controllers/transactions.test.js |
| FL-BE-TRN-003 | journal queue/detail, ledger listing, and journal-document download metadata queries return the expected review data | tests/controllers/transactions.test.js |

      6. ### Authentication Route Integration Tests {#authentication-route-integration-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-RT-AUTH-001 | GET /api/auth/status returns correct logged-out and logged-in session states | tests/routes/auth.test.js |
| FL-RT-AUTH-002 | POST /api/auth/logout validates headers and closes active sessions | tests/routes/auth.test.js |
| FL-RT-AUTH-003 | POST /api/auth/login rejects unknown, inactive, suspended, and repeated-failure users while enforcing lockout logic | tests/routes/auth.test.js |
| FL-RT-AUTH-004 | POST /api/auth/login authenticates valid users, restores expired suspensions, and flags temporary-password state | tests/routes/auth.test.js |

      7. ### User Route Integration Tests {#user-route-integration-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-RT-USR-001 | public security-question and registration endpoints return expected data and create pending registrations | tests/routes/users.test.js |
| FL-RT-USR-002 | administrator-only user retrieval, user listing, create-user, and update-user-field endpoints enforce RBAC and field validation | tests/routes/users.test.js |
| FL-RT-USR-003 | admin email, account-contact email, approval, rejection, suspension, reinstatement, deletion, and password-reset routes perform the expected workflow side effects | tests/routes/users.test.js |
| FL-RT-USR-004 | password change and security-question update routes require current-password validation | tests/routes/users.test.js |
| FL-RT-USR-005 | password-reset token issuance, security-question validation, and three-attempt lockout behavior are enforced | tests/routes/users.test.js |

      8. ### Accounts and Audit Route Integration Tests {#accounts-and-audit-route-integration-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-RT-ACC-001 | administrators can create accounts while manager/accountant roles are limited to the intended read-only or non-admin surfaces | tests/routes/accounts.test.js |
| FL-RT-ACC-002 | manager/accountant restrictions on create, update, and deactivate operations are enforced | tests/routes/accounts.test.js |
| FL-RT-ACC-003 | role-based page rendering exposes the intended account-email and audit features by role | tests/routes/accounts.test.js |
| FL-RT-ACC-004 | account audit-history retrieval and filtered audit-page reporting behave correctly for authorized roles | tests/routes/accounts.test.js |

      9. ### Transactions and Journal Submission Route Integration Tests {#transactions-and-journal-submission-route-integration-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-RT-TRN-001 | reference-code availability endpoint returns correct available/unavailable and validation-error responses | tests/routes/transactions_new_entry.test.js |
| FL-RT-TRN-002 | new journal-entry submission enforces payload presence, JSON validity, required documents, balance validation, duplicate-account rejection, and duplicate reference-code rejection | tests/routes/transactions_new_entry.test.js |
| FL-RT-TRN-003 | valid journal-entry submission persists balanced lines, stores documents, and creates the expected journal record | tests/routes/transactions_new_entry.test.js |
| FL-RT-TRN-004 | manager users can list queue entries, fetch detail, approve, reject with reason, and review adjusting-entry filters | tests/routes/transactions.test.js |
| FL-RT-TRN-005 | accountant and administrator role restrictions are enforced across queue, approval, and journal-review surfaces | tests/routes/transactions.test.js |
| FL-RT-TRN-006 | journal submission notifications, debit-before-credit ordering, specific balance-error propagation, ledger filtering/running-balance behavior, and journal-document download rules operate correctly | tests/routes/transactions.test.js |

      10. ### Adjustments Route Integration Tests {#adjustments-route-integration-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-RT-ADJ-001 | accountant users can create and list pending adjustment entries | tests/routes/adjustments.test.js |
| FL-RT-ADJ-002 | manager approval posts ledger rows and non-manager approval attempts are rejected | tests/routes/adjustments.test.js |

      11. ### Reports Route Integration Tests {#reports-route-integration-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-RT-RPT-001 | manager users can generate trial balance, income statement, balance sheet, and retained earnings reports | tests/routes/reports.test.js |
| FL-RT-RPT-002 | accountant users are denied access to report-generation routes | tests/routes/reports.test.js |
| FL-RT-RPT-003 | report email endpoint generates and sends CSV output for authorized users and rejects unauthorized roles | tests/routes/reports_email.test.js |

      12. ### Dashboard Route Integration Tests {#dashboard-route-integration-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-RT-DB-001 | manager dashboard rendering includes financial ratios and workflow-alert content | tests/routes/dashboard.test.js |
| FL-RT-DB-002 | administrator dashboard preserves user-management content while sharing dashboard summary and ratio components | tests/routes/dashboard.test.js |

      13. ### Miscellaneous Route Integration Tests {#miscellaneous-route-integration-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-RT-MISC-001 | messages routes validate input and return catalog-backed message lookups | tests/routes/misc_routes.test.js |
| FL-RT-MISC-002 | image route returns default and stored icons with the expected fallback behavior | tests/routes/misc_routes.test.js |
| FL-RT-MISC-003 | user-docs placeholder routes return the current placeholder responses | tests/routes/misc_routes.test.js |

      14. ### Service and Utility Tests {#service-and-utility-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-SVC-001 | SMTP transport configuration, attachment handling, and templated-email dispatch operate correctly | tests/services/email.test.js |
| FL-SVC-002 | EJS email rendering composes the base layout correctly with and without optional button markup | tests/services/email_renderer.test.js |
| FL-SVC-003 | message catalog lookup, replacement, de-duplication, caching, and fallback behavior operate correctly | tests/services/message_catalog.test.js |
| FL-UT-001 | logger writes valid DB rows and handles nonexistent user IDs without violating foreign-key constraints | tests/utils/logger.test.js |
| FL-UT-002 | sanitizeInput and generateRandomToken enforce escaping, normalization, and token-shape expectations | tests/utils/sanitize.test.js |
| FL-UT-003 | cleanupUserData preserves referenced files and removes orphaned user-document files | tests/utils/utilities.test.js |

   3. ## UI E2E Test Catalog {#ui-e2e-test-catalog}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-UI-S1-001 | admin can sign in from the login UI | tests/ui/sprint1.ui.spec.js |
| FL-UI-S1-002 | request-access form shows and validates the starts-with-letter password rule | tests/ui/sprint1.ui.spec.js |
| FL-UI-S1-003 | profile change-password UI shows requirements and mismatch feedback | tests/ui/sprint1.ui.spec.js |
| FL-UI-S1-004 | transactions page smoke verifies that a manager can open the queue modal and see live ledger rows | tests/ui/sprint1.ui.spec.js |
