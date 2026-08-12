import * as path from "path";
import { EntityType, GraphModel, IssueSeverity } from "../models/types";
import { exportChart } from "./chartExporter";
import { appendEntityIfMissing, appendLine, createCase, exportGraph, getGraph } from "./caseStore";

type CommandResult = { exitCode: number };

export interface CliIO {
  stdout: (message: string) => void;
  stderr: (message: string) => void;
}

const ENTITY_TYPES = new Set<EntityType>(["person", "org", "place", "asset"]);

export async function runCli(argv: string[], cwd: string, io: CliIO): Promise<CommandResult> {
  try {
    if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
      io.stdout(helpText());
      return { exitCode: 0 };
    }

    const [command, ...args] = argv;

    if (command === "init") {
      return await initCommand(args, cwd, io);
    }

    if (command === "add") {
      return await addCommand(args, cwd, io);
    }

    if (command === "congress") {
      return await congressCommand(args, cwd, io);
    }

    if (command === "validate") {
      return await validateCommand(cwd, io);
    }

    if (command === "graph") {
      return await graphCommand(cwd, io);
    }

    if (command === "export") {
      return await exportCommand(args, cwd, io);
    }

    if (command === "chart") {
      return await chartCommand(args, cwd, io);
    }

    if (command === "dossier") {
      return await dossierCommand(args, cwd, io);
    }

    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return { exitCode: 1 };
  }
}

async function initCommand(args: string[], cwd: string, io: CliIO): Promise<CommandResult> {
  const caseName = required(args[0], "Usage: savi init <case-name> [--template congress]");
  const template = readOption(args, "--template") === "congress" || caseName === "congress" ? "congress" : "blank";
  const store = await createCase(caseName, cwd, template);
  io.stdout(`Created ${template} case at ${store.caseDir}`);
  io.stdout(`Primary note: ${path.relative(cwd, store.notePath)}`);
  return { exitCode: 0 };
}

async function addCommand(args: string[], cwd: string, io: CliIO): Promise<CommandResult> {
  const kind = required(args[0], "Usage: savi add <entity|relation|event> ...");

  if (kind === "entity") {
    const type = required(args[1], "Usage: savi add entity <person|org|place|asset> <name>");
    if (!isEntityType(type)) {
      throw new Error(`Unknown entity type: ${type}`);
    }
    const name = required(args.slice(2).join(" "), "Usage: savi add entity <person|org|place|asset> <name>");
    const line = `[${type}] ${name}`;
    const notePath = await appendLine(cwd, line);
    io.stdout(`Added entity: ${line}`);
    io.stdout(`Wrote ${path.relative(cwd, notePath)}`);
    return { exitCode: 0 };
  }

  if (kind === "relation") {
    const source = required(args[1], "Usage: savi add relation <source> <target> <label>");
    const target = required(args[2], "Usage: savi add relation <source> <target> <label>");
    const label = required(args.slice(3).join(" "), "Usage: savi add relation <source> <target> <label>");
    const line = `${source} -> ${target} : ${label}`;
    const notePath = await appendLine(cwd, line);
    io.stdout(`Added relation: ${line}`);
    io.stdout(`Wrote ${path.relative(cwd, notePath)}`);
    return { exitCode: 0 };
  }

  if (kind === "event") {
    const date = required(args[1], "Usage: savi add event <date> <label> <participant...> --location <place>");
    const label = required(args[2], "Usage: savi add event <date> <label> <participant...> --location <place>");
    const location = readOption(args, "--location");
    const participants = positionalBeforeOption(args.slice(3), "--location");
    if (participants.length === 0) {
      throw new Error("Usage: savi add event <date> <label> <participant...> --location <place>");
    }
    const payload = location ? [...participants, location] : participants;
    const line = `${date} | ${label} | ${payload.join(" | ")}`;
    const notePath = await appendLine(cwd, line);
    io.stdout(`Added event: ${line}`);
    io.stdout(`Wrote ${path.relative(cwd, notePath)}`);
    return { exitCode: 0 };
  }

  throw new Error(`Unknown add command: ${kind}`);
}

