# User Manual Style Guide

This style guide standardizes tone, structure, and terminology for the FinLedger User Manual.

## Audience and Intent

Primary audience:

- End users (administrator, manager, accountant)
- Instructors, reviewers, and QA readers

Writing intent:

- Explain how to complete tasks in the current UI
- Document behavior as implemented
- Keep language clear and operational

## Voice and Tone

- Use direct, instructional language.
- Prefer present tense.
- Prefer active voice.
- Avoid marketing language and vague statements.

Good example:

- `Select Reset Password to generate a temporary password email.`

Avoid:

- `The platform seamlessly empowers users to...`

## Terminology and Capitalization

Use exact UI labels when possible. Capitalize product/module names consistently.

Approved terms:

- `FinLedger`
- `Dashboard`
- `Accounts`
- `Transactions`
- `Reports`
- `Help`
- `Profile`
- `Login`, `Logout`
- `Chart of Accounts`
- `Journal Entry`, `Ledger`

When referencing buttons, links, tabs, and menu items, wrap labels in backticks.

Example:

- `Select 'Approve' in the 'User Approvals' card.`

## Section Structure

Each section `README.md` should generally follow:

1. Purpose (what this section covers)
2. Access/permissions (which role can perform actions)
3. Task flows (step-by-step)
4. Outcomes and expected system behavior
5. Error/edge cases (if relevant)
6. Cross-references to related sections

Use `docs/User Manual/templates/SECTION_TEMPLATE.md` as the starting point.

## Steps and Lists

- Use numbered lists for ordered actions.
- Use bullet lists for options, fields, and rules.
- Keep steps short and action-first.

## Screenshots and Figures

- Follow `docs/User Manual/assets/README.md` naming and capture standards.
- Place screenshots close to the task they support.
- Include short captions where context is needed.

## Cross-References

Use explicit paths when linking sections in markdown.

Example:

- `See docs/User Manual/02_Login_and_Security/README.md for password policy details.`

## Content Boundaries

- Document user-visible behavior first.
- If implementation detail is included, label it as `Implementation note`.
- Do not include secrets, credentials, or environment values.
