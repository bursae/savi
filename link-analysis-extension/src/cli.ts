#!/usr/bin/env node
import { runCli } from "./cli/saviCli";

void runCli(process.argv.slice(2), process.cwd(), {
  stdout: (message) => process.stdout.write(`${message}\n`),
  stderr: (message) => process.stderr.write(`${message}\n`)
}).then((result) => {
  process.exitCode = result.exitCode;
});
