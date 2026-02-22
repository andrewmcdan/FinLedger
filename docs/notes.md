## Notes from Sample UI Design Lecture
- **Cancellation**: Users should be able to easily undo actions, such as resetting a form.
- **Error Prevention**: Design should minimize the chances of user errors, such as using drop down menus instead of free text input where appropriate.
- **TODO: account term**: Current versus long term needs to be a column in the DB and shown in the UI.

------------------------------------------------------------

# 1. User Roles and Access Control

## 1.1 Required Roles
The system must support at minimum:
- Administrator
- Manager
- Regular Accountant

The system must allow multiple users per role.

## 1.2 Role Based Authorization
- The system must be fully role based.
- Changing a user role must automatically update permissions.
- No manual reconfiguration should be required after role reassignment.

## 1.3 Username Convention
Usernames must be generated using:
- First name initial
- Last name
- Four digit year

The system must:
- Detect duplicates
- Append a suffix letter if needed (A, B, C, etc.)

------------------------------------------------------------

# 2. Login System Requirements

## 2.1 Login Page Must Include
- Software name
- Logo displayed on every page
- Username input field
- Password input field (masked)
- Submit button
- TODO: Reset button
- Forgot username/password option
- New user request access option
- Logged in username and picture displayed in top right corner after login
- TODO: Forgot username flow (separate from forgot password) is not implemented.

## 2.2 Login Validation
The system must:
- Validate both username and password are entered
- Display appropriate error messages
- Deny access if credentials are invalid
- Deny access if user is inactive
- Deny access if user is suspended

## 2.3 Password Requirements
Passwords must:
- Be minimum 8 characters
- Start with a letter
- Include at least one letter
- Include at least one number
- Include at least one special character
- Be encrypted in the database
- Not allow reuse of previous passwords
- Lock account after three failed attempts

## 2.4 Password Expiration
- Store password expiration date
- Notify user three days before expiration

## 2.5 Forgot Password
Must require:
- Email and user ID
- Three security questions
- Lockout after three incorrect attempts

------------------------------------------------------------

# 3. Error Message Handling

- All error messages must be stored in a database table
- No hardcoded error messages allowed
- Messages must be dynamically retrieved
- Messages must be short and clear
- A designated message line must display system messages
- Message must disappear once issue is corrected
- TODO: Do a full-codebase audit to eliminate remaining hardcoded/legacy error text and enforce message-catalog usage everywhere.

------------------------------------------------------------

# 4. New User Request Workflow

- User clicks Request Access
- User enters required personal data
- Submission sends email notification to admin
- Admin may approve or reject
- Approval triggers welcome email with login link
- Rejection triggers notification email

------------------------------------------------------------

# 5. Administrator Capabilities

Admin may:
- Create users
- Assign roles
- TODO: Activate users (immediate or future date)
- Deactivate users
- Suspend users (with date range)
- Edit users
- TODO: Generate reports
- Send emails to users

Admin may not:
- Create journal entries
- View detailed journal entries
- View financial statements
- TODO: Enforce these role restrictions once journal and financial statement modules are implemented.

------------------------------------------------------------

# 6. User Status Management

User table must include:
- TODO: Active flag (currently represented by `status` enum, not a dedicated flag column)
- TODO: Suspended flag (currently represented by `status` + suspension dates, not a dedicated flag column)
- Suspension date range
- TODO: Created by
- Date created

Login must verify:
- User exists
- User is active
- User is not suspended

------------------------------------------------------------

# 7. Event Log Requirements

A dedicated event log table is mandatory.

Must store:
- Before image (B prefix)
- After image (A prefix)
- User who made change
- Timestamp of change

Applies to:
- User changes
- Account changes
- Any system data modifications

------------------------------------------------------------

# 8. Chart of Accounts Requirements

## 8.1 Account Numbering
- TODO: Must be 10 digits
- Must leave gaps for expansion
- Sequential numbering not allowed

## 8.2 Account Fields
- Account number (clickable)
- Account name (clickable)
- TODO: Type (dropdown): Asset, Liability, Equity, Revenue, Expense
- TODO: Category: Current or Long Term
- Balance
- TODO: Date created
- TODO: Created by

## 8.3 Restrictions
- Accounts cannot be deleted
- Accounts with balance greater than zero cannot be deactivated
- Only admin may edit accounts
- TODO: Dollar amounts must be right justified
- Two decimal places required
- Column headers bold

------------------------------------------------------------

# 9. Journal Entry System Requirements
- TODO: Journal entry system is not implemented end-to-end; requirements in this section remain open.

## 9.1 Required Fields
- Journal ID
- Journal Type (dropdown: Regular, Adjusting, Closing, Reversing)
- Date
- Description (short sentence)
- Created by
- Status

## 9.2 Entry Rules
- Multiple debit lines allowed
- Multiple credit lines allowed
- Debits must equal credits before submission
- Error displayed if not balanced
- Cannot submit until balanced
- Cannot delete journal entries
- Can reject journal entries
- Cannot use same account twice in same transaction
- All accounts must come from Chart of Accounts
- Debit lines must precede credit lines
- Amounts right justified with dollar sign and two decimals

## 9.3 Attachments
- Must allow attaching multiple source documents
- Support multiple file types

## 9.4 Filtering
- Filter by date range
- Filter by amount
- Filter by status

------------------------------------------------------------

# 10. Journal Approval Workflow
- TODO: Journal approval workflow is not implemented; requirements in this section remain open.

- Only manager can approve or reject
- Accountant can create entries
- Admin cannot see journal entries
- Rejection requires reason
- Status changes automatically on approval
- Color coded status indicators
- Filter by Pending, Approved, Rejected

------------------------------------------------------------

# 11. Financial Statements Requirements
- TODO: Financial statement generation/formatting is not implemented end-to-end; requirements in this section remain open.

## 11.1 General Formatting
Each statement must include:
1. Company Name
2. Statement Name
3. As Of Date

Formatting rules:
- Consistent color scheme
- Logo on every page
- Current page highlighted
- Titles left justified
- Dollar amounts right justified
- Two decimal places
- Proper underlining
- Double underline at totals

## 11.2 Income Statement
- Revenue
- Expenses
- Bottom line must read Net Income (Loss)

## 11.3 Balance Sheet
- Assets
- Liabilities and Equity
- Must balance

## 11.4 Statement of Owner Equity
- Derived from net income and retained earnings

------------------------------------------------------------

# 12. Reports

TODO: Admin must be able to generate reports without direct database access.

Examples:
- All users
- Suspended users
- Expiring passwords
- Chart of accounts
- Journal entries by date
- Journal entries by status
- Account balances

Teams are expected to design additional useful reports.

------------------------------------------------------------

# 13. User Interface and Design Expectations

- Professional appearance
- Limited color palette
- Consistent formatting
- Follow usability guidelines for input sizing
- Use dropdowns for fixed selections
- Proper logout placement
- Highlight active navigation item
- Use prototyping tools before implementation

------------------------------------------------------------

# 14. System Integrity Rules

- No deleting accounts
- TODO: No deleting journal entries
- TODO: All changes logged
- All numeric fields properly formatted
- TODO: Use provided accounting problem for validation
- TODO: System must obey accounting equation
- TODO: Domain knowledge must be reflected correctly in implementation

------------------------------------------------------------

# 15. Sprint 1 Scope

Sprint 1 must include:
- User creation
- Role assignment
- Login system
- Password management
- TODO: Activation and deactivation
- Suspension handling
- TODO: Event logging
- Email notification functionality