async function congressCommand(args: string[], cwd: string, io: CliIO): Promise<CommandResult> {
  const command = required(args[0], "Usage: savi congress <add-legislator|add-committee|add-bill|add-vote|add-donor|dossier> ...");

  if (command === "add-legislator") {
    const name = required(args[1], "Usage: savi congress add-legislator <name> [--state NY] [--district 14] [--party D]");
    const state = readOption(args, "--state");
    const district = readOption(args, "--district");
    const party = readOption(args, "--party");
    await appendEntityIfMissing(cwd, "person", name, "congress.link.md");
    if (state) {
      await appendEntityIfMissing(cwd, "place", state, "congress.link.md");
      await appendLine(cwd, `${name} -> ${state} : represents state`, "congress.link.md");
    }
    if (district) {
      const districtName = state ? `${state}-${district}` : `District ${district}`;
      await appendEntityIfMissing(cwd, "place", districtName, "congress.link.md");
      await appendLine(cwd, `${name} -> ${districtName} : represents district`, "congress.link.md");
    }
    if (party) {
      const partyName = normalizeParty(party);
      await appendEntityIfMissing(cwd, "org", partyName, "congress.link.md");
      await appendLine(cwd, `${name} -> ${partyName} : member of`, "congress.link.md");
    }
    io.stdout(`Added legislator: ${name}`);
    return { exitCode: 0 };
  }

  if (command === "add-committee") {
    const name = required(args[1], "Usage: savi congress add-committee <name> [--chamber house|senate]");
    const chamber = readOption(args, "--chamber");
    await appendEntityIfMissing(cwd, "org", name, "congress.link.md");
    if (chamber) {
      const chamberName = chamber.toLowerCase() === "senate" ? "U.S. Senate" : "U.S. House of Representatives";
      await appendEntityIfMissing(cwd, "org", chamberName, "congress.link.md");
      await appendLine(cwd, `${name} -> ${chamberName} : committee of`, "congress.link.md");
    }
    io.stdout(`Added committee: ${name}`);
    return { exitCode: 0 };
  }

  if (command === "add-bill") {
    const billId = required(args[1], "Usage: savi congress add-bill <bill-id> [--title <title>] [--sponsor <legislator>]");
    const title = readOption(args, "--title");
    const sponsor = readOption(args, "--sponsor");
    const billName = title ? `${billId} - ${title}` : billId;
    await appendEntityIfMissing(cwd, "asset", billName, "congress.link.md");
    if (sponsor) {
      await appendLine(cwd, `${sponsor} -> ${billName} : sponsored`, "congress.link.md");
    }
    io.stdout(`Added bill: ${billName}`);
    return { exitCode: 0 };
  }

  if (command === "add-vote") {
    const legislator = required(args[1], "Usage: savi congress add-vote <legislator> <bill> <yes|no|present|abstain>");
    const bill = required(args[2], "Usage: savi congress add-vote <legislator> <bill> <yes|no|present|abstain>");
    const vote = required(args[3], "Usage: savi congress add-vote <legislator> <bill> <yes|no|present|abstain>");
    await appendLine(cwd, `${legislator} -> ${bill} : voted ${vote}`, "congress.link.md");
    io.stdout(`Added vote: ${legislator} voted ${vote} on ${bill}`);
    return { exitCode: 0 };
  }

  if (command === "add-donor") {
    const donor = required(args[1], "Usage: savi congress add-donor <donor-org> <legislator> [--amount 1000]");
    const legislator = required(args[2], "Usage: savi congress add-donor <donor-org> <legislator> [--amount 1000]");
    const amount = readOption(args, "--amount");
    await appendEntityIfMissing(cwd, "org", donor, "congress.link.md");
    await appendLine(cwd, `${donor} -> ${legislator} : contributed${amount ? ` ${amount}` : ""}`, "congress.link.md");
    io.stdout(`Added donor link: ${donor} -> ${legislator}`);
    return { exitCode: 0 };
  }

  if (command === "dossier") {
    return await dossierCommand(args.slice(1), cwd, io);
  }

  throw new Error(`Unknown congress command: ${command}`);
}

async function validateCommand(cwd: string, io: CliIO): Promise<CommandResult> {
  const result = await getGraph(cwd);
  const issues = [...result.issuesByFile.entries()].flatMap(([filePath, fileIssues]) =>
    fileIssues.map((issue) => ({ filePath, issue }))
  );

  if (issues.length === 0) {
    io.stdout("No issues found.");
    return { exitCode: 0 };
  }

  for (const { filePath, issue } of issues) {
    io.stdout(`${issue.severity.toUpperCase()} ${path.relative(cwd, filePath)}:${issue.line} ${issue.message}`);
  }

  return { exitCode: issues.some(({ issue }) => issue.severity === "error") ? 1 : 0 };
}

async function graphCommand(cwd: string, io: CliIO): Promise<CommandResult> {
  const result = await getGraph(cwd);
  const issueCounts = countIssues(result.issuesByFile);
  io.stdout(`Entities: ${result.graph.entities.length}`);
  io.stdout(`Relationships: ${result.graph.relationships.length}`);
  io.stdout(`Events: ${result.graph.events.length}`);
  io.stdout(`Issues: ${issueCounts.error} errors, ${issueCounts.warning} warnings`);
  return { exitCode: issueCounts.error > 0 ? 1 : 0 };
}

async function exportCommand(args: string[], cwd: string, io: CliIO): Promise<CommandResult> {
  const outputPath = required(args[0], "Usage: savi export <path>");
  const resolvedOutputPath = await exportGraph(cwd, outputPath);
  io.stdout(`Exported graph to ${path.relative(cwd, resolvedOutputPath)}`);
  return { exitCode: 0 };
}

