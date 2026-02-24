# FinLedger User Manual

This folder contains the source markdown for the FinLedger User Manual.

## Structure

- Each manual section has its own numbered folder under `docs/User Manual/`.
- Each completed section uses `README.md`.
- Numbering controls section order in the generated PDF.
- Shared writing rules are in `docs/User Manual/STYLE_GUIDE.md`.
- The section template is in `docs/User Manual/templates/SECTION_TEMPLATE.md`.
- Figure and screenshot guidance is in `docs/User Manual/assets/README.md`.

## Section Order

1. `docs/User Manual/01_Overview_and_Roles/README.md`
2. `docs/User Manual/02_Login_and_Security/README.md`
3. `docs/User Manual/03_User_Administration/README.md`
4. `docs/User Manual/04_Navigation_and_UI/README.md`
5. `docs/User Manual/05_Chart_of_Accounts/README.md`
6. `docs/User Manual/06_Journal_Entries/README.md`
7. `docs/User Manual/07_Ledger/README.md`
8. `docs/User Manual/08_Adjusting_Entries/README.md`
9. `docs/User Manual/09_Financial_Reports/README.md`
10. `docs/User Manual/10_Dashboards_and_Ratios/README.md`
11. `docs/User Manual/11_Documents_and_Attachments/README.md`
12. `docs/User Manual/12_Notifications_and_Email/README.md`
13. `docs/User Manual/13_Audit_and_Event_Logs/README.md`

## PDF Generation

Generate the manual PDF:

```bash
npm run manual:pdf
```

Default output:

- `docs/User Manual/FinLedger_User_Manual.pdf`

Optional custom output:

```bash
node scripts/build-user-manual-pdf.js --out "docs/User Manual/FinLedger_User_Manual_custom.pdf"
```

Current generator behavior:

- Builds a title page, then table of contents.
- Includes numbered section folders that contain `README.md`.
- Skips numbered folders with no `README.md` and logs a warning.
- This top-level `docs/User Manual/README.md` is reference text and is not included in the PDF body.
