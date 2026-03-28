# Sprint 1: User Interface Module Feature List

Source PDF: `../SWE4713 - Application Domain - Sprint 1 - Feature for User Interface Module (1).pdf`

## Features

1. [x] Allow three types of users - administrator, manager, and regular user (accountant) - to log in to the system.
2. [x] The administrator user should be able to create users and assign roles.
3. [x] The administrator user should be able to update information about a system user.
4. [x] The administrator user should be able to activate or deactivate each kind of user.
5. [x] Each kind of user should be able to log in to the system once credentials are created in the system.
6. [x] The logged-in username and picture should be displayed clearly in the top-right corner of the page once the user has successfully logged into the system.
7. [x] The login page should have:
   - [x] A text box to enter the username.
   - [x] A text box to enter a password that is hidden as the user types.
   - [x] A submit button.
   - [x] A forgot-password button.
   - [x] A create-new-user button.
   - [x] A logo that is displayed on all pages of the application.
8. [x] The create-new-user button should be used when the user is accessing the system for the first time. Clicking this button should display a user interface where the user provides personal information such as first name, last name, address, and DOB, then submits a request for access to the application. The administrator should receive the request by email and approve or reject it. If approved, an email should be sent to the user with a link to log in to the system.
9. [x] If the forgot-password button is clicked, the system should prompt the user to enter the email address and user ID that were provided when the credentials were created in the system, then ask security questions so the user can supply a new password.
10. [x] Passwords must be a minimum of 8 characters, must start with a letter, and must include a letter, a number, and a special character. If this requirement is not satisfied, display an appropriate error message.
11. [x] Passwords used in the past cannot be used when a password is reset.
12. [x] Passwords must be encrypted.
13. [x] A maximum of three incorrect password attempts should be allowed, after which the user should be suspended.
14. [x] All login information must be stored in database tables.
15. [x] Three days before a password expires, the user should receive a notification that the password is about to expire.
16. [x] The administrator should have a report where all users in the system can be viewed without going directly to the tables.
17. [x] The administrator should be able to suspend any user from a start date to an expiry date, such as when the person is on extended leave.
18. [x] The administrator should get a report of all expired passwords.
19. [x] The administrator should be able to send email to any user from within the system.
20. [x] A username should be made of the first-name initial, the full last name, and a four-digit value representing the account creation month and year (two-digit month and two-digit year).
