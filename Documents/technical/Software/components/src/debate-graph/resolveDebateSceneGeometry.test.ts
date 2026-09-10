import { describe, expect, it } from "vitest";
import type { ClaimId } from "@debate-core/Claim.ts";
import type { ConfidenceConnectorId } from "@debate-core/Connector.ts";
import type {
	DebateFrame,
} from "@planner/DebateAnimationPlan.ts";
import type {
	PresentationClaimOccurrenceId,
	PresentationConnectorOccurrenceId,
} from "@planner/buildPresentationGraphFromDebateCore.ts";
import { defaultPlannerOptions } from "@planner/contracts.ts";
import { resolveDebateSceneGeometry } from "./resolveDebateSceneGeometry";

describe("resolveDebateSceneGeometry", () => {
	it("uses the exact claim-edge ports for a complete connector band", () => {
		const targetId = "claim:target" as PresentationClaimOccurrenceId;
		const sourceId = "claim:target/confidence:c1/claim:source" as PresentationClaimOccurrenceId;
		const connectionId = "claim:target/confidence:c1" as PresentationConnectorOccurrenceId;
		const frame: DebateFrame = {
			claims: {
				[targetId]: {
					claimId: "target" as ClaimId,
					id: targetId,
					opacity: 1,
					position: { x: 180, y: 240 },
					rawScore: 0.5,
					scale: 1,
					score: 0.5,
					side: "proMain",
					sourcesScale: 1,
				},
				[sourceId]: {
					claimId: "source" as ClaimId,
					id: sourceId,
					opacity: 1,
					position: { x: 900, y: 240 },
					rawScore: 1,
					scale: 0.5,
					score: 1,
					side: "conMain",
					sourcesScale: 0.5,
				},
			},
			confidenceConnections: {
				[connectionId]: {
					confidenceConnectorId: "c1" as ConfidenceConnectorId,
					deliveryScore: 1,
					deliveryScale: 0.5,
					id: connectionId,
					relevanceMultiplier: 1,
					relevanceConnectorOccurrenceIds: [],
					score: 1,
					shellReveal: 1,
					side: "conMain",
					sourceClaimOccurrenceId: sourceId,
					sourceScale: 0.5,
					targetClaimOccurrenceId: targetId,
					targetSideOffset: 0,
					volumeTransitions: [],
				},
			},
			relevanceConnections: {},
		};

		const geometry = resolveDebateSceneGeometry({
			frame,
			options: defaultPlannerOptions,
		});

		expect(geometry.bands).toHaveLength(1);
		expect(geometry.bands[0]).toMatchObject({
			diagnosticIssues: [],
			sourcePort: { center: { x: 810, y: 240 } },
			targetPort: { center: { x: 396, y: 240 } },
		});
		expect(geometry.deliveryAggregators).toHaveLength(1);
		expect(geometry.bands[0]?.shellPathData).not.toBe("");
		expect(geometry.bands[0]?.fluidPathData).not.toBe("");
	});
});