import * as fs from "fs/promises";
import * as path from "path";
import { buildGraph, GraphBuildResult } from "../graph/graphBuilder";
import { ParsedFile } from "../models/types";
import { parseLinkFile } from "../parser/parser";

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "out", "webview"]);

export interface CaseStore {
  caseDir: string;
  notePath: string;
}

export async function createCase(caseName: string, baseDir: string, template: "blank" | "congress"): Promise<CaseStore> {
  const caseDir = path.resolve(baseDir, caseName);
  const notePath = path.join(caseDir, template === "congress" ? "congress.link.md" : "case.link.md");

  await fs.mkdir(caseDir, { recursive: true });

  const starter =
    template === "congress"
      ? [
          "# Savi Congress Case",
          "",
          "[org] U.S. House of Representatives",
          "[org] U.S. Senate",
          "[place] United States",
          "",
          "# Add legislators, committees, bills, donors, votes, and events below."
        ].join("\n")
      : ["# Savi Case", "", "# Add people, organizations, places, assets, relationships, and events below."].join("\n");

  await fs.writeFile(notePath, `${starter}\n`, { encoding: "utf8", flag: "wx" });
  return { caseDir, notePath };
}

export async function appendLine(caseDir: string, line: string, preferredFile = "case.link.md"): Promise<string> {
  const notePath = await getWritableNotePath(caseDir, preferredFile);
  await fs.appendFile(notePath, `${line}\n`, "utf8");
  return notePath;
}

export async function appendEntityIfMissing(
  caseDir: string,
  type: "person" | "org" | "place" | "asset",
  name: string,
  preferredFile = "case.link.md"
): Promise<boolean> {
  const result = await getGraph(caseDir);
  const exists = result.graph.entities.some((entity) => entity.name.toLowerCase() === name.toLowerCase());
  if (exists) {
    return false;
  }

  await appendLine(caseDir, `[${type}] ${name}`, preferredFile);
  return true;
}

export async function getGraph(caseDir: string): Promise<GraphBuildResult> {
  const parsedFiles = await loadParsedFiles(caseDir);
  return buildGraph(parsedFiles);
}

export async function exportGraph(caseDir: string, outputPath: string): Promise<string> {
  const result = await getGraph(caseDir);
  const resolvedOutputPath = path.resolve(caseDir, outputPath);
  await fs.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await fs.writeFile(resolvedOutputPath, JSON.stringify(result.graph, null, 2), "utf8");
  return resolvedOutputPath;
}

async function getWritableNotePath(caseDir: string, preferredFile: string): Promise<string> {
  const files = await findLinkFiles(caseDir);
  if (files.length > 0) {
    return files[0];
  }

  const notePath = path.resolve(caseDir, preferredFile);
  await fs.mkdir(path.dirname(notePath), { recursive: true });
  await fs.writeFile(notePath, "# Savi Case\n\n", "utf8");
  return notePath;
}

async function loadParsedFiles(caseDir: string): Promise<ParsedFile[]> {
  const files = await findLinkFiles(caseDir);
  return Promise.all(
    files.map(async (filePath) => {
      const content = await fs.readFile(filePath, "utf8");
      return parseLinkFile(filePath, content);
    })
  );
}

async function findLinkFiles(rootDir: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          await walk(entryPath);
        }
        continue;
      }

      if (entry.isFile() && entry.name.endsWith(".link.md")) {
        files.push(entryPath);
      }
    }
  }

  await walk(path.resolve(rootDir));
  return files.sort();
}
