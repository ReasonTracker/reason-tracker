import path from "node:path";
import { describe, expect, test } from "vitest";

import { runConformanceCase } from "../src/contract/conformance.js";
import { loadFixtures } from "../src/contract/loadFixtures.js";
import { referenceAdapter } from "../src/adapters/referenceAdapter.js";

const fixturesDir = path.resolve(process.cwd(), "fixtures");
const cases = loadFixtures(fixturesDir);

describe("engine step contract", () => {
  test("loads JSON and JSONL fixtures", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const fixtureCase of cases) {
    test(`${fixtureCase.id} (${fixtureCase._source})`, () => {
      runConformanceCase(referenceAdapter, fixtureCase);
    });
  }
});
