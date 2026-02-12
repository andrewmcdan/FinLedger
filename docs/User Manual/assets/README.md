# Manual Assets

This folder contains visual assets used in the User Manual.

## Folder Layout

- `docs/User Manual/assets/screenshots/`:
  PNG screenshots from the live UI
- `docs/User Manual/assets/figures/`:
  Supporting diagrams, annotated callouts, and exported graphics

## Screenshot Standards

Use these standards for consistency and easier PDF assembly:

- Capture at `100%` browser zoom.
- Use a desktop viewport of `1366x768` or `1440x900`.
- Capture only relevant UI area (avoid unrelated browser chrome when possible).
- Remove or mask sensitive data (emails, tokens, IDs not intended for publication).
- Prefer PNG format.

## File Naming Convention

Use this format:

`S##_topic__page__action__vNN.png`

Examples:

- `S02_login__public-login__submit-credentials__v01.png`
- `S03_admin__dashboard__approve-user__v02.png`
- `S05_accounts__accounts-list__apply-filter__v01.png`

Naming notes:

- `S##` maps to manual section number.
- Use lowercase with hyphens inside each token.
- Increment `vNN` when replacing with updated screenshots.

## Annotation Rules

- Keep original screenshot and annotated screenshot as separate files.
- Use concise callouts (1 short sentence each).
- Use consistent callout color and style across sections.
- Do not alter UI text in screenshots.

## Referencing Assets in Markdown

Use relative paths from section files, for example:

```md
![Login screen](../assets/screenshots/S02_login__public-login__submit-credentials__v01.png)
```

Add descriptive alt text to improve accessibility and PDF readability.
