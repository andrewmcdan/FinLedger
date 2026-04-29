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
| 1.0 | Baseline Release | Andrew McDaniel (Team Lead) | Approved baseline SPMP for course submission | 03/03/2026 |

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

[3.1.1. Backend Integration and Verification Suite	7](#backend-integration-and-verification-suite)

[3.1.2. UI E2E Sprint 1 Suite	8](#ui-e2e-sprint-1-suite)

[3.2. Automated Backend Tests	9](#automated-backend-tests)

[3.2.1. Server Smoke Test	9](#server-smoke-test)

[3.2.2. Users Controller Integration Tests	9](#users-controller-integration-tests)

[3.2.3. Accounts Controller Integration Tests	11](#accounts-controller-integration-tests)

[3.2.4. User Route Integration Tests	12](#user-route-integration-tests)

[3.3. Sprint 1 UI E2E Test Catalog	12](#sprint-1-ui-e2e-test-catalog)

1. # Introduction {#introduction}

   1. ## Document Overview {#document-overview}

   This Software Tests Specification (STS) document defines how tests for the FinLedger project are prepared, executed, and evaluated for the current implementation state.

   

   This STS covers:

- Software integration and verification tests executed with Node’s built-in ‘node:test’ runner.  
- End-to-end UI test executed using Playwright.  
- Test evidence collection using console output, database state validation, and Playwright reports in rich HTML.

	The scope of this document will evolve as the team progresses through each sprint.

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
- "FL-BE-USR-xxx" for ‘users’ controller integration tests.  
- "FL-BE-ACC-xxx" for ‘accounts’ controller integration tests.  
- "FL-RT-USR-xxx" for ‘users’ route integration tests.  
- "FL-UI-S1-xxx" for Sprint 1 Playwright UI tests.

Verification method codes:

- I \= Inspection  
- A \= Analysis  
- D \= Demonstration  
- T \= Test  
    
  Unless otherwise specified, automated test cases in this document use method "T".

Pass criteria:

- Command exits with code "0".  
- All listed test cases complete without assertion failures.  
- For UI tests, expected screenshots/attachments exist in Playwright report artifacts.

2. # Tests Preparation {#tests-preparation}

   1. ## Backend Automated Test Preparation {#backend-automated-test-preparation}

      Impacted tests: \`FL-SMOKE-\*\`, \`FL-BE-\*\`, \`FL-RT-\*\`

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

   3. ### Other Test Preparation {#other-test-preparation}

- Avoid reusing production DB credentials in ‘.env.test’.  
- Ensure no long-running process is already bound to the test server port.

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

   3. ### Other Test Preparation {#other-test-preparation-1}

- Ensure no conflicting process is using the configured port (defined in ‘env.test’, default of 3050\)  
- Ensure test DB is initialized before running UI tests

  4. ### Safety, Security, and Privacy Precautions {#safety,-security,-and-privacy-precautions-1}

- Run UI tests only against local or non-production environments.  
- Use seeded admin test account only.  
- Treat generated test artifacts as internal verification records.

  5. ### Test Platform Configuration Verification  {#test-platform-configuration-verification-1}

		Run and verify:

1. ‘npm run test:ui’ completes with exit code ‘0’  
2. ‘npx playwright show-report’ open HTML report with all test and step artifacts.  
3. ‘test-results/’ and ‘playwright-report/’ folders are generated after the test run and contain the proper artifacts. 

3. # Test Descriptions (index) {#test-descriptions-(index)}

   1. ## Suite-Level Execution Definitions {#suite-level-execution-definitions}

      1. ### Backend Integration and Verification Suite {#backend-integration-and-verification-suite}

| Test ID | FL-SUITE-BE-001 |
| :---- | :---- |
| Test Description | Executes all Node backend tests (\`node:test\`) |
| Entry Requirement | Sprint 1 core auth/user/password flows; partial Sprint 2 account validation |
| Initial Conditions | ‘.env.test’ file configured; PostgreSQL test DB reachable |
| Test Inputs | Source files in tests/server.test.js, tests/controllers/\*.test.js, tests/routes/\*.test.js |
| Data Collection | Capture command output from npm test |
| Test Outputs | Pass/fail summary and per-test status lines |
| Assumptions and Constraints | Test DB can be truncated/reinitialized |
| Expected Results | Exit code 0; all backend tests pass |

Test Procedure:

| Step Num | Operator Actions | Expected Result |
| :---- | :---- | :---- |
| 1 | Run ‘npm run db-init:test’ | Test DB schema and data properly initialized |
| 2 | Run ‘npm test’ | Test runner executes tests successfully.  |
| 3 | Review Summary | All backend tests pass. |

2. ### UI E2E Sprint 1 Suite {#ui-e2e-sprint-1-suite}

| Test ID | FL-SUITE-UI-001 |
| :---- | :---- |
| Test Description | Execute Sprint 1 Playwright UI tests |
| Entry Requirement | Sprint 1 UI login and password-validation behavior |
| Initial Conditions | Playwright installed, Chromium installed, .env.test configured |
| Test Inputs | tests/ui/sprint1.ui.spec.js |
| Data Collection | Attach screenshots to Playwright report, collect traces on retry	 |
| Test Outputs | Console pass/fail \+ playwright-report/ \+ test-results/	 |
| Assumptions and Constraints | Web server starts from webServer.command in config	 |
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
| FL-SMOKE-001	 | server responds to GET /	 | tests/server.test.js |

      2. ### Users Controller Integration Tests {#users-controller-integration-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-BE-USR-001 | getUserLoggedInStatus returns false when not logged in	 | tests/controllers/users.test.js |
| FL-BE-USR-002 | getUserLoggedInStatus returns true and extends session	 | tests/controllers/users.test.js |
| FL-BE-USR-003 | getUserLoggedInStatus returns false for expired session	 | tests/controllers/users.test.js |
| FL-BE-USR-004 | isAdmin returns true only for admin with valid session	 | tests/controllers/users.test.js |
| FL-BE-USR-005 | isAdmin returns false when token missing or session invalid	 | tests/controllers/users.test.js |
| FL-BE-USR-006 | getUserById returns user and null for missing	 | tests/controllers/users.test.js |
| FL-BE-USR-007 | getUserByEmail returns user and null for missing	 | tests/controllers/users.test.js |
| FL-BE-USR-008 | getUserByResetToken returns user only when token valid	 | tests/controllers/users.test.js |
| FL-BE-USR-009 | getUserByResetToken returns null for expired token	 | tests/controllers/users.test.js |
| FL-BE-USR-010 | listUsers returns users ordered by id	 | tests/controllers/users.test.js |
| FL-BE-USR-011 | listLoggedInUsers returns unique active users with latest login	 | tests/controllers/users.test.js |
| FL-BE-USR-012 | listLoggedInUsers returns one row per user | tests/controllers/users.test.js |
| FL-BE-USR-013 | approveUser updates status to active | tests/controllers/users.test.js |
| FL-BE-USR-014 | rejectUser updates status to rejected | tests/controllers/users.test.js |
| FL-BE-USR-015 | suspendUser and reinstateUser update suspension fields | tests/controllers/users.test.js |
| FL-BE-USR-016 | changePassword enforces complexity and history | tests/controllers/users.test.js |
| FL-BE-USR-017 | changePassword clears temp\_password flag | tests/controllers/users.test.js |
| FL-BE-USR-018 | createUser creates user and sends temp password email when needed | tests/controllers/users.test.js |
| FL-BE-USR-019 | createUser rejects invalid role and missing required fields | tests/controllers/users.test.js |
| FL-BE-USR-020 | updateSecurityQuestions \+ verifySecurityAnswers | tests/controllers/users.test.js |
| FL-BE-USR-021 | updateSecurityQuestions rejects non-3 question sets | tests/controllers/users.test.js |
| FL-BE-USR-022 | verifySecurityAnswers rejects non-3 answers | tests/controllers/users.test.js |
| FL-BE-USR-023 | logoutInactiveUsers removes expired sessions | tests/controllers/users.test.js |
| FL-BE-USR-024 | unsuspendExpiredSuspensions restores active status | tests/controllers/users.test.js |
| FL-BE-USR-025 | sendPasswordExpiryWarnings sends once per day and tracks | tests/controllers/users.test.js |
| FL-BE-USR-026 | sendPasswordExpiryWarnings skips users outside warning window | tests/controllers/users.test.js |
| FL-BE-USR-027 | suspendUsersWithExpiredPasswords suspends and logs email | tests/controllers/users.test.js |
| FL-BE-USR-028 | suspendUsersWithExpiredPasswords ignores non-expired users | tests/controllers/users.test.js |
| FL-BE-USR-029 | changePasswordWithCurrentPassword updates password when current password matches | tests/controllers/users.test.js |
| FL-BE-USR-030 | changePasswordWithCurrentPassword rejects invalid current password | tests/controllers/users.test.js |
| FL-BE-USR-031 | updateSecurityQuestionsWithCurrentPassword updates questions when current password matches | tests/controllers/users.test.js |
| FL-BE-USR-032 | updateSecurityQuestionsWithCurrentPassword rejects invalid current password | tests/controllers/users.test.js |
| FL-BE-USR-033 | updateUserProfile updates provided fields and returns updated user | tests/controllers/users.test.js |
| FL-BE-USR-034 | updateUserProfile returns null when no updates provided | tests/controllers/users.test.js |
| FL-BE-USR-035 | updateUserProfile returns null when user missing | tests/controllers/users.test.js |
| FL-BE-USR-036 | deleteUserById removes user record | tests/controllers/users.test.js |
| FL-BE-USR-037 | setUserPassword updates password hash and temp flag | tests/controllers/users.test.js |
| FL-BE-USR-038 | setUserPassword rejects passwords that fail complexity checks | tests/controllers/users.test.js |
| FL-BE-USR-039 | getUserByUsername returns user and null for missing | tests/controllers/users.test.js |

      3. ### Accounts Controller Integration Tests {#accounts-controller-integration-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-BE-ACC-001 | createAccount allows multiple accounts in same category/subcategory | tests/controllers/accounts.test.js |
| FL-BE-ACC-002 | createAccount rejects invalid statement types | tests/controllers/accounts.test.js |
| FL-BE-ACC-003 | createAccount rejects unknown categories or subcategories | tests/controllers/accounts.test.js |

      4. ### User Route Integration Tests {#user-route-integration-tests}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-RT-USR-001 | GET /api/users/security-questions-list is public and returns available security questions | tests/routes/users.test.js |
| FL-RT-USR-002 | GET /api/users/get-user/:userId returns user details for admin | tests/routes/users.test.js |
| FL-RT-USR-003 | GET /api/users/get-user/:userId rejects non-admins | tests/routes/users.test.js |
| FL-RT-USR-004 | GET /api/users/list-users returns list for admin and rejects missing session | tests/routes/users.test.js |
| FL-RT-USR-005 | POST /api/users/email-user sends email for admin and 400s on missing fields | tests/routes/users.test.js |
| FL-RT-USR-006 | GET /api/users/approve-user/:userId approves pending user (and emails) | tests/routes/users.test.js |
| FL-RT-USR-007 | GET /api/users/approve-user/:userId rejects non-pending users | tests/routes/users.test.js |
| FL-RT-USR-008 | POST /api/users/change-password updates password with current password (multipart) | tests/routes/users.test.js |
| FL-RT-USR-009 | POST /api/users/update-security-questions rejects invalid current password | tests/routes/users.test.js |
| FL-RT-USR-010 | POST /api/users/register\_new\_user is public and creates pending user | tests/routes/users.test.js |
| FL-RT-USR-011 | Password reset flow: GET /reset-password issues token, then /security-questions and /verify-security-answers | tests/routes/users.test.js |
| FL-RT-USR-012 | Admin user management endpoints: suspend, reinstate, update-user-field, delete-user, reset-user-password | tests/routes/users.test.js |

   3. ## Sprint 1 UI E2E Test Catalog {#sprint-1-ui-e2e-test-catalog}

| Test ID | Test Description | Source |
| :---- | :---- | :---- |
| FL-UI-S1-001 | admin can sign in from the login UI | tests/ui/sprint1.ui.spec.js |
| FL-UI-S1-002 | new user form shows and validates the starts-with-letter password rule | tests/ui/sprint1.ui.spec.js |
| FL-UI-S1-003 | profile change-password UI shows requirements and mismatch feedback | tests/ui/sprint1.ui.spec.js |

## 