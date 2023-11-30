# Bridging/Synchronizing HubSpot to Notion

This is a simple project hooking into the respective
[Notion SDK](https://github.com/makenotion/notion-sdk-js) and
[Hubspot API](https://github.com/HubSpot/hubspot-api-nodejs)
using [TypeScript](https://www.typescriptlang.org/) to keep a Notion table
up-to-date (one-way) with our HubSpot project list.

This project uses
[Dev Containers](https://containers.dev/)
to ensure a consistent development environment.

## Features (inherited from Notion template)

- TypeScript for type checking.
- [Prettier](https://prettier.io/) for code formatting.
- A minimal GitHub Actions workflow that typechecks your code.
- [Dotenv](https://www.npmjs.com/package/dotenv) for configuring your Notion API token.
- [Dependabot](https://docs.github.com/en/code-security/dependabot/dependabot-version-updates/configuring-dependabot-version-updates)
  for ensuring your (and this template's!) dependencies are up to date.

## What to do after duplicating

1. Make sure you've [created a Notion integration](https://developers.notion.com/docs/getting-started) and have a secret Notion token.
2. Add your Notion token to a `.env` file at the root of this repository: `echo "NOTION_TOKEN=[your token here]" > .env`.
3. Create a Notion database and store its ID as `NOTION_INTCUBE_PROJECT_DB` in `.env` as well
4. Using `HUBSPOT_API_DOMAIN=api.hubapi.com` and your `HUBSPOT_API_KEY` as well as your `HUBSPOT_PORTAL_ID`
3. Run `npm install`.
5. Run `npm start` to run the script.

## NPM Scripts

This template has a few built-in NPM scripts:

| Script              | Action                                                                                                                                                                          |
| - | - |
| `npm start`         | Run `index.ts`.                                                                                                                                                                 |
| `npm run typecheck` | Type check using the TypeScript compiler.                                                                                                                                       |
| `npm run format`    | Format using Prettier (also recommended: the [Prettier VS Code extension](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) if you're using VS code.) |
| `npm run build`     | Build JavaScript into the `dist/` directory. You normally shouldn't need this if you're using `npm start`.                                                                      |
