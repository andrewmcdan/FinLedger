# Sprint 2: Chart of Accounts Module Feature List

Source PDF: `../SWE4713 - Application Domain - Sprint 2 - Feature list for Chart of Accounts Module (1).pdf`

## Administrator User

1. [x] Add, view, edit, or deactivate accounts. The system may ask the administrator to select which service to perform before displaying the appropriate user interface. When an account is added, the database must store at least the following information using an interface that supports both entry and modification:
   - [x] Account name
   - [x] Account number (must have the correct starting values as discussed in class)
   - [x] Account description
   - [x] Normal side
   - [x] Account category (for example, asset)
   - [x] Account subcategory (for example, current assets)
   - [x] Initial balance
   - [x] Debit
   - [x] Credit
   - [x] Balance
   - [x] Date/time account added
   - [x] User ID
   - [x] Order (for example, cash can be `01`)
   - [x] Statement (for example, `IS` for income statement, `BS` for balance sheet, `RE` for retained earnings statement)
   - [x] Comment
2. [x] Duplicate account numbers or names should not be allowed.
3. [x] All monetary values should have two decimal places.
4. [x] All monetary values must be formatted using commas when appropriate.
5. [x] Account numbers should not allow decimal places or alphanumeric values.
6. [x] Accounts with a balance greater than zero cannot be deactivated.
7. [x] View either individual accounts and their details or a report of all accounts in the chart of accounts.
8. [x] Search using either account number or account name to locate an account in the chart of accounts.
9. [x] The name of the logged-in user must be shown in the top-left corner of the page.
10. [x] The logo of the software must display on each page.
11. [x] Clicking each account in the chart of accounts should take the user to the ledger for that account.
12. [x] The chart of accounts page should support filtering by various tokens such as account name, number, category, subcategory, amount, and similar fields.
13. [x] A pop-up calendar should display in the top-left corner of the page.
14. [x] Buttons to other services provided in the software, such as journalizing, must be found at the top of each page.
15. [x] An event log showing the before and after image of each record added, modified, or deactivated should be generated whenever data changes by any user. The event logs must be stored in a table. The user ID and the date and time of the change must be saved. Each event must have a unique auto-generated ID.
16. [x] Each page in the application must have a consistent color and layout scheme.
17. [x] Each button must have a built-in tooltip that provides information about the purpose of the control.
18. [x] Each page must have a help button with information about the entire software organized by topic.

## Manager User

19. [x] Can view accounts but cannot add, edit, or deactivate accounts; can perform the rest of the services the administrator can perform.

## Accountant User

20. [x] Can view accounts but cannot add, edit, or deactivate accounts; can perform the rest of the services the administrator can perform.
