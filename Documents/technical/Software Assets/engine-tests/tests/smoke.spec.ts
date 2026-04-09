import { runCliFromArgv } from "@reasontracker/engine";
import { describe, expect, test } from "vitest";
import acyclicBasic from "../fixtures/cli/acyclic-basic.json";
import cycleError from "../fixtures/cli/cycle-error.json";
import forceConfidenceZero from "../fixtures/cli/force-confidence-zero.json";

interface FixtureFile {
  name: string;
  argv: string[];
  stdin: unknown;
  expect: {
    exitCode: number;
    ok: boolean;
    errorCode?: string;
    cycleClaimIds?: string[];
    scoreChecks?: Record<string, { confidence?: number }>;
  };
}

describe("engine CLI fixture tests", () => {
  const fixtures: FixtureFile[] = [
    acyclicBasic as FixtureFile,
    cycleError as FixtureFile,
    forceConfidenceZero as FixtureFile,
  ];

  for (const fixture of fixtures) {
    test(fixture.name, () => {
      const result = runCliFromArgv(fixture.argv, JSON.stringify(fixture.stdin));
      expect(result.exitCode).toBe(fixture.expect.exitCode);

      const response = JSON.parse(result.stdout) as any;
      expect(Boolean(response.ok)).toBe(fixture.expect.ok);

      if (fixture.expect.ok) {
        for (const [claimId, checks] of Object.entries(fixture.expect.scoreChecks ?? {})) {
          if (checks.confidence !== undefined) {
            expect(response.debate.scores[claimId].confidence).toBe(checks.confidence);
          }
        }
        return;
      }

      if (fixture.expect.errorCode) {
        expect(response.error.code).toBe(fixture.expect.errorCode);
      }
      if (fixture.expect.cycleClaimIds) {
        expect(response.error.cycleClaimIds).toEqual(fixture.expect.cycleClaimIds);
      }
    });
  }

  test("returns INVALID_REQUEST for missing debate payload", () => {
    const result = runCliFromArgv(["calculateDebate"], JSON.stringify({}));

    expect(result.exitCode).toBe(2);
    const response = JSON.parse(result.stdout) as any;
    expect(response.ok).toBe(false);
    expect(response.error.code).toBe("INVALID_REQUEST");
  });
});
