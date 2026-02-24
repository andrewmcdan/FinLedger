# User Administration

This section documents current administrator-only user-management features.

## Access and Scope

User administration is exposed on `Dashboard` only for users with role `administrator`.

Manager and accountant users:

- Do not see admin user-management cards.
- Cannot use admin-only user-management APIs.

## Admin Workspace (Dashboard)

The admin `User Management` area currently includes:

- `User Approvals`
- `Users with Expired Passwords`
- `Suspended Users`
- `Currently Logged-in Users`
- `All Users` table
- `Create User`
- `Delete User`
- `Reset User Password`
- `Suspend User Account`
- `Email User`

## Registration Request Workflow

New users can request access from the login page using `Request Access`.

Current flow:

1. Requester submits profile details, role, password, and security questions.
2. FinLedger creates the account with `pending` status.
3. Requester receives a registration confirmation email.
4. An administrator reviews the request in `User Approvals`.
5. The admin selects `Approve` or `Reject`.

Approval behavior:

- Status is updated to `active`.
- An approval email is sent to the user.

Rejection behavior:

- Status is updated to `rejected`.
- A rejection email is sent.

## Create User (Administrator)

Use the `Create User` card to create accounts directly.

Current fields:

- First Name
- Last Name
- Address
- Date of Birth
- Email
- Role (`administrator`, `manager`, `accountant`)
- Profile Image

Current behavior:

- Username is generated automatically.
- If no password is provided, system generates a temporary password.
- New account status starts as `pending`.
- Temporary-password account details are emailed to the user.
- Profile image upload is validated by file type and size limits.

## View and Edit Users

The `All Users` table supports:

- Pagination (`5`, `10`, `25`, `50`, `100` rows per page)
- Inline double-click editing for selected columns
- Display of user lifecycle fields (status, role, login/suspension/password-expiry dates, contact info)

## Suspend and Reinstate Users

Suspend flow:

1. Open `Suspend User Account`.
2. Select an eligible active user (not yourself).
3. Enter suspension start/end date-time.
4. Submit the form.

Reinstatement:

- In `Suspended Users`, select `Reinstate`.

Additional behavior:

- Expired suspensions are automatically cleared by background jobs.
- Users can also be suspended by security policies (failed login attempts, password expiry).

## Delete User

Use `Delete User` to remove an account.

Behavior:

- Admin selects a username.
- Confirmation prompt appears before deletion.
- The UI prevents an admin from deleting their own account.

## Reset User Password

Use `Reset User Password` when a user is locked out.

Current behavior:

1. Select user.
2. Submit reset.
3. System generates a compliant temporary password.
4. Temporary password is emailed to the user.
5. User is required to change it at next login.

## Email User

Use `Email User` to send an administrator-authored message.

Required inputs:

- Recipient username
- Subject
- Message

## Logged-In Users and Expired Password Reporting

`Currently Logged-in Users` shows active sessions.

`Users with Expired Passwords` highlights accounts that have expired credentials.

This aligns with password-expiry automation (warnings and suspension).

## Operational Notes

- Admin-only restrictions are enforced by API checks, not just hidden UI.
- Email delivery requires valid SMTP configuration.
- For password policy and recovery details, see `docs/User Manual/02_Login_and_Security/README.md`.
