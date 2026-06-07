# Contributing to Anomalist

Anomalist follows a practical, community-first approach inspired by OBS: keep changes minimal, focused, and maintainable, and prefer improvements that benefit as many users as possible.

## Getting Started

1. Fork and clone the repository.
2. Install dependencies with `npm install`.
3. Run `npm run dev` from the repo root.
4. Use `npm run typecheck` before opening a pull request.

## Adding a Widget

Community widgets should target the `@anomalist/widget-sdk` package.

1. Create a widget definition that satisfies `WidgetDefinition`.
2. Provide `id`, `name`, `defaultProps`, and `renderUrl`.
3. Optionally include a JSON Schema in `settingsSchema` for dashboard-side editing.
4. Call `registerWidget(def)` to validate and register your widget.

## Pull Request Guidelines

1. Keep PRs small and single-purpose.
2. Include context for why the change is needed.
3. Add or update types/docs when behavior changes.
4. Ensure all checks pass before requesting review.

## Code of Conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/).
Please be respectful, inclusive, and constructive in all interactions.
