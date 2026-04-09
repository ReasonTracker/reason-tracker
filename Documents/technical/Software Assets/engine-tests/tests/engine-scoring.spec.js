import { describe, expect, test } from "vitest";

import {
  calculateConfidence,
  calculateRelevance,
  calculateScores
} from "../src/engine/scoring.js";

describe("engine scoring", () => {
  test("calculateConfidence returns 1 when no confidence children", () => {
    expect(calculateConfidence([])).toEqual({
      confidence: 1,
      reversibleConfidence: 1
    });
  });

  test("calculateConfidence balances one pro and one con to zero confidence", () => {
    const children = [
      {
        score: { confidence: 1, relevance: 1 },
        connector: { proTarget: true, affects: "confidence" }
      },
      {
        score: { confidence: 1, relevance: 1 },
        connector: { proTarget: false, affects: "confidence" }
      }
    ];

    expect(calculateConfidence(children)).toEqual({
      confidence: 0,
      reversibleConfidence: 0
    });
  });

  test("calculateRelevance uses additive pro and subtractive con behavior", () => {
    const children = [
      {
        score: { confidence: 0.6 },
        connector: { proTarget: true, affects: "relevance" }
      },
      {
        score: { confidence: 0.4 },
        connector: { proTarget: false, affects: "relevance" }
      }
    ];

    expect(calculateRelevance(children)).toBeCloseTo(1.4, 8);
  });

  test("calculateScores computes parent from child connectors", () => {
    const debateData = {
      claims: {
        root: { id: "root", type: "claim", content: "Root", pol: "pro" },
        childA: { id: "childA", type: "claim", content: "A", pol: "pro" },
        childB: { id: "childB", type: "claim", content: "B", pol: "con" }
      },
      connectors: {
        c1: {
          id: "c1",
          type: "connector",
          source: "childA",
          target: "root",
          proTarget: true,
          affects: "confidence"
        },
        c2: {
          id: "c2",
          type: "connector",
          source: "childB",
          target: "root",
          proTarget: false,
          affects: "confidence"
        }
      }
    };

    const scores = calculateScores(debateData);

    expect(scores.childA.confidence).toBe(1);
    expect(scores.childB.confidence).toBe(1);
    expect(scores.root.confidence).toBe(0);
    expect(scores.root.reversibleConfidence).toBe(0);
    expect(scores.root.relevance).toBe(1);
  });
});
