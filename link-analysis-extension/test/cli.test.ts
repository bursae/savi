import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { runCli } from "../src/cli/saviCli";

interface CapturedCli {
  stdout: string[];
  stderr: string[];
}

async function withTempDir(test: (dir: string, output: CapturedCli) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "savi-cli-"));
  const output: CapturedCli = { stdout: [], stderr: [] };
  await test(dir, output);
}

async function run(argv: string[], cwd: string, output: CapturedCli): Promise<number> {
  const result = await runCli(argv, cwd, {
    stdout: (message) => output.stdout.push(message),
    stderr: (message) => output.stderr.push(message)
  });
  return result.exitCode;
}

describe("savi CLI", () => {
  it("creates a congress case and records a legislator dossier", async () => {
    await withTempDir(async (dir, output) => {
      expect(await run(["init", "congress"], dir, output)).toBe(0);

      const caseDir = path.join(dir, "congress");
      expect(await run(["congress", "add-legislator", "Rep. Jane Doe", "--state", "NY", "--district", "14", "--party", "D"], caseDir, output)).toBe(0);
      expect(await run(["congress", "add-committee", "House Committee on Oversight", "--chamber", "house"], caseDir, output)).toBe(0);
      expect(await run(["add", "relation", "Rep. Jane Doe", "House Committee on Oversight", "member of"], caseDir, output)).toBe(0);
      expect(await run(["congress", "dossier", "Rep. Jane Doe"], caseDir, output)).toBe(0);

      expect(output.stdout.join("\n")).toContain("Rep. Jane Doe -> NY : represents state");
      expect(output.stdout.join("\n")).toContain("Rep. Jane Doe -> House Committee on Oversight : member of");
    });
  });

  it("returns non-zero validation status for unresolved references", async () => {
    await withTempDir(async (dir, output) => {
      expect(await run(["init", "case"], dir, output)).toBe(0);
      const caseDir = path.join(dir, "case");
      expect(await run(["add", "relation", "Known Person", "Missing Org", "advisor"], caseDir, output)).toBe(0);

      expect(await run(["validate"], caseDir, output)).toBe(1);
      expect(output.stdout.join("\n")).toContain('Unknown entity referenced in relationship source: "Known Person".');
      expect(output.stdout.join("\n")).toContain('Unknown entity referenced in relationship target: "Missing Org".');
    });
  });

  it("exports graph JSON", async () => {
    await withTempDir(async (dir, output) => {
      expect(await run(["init", "case"], dir, output)).toBe(0);
      const caseDir = path.join(dir, "case");
      expect(await run(["add", "entity", "person", "John Smith"], caseDir, output)).toBe(0);
      expect(await run(["export", "graph.json"], caseDir, output)).toBe(0);

      const exported = JSON.parse(await fs.readFile(path.join(caseDir, "graph.json"), "utf8")) as {
        entities: Array<{ name: string }>;
      };
      expect(exported.entities).toEqual([expect.objectContaining({ name: "John Smith" })]);
    });
  });

  it("exports a focused HTML chart", async () => {
    await withTempDir(async (dir, output) => {
      expect(await run(["init", "case"], dir, output)).toBe(0);
      const caseDir = path.join(dir, "case");
      expect(await run(["add", "entity", "person", "John Smith"], caseDir, output)).toBe(0);
      expect(await run(["add", "entity", "org", "Acme Holdings"], caseDir, output)).toBe(0);
      expect(await run(["add", "relation", "John Smith", "Acme Holdings", "director"], caseDir, output)).toBe(0);
      expect(await run(["chart", "John Smith", "--out", "john-chart.html"], caseDir, output)).toBe(0);

      const html = await fs.readFile(path.join(caseDir, "john-chart.html"), "utf8");
      expect(html).toContain("John Smith - Savi Chart");
      expect(html).toContain("Acme Holdings");
    });
  });
});
