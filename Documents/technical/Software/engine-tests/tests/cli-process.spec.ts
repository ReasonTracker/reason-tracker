import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const THIS_DIR = fileURLToPath(new URL(".", import.meta.url));
const ENGINE_TESTS_ROOT = resolve(THIS_DIR, "..");
const SOFTWARE_ASSETS_ROOT = resolve(ENGINE_TESTS_ROOT, "..");

interface ProcessFixture {
  name: string;
  argv: string[];
  stdin: unknown;
  expect: {
    exitCode: number;
    ok: boolean;
    errorCode?: string;
  };
}

describe("engine CLI process integration", () => {
  test("runs calculateDebate from a real process", () => {
    const fixture = readFixture("acyclic-basic.json");
    const result = runCliProcess(fixture.argv, fixture.stdin);

    expect(result.status).toBe(fixture.expect.exitCode);

    const response = JSON.parse(result.stdout || "{}") as any;
    expect(Boolean(response.ok)).toBe(true);
    expect(response.command).toBe("calculateDebate");
    expect(response.calculatedDebate.scores.A.confidence).toBe(1);
  });

  test("returns INVALID_REQUEST from a real process", () => {
    const result = runCliProcess(["calculateDebate"], {});

    expect(result.status).toBe(2);
    const response = JSON.parse(result.stdout || "{}") as any;
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("INVALID_REQUEST");
  });
});

function runCliProcess(argv: string[], stdinPayload: unknown) {
  const cliMainPath = resolve(SOFTWARE_ASSETS_ROOT, "engine", "src", "cli", "cli-main.ts");
  return spawnSync(
    process.execPath,
    ["--experimental-strip-types", cliMainPath, ...argv],
    {
      cwd: ENGINE_TESTS_ROOT,
      input: JSON.stringify(stdinPayload),
      encoding: "utf8",
    },
  );
}

function readFixture(fileName: string): ProcessFixture {
  const fullPath = join(ENGINE_TESTS_ROOT, "fixtures", "cli", fileName);
  return JSON.parse(readFileSync(fullPath, "utf8")) as ProcessFixture;
}
