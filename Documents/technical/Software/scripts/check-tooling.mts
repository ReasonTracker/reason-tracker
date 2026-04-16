import { spawnSync } from "node:child_process";

if (process.env.CI) {
  process.stdout.write("CI environment detected. Skipping local shell tooling check.\n");
  process.exit(0);
}

const requiredTools = [
  {
    command: "rg",
    displayName: "ripgrep",
    helpText:
      "Run vp run developer:setup-machine from Documents/technical/Software, or use the direct PowerShell script if Vite Plus is not available yet.",
    required: true,
    versionArgs: ["--version"],
  },
  {
    command: "fd",
    displayName: "fd",
    helpText:
      "Run vp run developer:setup-machine from Documents/technical/Software, or use the direct PowerShell script if Vite Plus is not available yet, to install it too.",
    required: false,
    versionArgs: ["--version"],
  },
] as const;

let hasFailure = false;

for (const tool of requiredTools) {
  const result = spawnSync(tool.command, tool.versionArgs, {
    encoding: "utf8",
  });

  if (result.error || result.status !== 0) {
    const level = tool.required ? "ERROR" : "WARN";
    const message = `${level}: ${tool.displayName} (${tool.command}) is not available.`;

    process.stdout.write(`${message}\n`);
    process.stdout.write(`${tool.helpText}\n`);

    if (tool.required) {
      hasFailure = true;
    }

    continue;
  }

  const firstLine = `${result.stdout ?? ""}`.trim().split(/\r?\n/u)[0] ?? "version available";
  process.stdout.write(`OK: ${tool.displayName} (${tool.command}) -> ${firstLine}\n`);
}

if (hasFailure) {
  process.exitCode = 1;
} else {
  process.stdout.write("Tooling check passed.\n");
}