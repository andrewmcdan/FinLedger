# FinLedger User Manual

This manual describes how to use the FinLedger web application. Each section lives in its own folder so it can be authored independently and later compiled into a single PDF.

**Structure**

- Each section has its own folder under `docs/User Manual/`.
- Each section should include a `README.md` with the actual content.
- Use `todo.md` while a section is in progress; remove it after the section is complete.
- Section folders are numbered to preserve the final document order.
- Shared writing standards are in `docs/User Manual/STYLE_GUIDE.md`.
- Section drafting template is in `docs/User Manual/templates/SECTION_TEMPLATE.md`.
- Screenshot and figure standards are in `docs/User Manual/assets/README.md`.

**Section Order**

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

**PDF Generation**

- Generate the PDF with the project script:

```bash
npm run manual:pdf
```

- Default output path: `docs/User Manual/FinLedger_User_Manual.pdf`
- Optional custom output path:

```bash
node scripts/build-user-manual-pdf.js --out "docs/User Manual/FinLedger_User_Manual_custom.pdf"
```

- The generator includes:
  - `docs/User Manual/README.md`
  - Any numbered section folder that contains `README.md`
- Numbered folders without `README.md` are skipped with a warning.
