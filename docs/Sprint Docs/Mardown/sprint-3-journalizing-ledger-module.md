# Sprint 3: Journalizing and Ledger Module Feature List

Source PDF: `../SWE4713 - Application Domain - Sprint 3 - Feature list Journalizing and Ledger Module.pdf`

## Administrator User

1. [x] Add, view, edit, or deactivate accounts as implemented in Sprint 2.
2. [x] View event logs for each account in the chart of accounts. Event logs must show the before and after image of each account. If an account is added for the first time, there will be no before image. If an account name is modified, there must be a before and after account image, including the user ID of the person who made the change and the date and time of the change.
3. [x] Be able to send email to a manager or accountant user from the chart of accounts page.

## Manager User

4. [x] Can create journal entries using only accounts found in the chart of accounts.
5. [x] Can approve or reject journal entries prepared by an accountant. If a submitted journal entry is rejected, the manager must enter the reason in the comment field.
6. [x] Once a journal entry is approved, the entry must be reflected in the ledger for the account.
7. [x] Must be able to view all journal entries submitted for approval with pending approval status.
8. [x] Must be able to view all approved journal entries.
9. [x] Must be able to view all rejected journal entries.
10. [x] Must be able to filter journal entries in the pending, approved, and rejected categories by date.
11. [x] Must be able to search a journal by account name, amount, or date.
12. [x] View event logs for each account in the chart of accounts. Event logs must show the before and after image of each account. If an account is added for the first time, there will be no before image. If an account name is modified, there must be a before and after account image, including the user ID of the person who made the change and the date and time of the change.
13. [x] Must be able to click an account name to go to the ledger for that account.
14. [x] From the ledger page, must be able to click the post reference (`PR`) to go to the journal entry that created the account.
15. [x] Clicking an account on the chart of accounts page should lead to the ledger page for the account, where all entries can be viewed.
16. [x] Each entry in the account ledger must have a clickable post reference column that leads to the journal entry that created it.
17. [x] The ledger page must show the date of the journal entry, a description column that is usually empty, a debit column, a credit column, and a balance column. The balance after each transaction and posting must be accurate.
18. [x] The ledger page must have filtering and search features. It must allow filtering by date or date range and support searching by account name or amount.

## Accountant User

19. [x] Can create journal entries using only accounts found in the chart of accounts.
20. [x] Debits must come before credits in each journal entry created.
21. [x] Multiple debits and multiple credits must be possible for each journal entry recorded.
22. [x] Must be able to attach source documents to each journal entry in `pdf`, `word`, `excel`, `csv`, `jpg`, and `png` formats.
23. [x] Can cancel or reset a journal entry before it is submitted if restarting is desired, but once a journal entry is submitted the accountant cannot delete it.
24. [x] Can prepare and submit journal entries.
25. [x] Can view journal entries created by the manager or other accountants.
26. [x] Can view the status of all journal entries submitted for approval with pending, approved, or rejected status.
27. [x] Must be able to filter journal entries in the pending, approved, and rejected categories by date.
28. [x] Must be able to search a journal by account name, amount, or date.
29. [x] View event logs for each account in the chart of accounts. Event logs must show the before and after image of each account. If an account is added for the first time, there will be no before image. If an account name is modified, there must be a before and after account image, including the user ID of the person who made the change and the date and time of the change.
30. [x] Must be able to click an account name to go to the ledger for that account.
31. [x] Once a journal entry is approved, the entry must be reflected in the ledger for the account.
32. [x] From the ledger page, must be able to click the post reference (`PR`) to go to the journal entry that created the account.
33. [x] Each transaction must have at least one debit and one credit.
34. [x] Do not allow submission of a transaction containing an error.
35. [x] Must be able to send email to the manager or the administrator from the account page.
36. [x] The total debits in a journal entry must equal the total credits. Otherwise, an appropriate error message must be displayed, and the user should be able to use that message to correct the problem. Anticipate the different error cases and provide appropriate messages.
37. [x] Error messages must be stored in a database table.
38. [x] Error messages must be displayed in red.
39. [x] Once the root cause of an error is corrected, the error should disappear.
40. [x] The manager must receive a notification when a journal entry is submitted for approval.
41. [x] Clicking an account on the chart of accounts page should lead to the ledger page for the account, where all entries can be viewed.
42. [x] Each entry in the account ledger must have a clickable post reference column that leads to the journal entry that created it.
43. [x] The ledger page must show the date of the journal entry, a description column that is usually empty, a debit column, a credit column, and a balance column. The balance after each transaction and posting must be accurate.
44. [x] The ledger page must have filtering and search features. It must allow filtering by date or date range and support searching by account name or amount.
