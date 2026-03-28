# Sprint 4: Adjusting Entries and Financial Reports Feature List

Source PDF: `../SWE4713 - Application Domain - Sprint 4 - Adjusting Entries and Financial Reports Features List.pdf`

## Manager User

1. [x] Can generate, view, save, email, or print the trial balance, income statement, balance sheet, and retained earnings statement for a particular date or date range.
2. [x] Can approve or reject adjusting journal entries prepared by an accountant. If an adjusting journal entry is rejected, the manager must enter the reason in the comment field.
3. [x] Once a journal entry is approved, the entry must be reflected in the ledger for the account as well as in the financial statements.
4. [x] Must be able to view all adjusting journal entries submitted for approval with pending approval status.
5. [x] Must be able to view all approved adjusting journal entries.
6. [x] Must be able to view all rejected adjusting journal entries.
7. [x] Must be able to filter journal entries in the pending, approved, and rejected categories by date.
8. [x] Must be able to search a journal by account name, amount, or date.
9. [x] View event logs for each account in the chart of accounts.
10. [x] Must be able to click an account name or account number to go to the ledger for that account.
11. [x] From the ledger page, must be able to click the post reference (`PR`) to go to the journal entry that created the account.

## Accountant User

12. [x] Can create adjusting journal entries using only accounts found in the chart of accounts.
13. [x] Must be able to attach source documents to each journal entry in `pdf`, `word`, `excel`, `csv`, `jpg`, and `png` formats.
14. [x] Can cancel or reset an adjusting journal entry before it is submitted if restarting is desired, but once an adjusting journal entry is submitted the accountant cannot delete it.
15. [x] Can prepare and submit journal entries.
16. [x] Can view journal entries created by the manager or other accountants.
17. [x] Can view the status of all adjusting journal entries submitted for approval with pending, approved, or rejected status.
18. [x] Must be able to filter journal entries in the pending, approved, and rejected categories by date.
19. [x] Must be able to search a journal by account name, amount, or date.
20. [x] View event logs for each account in the chart of accounts.
21. [x] Must be able to click an account name or number to go to the ledger for that account.
22. [x] Once a journal entry is approved, the entry must be reflected in the ledger for the account as well as in the financial statements.
23. [x] From the ledger page, must be able to click the post reference (`PR`) to go to the journal entry that created the account.
24. [x] Each transaction must have at least one debit and one credit.
25. [x] Do not allow submission of a transaction containing an error.
26. [x] Must be able to send email to the manager or the administrator from the account page.
27. [x] The total debits in a journal entry must equal the total credits. Otherwise, an appropriate error message must be displayed, and the user should be able to use that message to correct the problem.
28. [x] Error messages must be stored in a database table.
29. [x] Error messages must be displayed in red.
30. [x] Once the root cause of an error is corrected, the error should disappear.
31. [x] The manager must receive a notification when an adjusting journal entry is submitted for approval.
32. [x] Clicking an account name or number on the chart of accounts page should lead to the ledger page for that account.
33. [x] Each entry in the account ledger must have a clickable post reference column that leads to the journal entry that created it.
34. [x] The ledger page must show the date of the journal entry, a description column, a debit column, a credit column, and a balance column. The balance after each transaction and posting must be accurate.
35. [x] The ledger page must have filtering and search features. It must allow filtering by date or date range and support searching by account name or amount.
