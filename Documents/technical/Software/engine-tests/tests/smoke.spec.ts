import { runCliFromArgv } from "@reasontracker/engine";
import { describe, expect, test } from "vitest";
import acyclicBasic from "../fixtures/cli/acyclic-basic.json";
import cycleError from "../fixtures/cli/cycle-error.json";
import forceConfidenceZero from "../fixtures/cli/force-confidence-zero.json";
import legacyRelevanceIgnoredForConfidence from "../fixtures/cli/legacy-relevance-child-ignored-for-confidence.json";
import legacySlightlyComplex from "../fixtures/cli/legacy-slightly-complex.json";
import legacySimpleProConTie from "../fixtures/cli/legacy-simple-pro-con-tie.json";
import legacyTwoProOneCon from "../fixtures/cli/legacy-two-pro-one-con.json";
import simulateAllSingleCuts from "../fixtures/cli/simulate-all-single-cuts.json";
import simulateLimitExceeded from "../fixtures/cli/simulate-limit-exceeded.json";

interface FixtureFile {
  name: string;
  argv: string[];
  stdin: unknown;
  expect: {
    exitCode: number;
    ok: boolean;
    errorCode?: string;
    sccClaimIds?: string[][];
    detailsChecks?: Record<string, number>;
    simulationsCount?: number;
    scoreChecks?: Record<string, { confidence?: number }>;
  };
}

describe("engine CLI fixture tests", () => {
  const fixtures: FixtureFile[] = [
    acyclicBasic as FixtureFile,
    cycleError as FixtureFile,
    forceConfidenceZero as FixtureFile,
    legacyRelevanceIgnoredForConfidence as FixtureFile,
    legacySlightlyComplex as FixtureFile,
    legacySimpleProConTie as FixtureFile,
    simulateAllSingleCuts as FixtureFile,
    simulateLimitExceeded as FixtureFile,
    legacyTwoProOneCon as FixtureFile,
  ];

  for (const fixture of fixtures) {
    test(fixture.name, () => {
      const result = runCliFromArgv(fixture.argv, JSON.stringify(fixture.stdin));
      expect(result.exitCode).toBe(fixture.expect.exitCode);

      const response = JSON.parse(result.stdout) as any;
      expect(Boolean(response.ok)).toBe(fixture.expect.ok);

      if (fixture.expect.ok) {
        if (fixture.expect.simulationsCount !== undefined) {
          expect(Array.isArray(response.simulations)).toBe(true);
          expect(response.simulations.length).toBe(fixture.expect.simulationsCount);
        }

        for (const [claimId, checks] of Object.entries(fixture.expect.scoreChecks ?? {})) {
          if (checks.confidence !== undefined) {
            expect(response.calculatedDebate.scores[claimId].confidence).toBeCloseTo(checks.confidence, 10);
          }
        }
        return;
      }

      if (fixture.expect.errorCode) {
        expect(response.error.code).toBe(fixture.expect.errorCode);
      }
      if (fixture.expect.sccClaimIds) {
        expect(response.error.sccClaimIds).toEqual(fixture.expect.sccClaimIds);
      }
      if (fixture.expect.detailsChecks) {
        for (const [key, value] of Object.entries(fixture.expect.detailsChecks)) {
          expect(response.error.details?.[key]).toBe(value);
        }
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

  test("resolves a cycle in cut mode", () => {
    const result = runCliFromArgv(
      ["calculateDebate"],
      JSON.stringify({
        debate: (cycleError as any).stdin.debate,
        cycleHandling: "cut",
      }),
    );

    expect(result.exitCode).toBe(0);
    const response = JSON.parse(result.stdout) as any;
    expect(response.ok).toBe(true);
    expect(response.calculatedDebate?.scores).toBeDefined();
  });

  test("returns averaged calculatedDebate and simulations in simulate mode", () => {
    const result = runCliFromArgv(
      ["calculateDebate"],
      JSON.stringify({
        debate: (cycleError as any).stdin.debate,
        cycleHandling: "simulateAllSingleCuts",
      }),
    );

    expect(result.exitCode).toBe(0);
    const response = JSON.parse(result.stdout) as any;
    expect(response.ok).toBe(true);
    expect(response.calculatedDebate?.scores).toBeDefined();
    expect(Array.isArray(response.simulations)).toBe(true);
    expect(response.simulations.length).toBeGreaterThan(0);
  });

  test("derives connector relation from claim side changes", () => {
    const baseDebate = {
      id: "side-derivation",
      name: "side derivation",
      description: "",
      mainClaimId: "A",
      claims: {
        A: { id: "A", content: "main", side: "proMain" },
        B: { id: "B", content: "child", side: "proMain" },
      },
      connectors: {
        c1: { id: "c1", source: "B", target: "A", affects: "confidence" },
      },
    };

    const proAlignedResult = runCliFromArgv(
      ["calculateDebate"],
      JSON.stringify({ debate: baseDebate }),
    );
    const proAlignedResponse = JSON.parse(proAlignedResult.stdout) as any;
    expect(proAlignedResponse.ok).toBe(true);
    expect(proAlignedResponse.calculatedDebate.scores.A.confidence).toBeCloseTo(1, 10);

    const flippedSourceResult = runCliFromArgv(
      ["calculateDebate"],
      JSON.stringify({
        debate: {
          ...baseDebate,
          claims: {
            ...baseDebate.claims,
            B: { ...baseDebate.claims.B, side: "conMain" },
          },
        },
      }),
    );
    const flippedSourceResponse = JSON.parse(flippedSourceResult.stdout) as any;
    expect(flippedSourceResponse.ok).toBe(true);
    expect(flippedSourceResponse.calculatedDebate.scores.A.confidence).toBeCloseTo(0, 10);
    expect(flippedSourceResponse.calculatedDebate.scores.A.reversibleConfidence).toBeCloseTo(-1, 10);
  });
});
