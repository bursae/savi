# Savi

Savi is a local-first network analysis tool for understanding institutions.

The core engine is generic: it maps people, organizations, places, assets, relationships, and events from plain local files. The first project template is focused on Congress and legislative intelligence: who legislators are, what they do, who they work with, what they fund, what they vote for, and how power moves through the system.

## Terminal MVP

Build the CLI:

```bash
npm install
npm run build:extension
```

Create a Congress case:

```bash
savi init congress --template congress
cd congress
```

Add legislative network facts:

```bash
savi congress add-legislator "Rep. Jane Doe" --state NY --district 14 --party D
savi congress add-committee "House Committee on Oversight" --chamber house
savi congress add-bill "HR 1234" --title "Government Transparency Act" --sponsor "Rep. Jane Doe"
savi congress add-donor "Example PAC" "Rep. Jane Doe" --amount 1000
savi congress add-vote "Rep. Jane Doe" "HR 1234 - Government Transparency Act" yes
savi add relation "Rep. Jane Doe" "House Committee on Oversight" "member of"
```

Understand the case:

```bash
savi graph
savi validate
savi congress dossier "Rep. Jane Doe"
savi chart "Rep. Jane Doe"
savi export graph.json
```

## Seed Data

The repo includes a populated synthetic Congress demo:

```bash
cd examples
node ../dist/cli.js graph
node ../dist/cli.js validate
node ../dist/cli.js dossier "Rep. Elena Marquez"
node ../dist/cli.js chart "Rep. Elena Marquez"
```

Files:

- `examples/congress-demo.link.md`
- `examples/congress-demo.graph.json`

## Generic Commands

```bash
savi init <case-name> [--template congress]
savi add entity <person|org|place|asset> <name>
savi add relation <source> <target> <label>
savi add event <date> <label> <participant...> --location <place>
savi validate
savi graph
savi dossier <entity-name>
savi export <path>
savi chart <entity-name> [--depth 2] [--out chart.html]
savi chart --all [--out chart.html]
```

## Congress Commands

```bash
savi congress add-legislator <name> [--state NY] [--district 14] [--party D]
savi congress add-committee <name> [--chamber house|senate]
savi congress add-bill <bill-id> [--title <title>] [--sponsor <legislator>]
savi congress add-vote <legislator> <bill> <yes|no|present|abstain>
savi congress add-donor <donor-org> <legislator> [--amount 1000]
savi congress dossier <entity-name>
```

## File Format

Savi stores cases as local `.link.md` files. Users can use the CLI instead of memorizing the syntax, but the underlying format stays readable:

```text
[person] Rep. Jane Doe
[org] House Committee on Oversight
[asset] HR 1234 - Government Transparency Act

Rep. Jane Doe -> House Committee on Oversight : member of
Rep. Jane Doe -> HR 1234 - Government Transparency Act : voted yes
2026-03-10 | hearing | Rep. Jane Doe | House Committee on Oversight
```

## VS Code Extension

The repository still includes the VS Code extension UI:

- Scans the workspace for `*.link.md`
- Parses entities, relationships, and events line by line
- Publishes diagnostics to the Problems panel
- Renders a Cytoscape graph in a VS Code webview
- Reveals source lines from graph and tree selections
- Exports `.link-analysis/graph.json`
- Ships with a basic TextMate grammar for `.link.md`

Useful commands:

- `Link Analysis: Open Graph`
- `Link Analysis: Refresh Graph`
- `Link Analysis: Validate Workspace`
- `Link Analysis: Export Graph JSON`

## Project Structure

```text
link-analysis-extension/
  src/cli/    Terminal MVP and case storage
  src/        Extension host, parser, graph builder
  webview/    React + Cytoscape UI
  syntax/     TextMate grammar
  test/       Jest tests
```

## Tests

```bash
npm test
```
