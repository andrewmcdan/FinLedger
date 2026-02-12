# Login and Security

This section explains how users sign in, manage passwords, recover access, and how FinLedger enforces session and password security.

## Login Screen

The login screen is available from the top navigation link `Login`.

The sign-in form includes:

- `Username`
- `Password`
- `Log In`
- `New User`
- `Forgot Password`

After successful sign-in:

- The header shows `You are logged in as ...`.
- The top-right profile control shows your display name and profile image.
- The navigation link changes from `Login` to `Logout`.

## Sign-In Process

1. Open the `Login` page.
2. Enter your username and password.
3. Select `Log In`.

On success, FinLedger creates a signed session token and redirects to the dashboard.

If credentials are invalid, the page shows a login failure message.

## Session and Access Control

FinLedger uses authenticated requests for protected pages and APIs.

- Protected requests include `Authorization: Bearer <token>` and `X-User-Id` headers.
- Session expiration is tracked server-side and extended while users remain active.
- If a session is missing or expired, protected routes return an authentication error and the UI redirects to sign-in.

## Logout

Users can sign out in either of these ways:

- Select `Logout` in the top navigation.
- Open the profile menu and select `Logout`.

Logout invalidates the active server session and clears local session data in the browser.

## Password Rules

Password validation is enforced during password changes and resets.

Current enforcement requires:

- Minimum length of 8 characters.
- At least one uppercase letter.
- At least one lowercase letter.
- At least one number.
- At least one special character.

Password reuse protection is enabled.

- New passwords cannot match previously used passwords stored in password history.

## Failed Login Attempts and Suspension

FinLedger tracks failed login attempts.

- After 3 failed attempts, login is blocked for that user.
- The user receives an account suspended message and must contact an administrator.
- On successful login, failed-attempt counters are reset.

## Forgot Password Flow

Use `Forgot Password` when you cannot log in.

1. Open `Forgot Password` from the login page.
2. Enter your email and user ID.
3. Select `Reset Password`.
4. Check your email for the reset link.
5. Open the link and answer your three security questions.
6. Enter and confirm a new password.
7. Submit to complete reset.

Important behavior:

- Reset tokens expire.
- Security answers must match what is stored for the account.
- Password complexity and password-history rules still apply.

## Temporary Password and Forced Change

Some accounts are issued temporary passwords.

When logging in with a temporary password:

- The user is redirected to the `Change Password` screen.
- Most routes are blocked until password change is completed.
- The user must set three security questions and answers, then set a new password.

After successful completion:

- Temporary password mode is cleared.
- The user can access normal application pages.

## Password Expiration and Warnings

FinLedger enforces password expiration.

- Standard passwords are set to expire after 90 days.
- Warning emails are sent in the 3-day window before expiration.
- Expired-password accounts can be suspended automatically by background jobs.

## Security Storage and Encryption

FinLedger stores security credentials in hashed form.

- Passwords are hashed before storage.
- Security answers are hashed before storage.
- Password history hashes are stored to enforce reuse restrictions.
- Reset links use time-limited reset tokens.

## Common Security Messages

Users may see these messages during authentication flows:

- `Invalid username or password`
- `Account is suspended due to multiple failed login attempts`
- `Invalid or expired reset token`
- `Security answers verification failed`
- `TEMP_PASSWORD_CHANGE_REQUIRED`

If access remains blocked after valid inputs, contact an administrator.
