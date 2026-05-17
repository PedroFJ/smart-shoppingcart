# i18n

## Locale Policy

- `en` is the source-of-truth namespace for translators.
- `pt-PT` is the runtime default for the household testing build.
- Fallbacks are `pt-BR -> pt-PT -> en`, `es -> en`, and `en` with no further fallback.
- Device locale is used only to select a supported locale. Unknown locales stay on `pt-PT`.

## Namespaces

- `common`: shared buttons, statuses, units, and app chrome.
- `errors`: validation, sync, and recovery messages.
- `welcome`: onboarding and app purpose.
- `auth`: sign-in, household creation, and invite flows.
- `home`: household overview and next action.
- `list`: planning list.
- `add`: product catalogue and product creation.
- `shop`: store selection and shopping mode.
- `summary`: training summary.
- `route-editor`: store section route editing.
- `missing`: missing product review.
- `settings`: user, household, store, and app settings.

## Key Rules

Every JSX text node must be wrapped in `t(...)`. Do not concatenate strings across multiple `t()` calls; every full sentence should be one key. Pluralization uses i18next count interpolation with `{{count}}`.

## Adding A Key

Add the key to `src/i18n/locales/en/<namespace>.json` first, then mirror it in `src/i18n/locales/pt-PT/<namespace>.json`.

## Adding A Locale

Create a locale folder, add the twelve namespace files, then register the locale resources and fallback policy in `src/i18n/index.ts`.
