# Login and Security

This section describes current sign-in, password, reset, and session-security behavior.

## Login Screen

The login page is available from the `Login` link in the header.

The form includes:

- `Username`
- `Password`
- `Log In`
- `Request Access`
- `Forgot Password`

After successful sign-in:

- The header shows `You are logged in as ...`.
- The profile button shows name/avatar.
- Navigation updates to show `Logout`.

## Sign-In Process

1. Open the `Login` page.
2. Enter your username and password.
3. Select `Log In`.

On success, FinLedger stores session auth data in local storage and routes to `#/dashboard`.

If login fails, an error message from the message catalog is shown in the global message line.

## Session and Access Control

Protected routes require:

- `Authorization: Bearer <token>`
- `X-User-Id`

Session behavior:

- Server sessions are tracked in `logged_in_users` with a sliding timeout.
- Active requests extend session expiration.
- Session expiry headers are returned to the browser.
- The client warns before timeout and auto-logs out when expired.

If auth is missing or invalid, protected requests fail and the UI redirects to `Not Logged In` or `Login`.

## Logout

Users can log out from:

- Top navigation `Logout`
- Profile menu `Logout`

Logout updates server session state and clears local session data.

## Password Complexity Rules

Password validation is enforced on:

- Profile password change
- Temporary-password forced change
- Password reset submit flow
- Admin password set/reset paths

Current required rules:

- First character must be an ASCII letter (`A-Z` or `a-z`)
- Minimum length of 8 characters.
- At least one uppercase letter.
- At least one lowercase letter.
- At least one number.
- At least one special character.

Password reuse is blocked by password-history checks.

## Failed Login Attempts and Suspension

FinLedger tracks failed login attempts.

- Failed attempts increment on bad password.
- At 3 failed attempts, login is blocked with suspension messaging.
- On successful login, failed-attempt counters reset.

## Forgot Password Flow

Use `Forgot Password` from the login page.

1. Open `Forgot Password` from the login page.
2. Enter email and username.
3. Submit reset request.
4. Open the emailed reset link.
5. Answer three security questions.
6. Enter and confirm a new password.
7. Submit.

Reset protections:

- Reset token expires in 1 hour.
- Security answers must match stored hashes.
- Reset-answer failures are lock-limited (3 attempts).
- Password complexity and password-history checks apply.

## Temporary Password and Forced Change

Some accounts are issued temporary passwords.

When `temp_password` is active:

- Login redirects to `Change Password`.
- Most protected routes are blocked until completion.
- User must submit 3 security Q/A entries and a compliant password.

After completion:

- Temporary-password flag is cleared.
- Normal route access resumes.

## Password Expiration and Warnings

Password expiration is enforced.

- Standard passwords are set to expire after 90 days.
- Warning emails are sent in the 3-day window before expiry.
- Expired-password accounts can be auto-suspended by scheduled jobs.

## Security Storage and Encryption

Security-sensitive values are stored as hashes:

- Password hashes
- Security answer hashes
- Password history hashes

Reset links use time-limited tokens stored in the database.

## Messaging Behavior

Auth and security feedback uses message codes resolved from the `app_messages` table.

Messages are displayed in the global message line and can be dismissed manually or cleared by new input.