async function chartCommand(args: string[], cwd: string, io: CliIO): Promise<CommandResult> {
  const all = args.includes("--all");
  const outputPath = readOption(args, "--out") ?? "chart.html";
  const depthValue = readOption(args, "--depth");
  const depth = depthValue ? Number.parseInt(depthValue, 10) : 2;
  if (!Number.isFinite(depth) || depth < 1) {
    throw new Error("Chart depth must be a positive number.");
  }

  const nameArgs = args.filter((arg, index) => {
    const previous = args[index - 1];
    return arg !== "--all" && arg !== "--out" && arg !== "--depth" && previous !== "--out" && previous !== "--depth";
  });
  const focusName = all ? undefined : required(nameArgs.join(" "), "Usage: savi chart <entity-name> [--depth 2] [--out chart.html]");
  const result = await getGraph(cwd);
  const resolvedOutputPath = await exportChart(cwd, result.graph, {
    focusName,
    depth,
    outputPath
  });
  io.stdout(`Wrote chart to ${path.relative(cwd, resolvedOutputPath)}`);
  return { exitCode: 0 };
}

async function dossierCommand(args: string[], cwd: string, io: CliIO): Promise<CommandResult> {
  const name = required(args.join(" "), "Usage: savi dossier <entity-name>");
  const result = await getGraph(cwd);
  io.stdout(formatDossier(result.graph, name));
  return { exitCode: 0 };
}

function formatDossier(graph: GraphModel, name: string): string {
  const entity = graph.entities.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!entity) {
    throw new Error(`No entity found named "${name}".`);
  }

  const entityById = new Map(graph.entities.map((item) => [item.id, item]));
  const relationships = graph.relationships.filter(
    (relationship) => relationship.sourceId === entity.id || relationship.targetId === entity.id
  );
  const events = graph.events.filter(
    (event) => event.participants.includes(entity.name) || event.location === entity.name
  );

  const lines = [`${entity.name}`, `${entity.type} | ${entity.filePath}:${entity.line}`, ""];
  lines.push("Relationships:");
  lines.push(
    ...(relationships.length > 0
      ? relationships.map((relationship) => {
          const source = entityById.get(relationship.sourceId)?.name ?? relationship.sourceId;
          const target = entityById.get(relationship.targetId)?.name ?? relationship.targetId;
          return `- ${source} -> ${target} : ${relationship.label}`;
        })
      : ["- none"])
  );
  lines.push("", "Events:");
  lines.push(
    ...(events.length > 0
      ? events.map((event) => `- ${event.date} | ${event.label} | ${[...event.participants, event.location].filter(Boolean).join(" | ")}`)
      : ["- none"])
  );

  return lines.join("\n");
}

function readOption(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function positionalBeforeOption(args: string[], option: string): string[] {
  const optionIndex = args.indexOf(option);
  return optionIndex === -1 ? args : args.slice(0, optionIndex);
}

function required(value: string | undefined, usage: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(usage);
  }
  return value;
}

function isEntityType(value: string): value is EntityType {
  return ENTITY_TYPES.has(value as EntityType);
}

function normalizeParty(party: string): string {
  const normalized = party.toLowerCase();
  if (normalized === "d" || normalized === "dem" || normalized === "democrat") {
    return "Democratic Party";
  }
  if (normalized === "r" || normalized === "gop" || normalized === "republican") {
    return "Republican Party";
  }
  return party;
}

function countIssues(issuesByFile: Map<string, { severity: IssueSeverity }[]>): Record<IssueSeverity, number> {
  const counts: Record<IssueSeverity, number> = { error: 0, warning: 0 };
  for (const issues of issuesByFile.values()) {
    for (const issue of issues) {
      counts[issue.severity] += 1;
    }
  }
  return counts;
}

function helpText(): string {
  return [
    "Savi: local-first network analysis for institutions.",
    "",
    "Generic commands:",
    "  savi init <case-name> [--template congress]",
    "  savi add entity <person|org|place|asset> <name>",
    "  savi add relation <source> <target> <label>",
    "  savi add event <date> <label> <participant...> --location <place>",
    "  savi validate",
    "  savi graph",
    "  savi dossier <entity-name>",
    "  savi export <path>",
    "  savi chart <entity-name> [--depth 2] [--out chart.html]",
    "  savi chart --all [--out chart.html]",
    "",
    "Congress commands:",
    "  savi congress add-legislator <name> [--state NY] [--district 14] [--party D]",
    "  savi congress add-committee <name> [--chamber house|senate]",
    "  savi congress add-bill <bill-id> [--title <title>] [--sponsor <legislator>]",
    "  savi congress add-vote <legislator> <bill> <yes|no|present|abstain>",
    "  savi congress add-donor <donor-org> <legislator> [--amount 1000]",
    "  savi congress dossier <entity-name>"
  ].join("\n");
}
