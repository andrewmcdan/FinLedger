# Notifications and Email

## Email Features (Implemented)

Current email-trigger scenarios include:

- Registration confirmation email to new requester
- New access-request notifications to administrators
- Approval email after administrator approval
- Rejection email after administrator rejection
- Forgot-password reset-link email
- Administrator reset-user-password email with temporary password
- Administrator direct email to a selected user (`Email User`)
- Password-expiry warning emails (scheduled)
- Account suspended due to expired password email (scheduled)

Additional account-creation behavior:

- If an admin creates a user without a password, a temporary password is generated and emailed.

## In-App Notifications (Implemented)

In-app feedback is currently provided by the global message line:

- Success and error messages are message-code driven from the `app_messages` catalog.
- Message line supports manual dismissal.
- Message line auto-clears on form input events.

## Current Gaps

Not currently implemented:

- Dedicated in-app notification center/inbox
- Journal submission/approval notification workflows
- Adjusting-entry notification workflows

## Timing and Automation

Current server background jobs:

- Every 10 minutes:
  - inactive-session cleanup
  - unsuspend users whose suspension window ended
- Every 1 hour:
  - password-expiry warning processing
  - suspension of users with expired passwords
  - user-data cleanup tasks
- Every 24 hours:
  - log cleanup cycle

## Configuration Note

Email delivery depends on SMTP environment configuration (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_EMAIL_FROM`).
