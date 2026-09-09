import { describe, expect, it } from "vitest";
import type { AddConfidenceClaimCommand } from "../debate-core/Commands.ts";
import type { Claim, ClaimId } from "../debate-core/Claim.ts";
import type {
	ConfidenceConnector,
	ConfidenceConnectorId,
	Connector,
} from "../debate-core/Connector.ts";
import type { DebateCore, DebateId } from "../debate-core/Debate.ts";
import { buildPresentationGraphFromDebateCore } from "./buildPresentationGraphFromDebateCore.ts";
import { resolveAnimationFrame } from "./DebateAnimationPlan.ts";
import { planDebateAnimation, planStaticDebate } from "./planDebateAnimation.ts";

describe("buildPresentationGraphFromDebateCore", () => {
	it("emits a repeated ancestor claim once and stops only that branch", () => {
		const debate = createDebate({
			claims: ["a", "b", "c"],
			connectors: [
				confidence("conFirst", "b", "a", "conTarget"),
				confidence("proLast", "c", "a", "proTarget"),
				confidence("back", "a", "b", "proTarget"),
			],
		});

		const graph = buildPresentationGraphFromDebateCore(debate);
		const root = graph.claimOccurrences[graph.rootClaimOccurrenceId];
		const rootConnectorIds = root.confidenceConnectorOccurrenceIds.map((occurrenceId) => {
			const occurrence = graph.connectorOccurrences[occurrenceId];
			return occurrence.type === "confidence"
				? String(occurrence.confidenceConnectorId)
				: "unexpected-relevance";
		});
		const terminalClaims = Object.values(graph.claimOccurrences)
			.filter((occurrence) => occurrence.terminal);

		expect(rootConnectorIds).toEqual(["proLast", "conFirst"]);
		expect(terminalClaims).toEqual([
			expect.objectContaining({
				claimId: claimId("a"),
				id: "claim:a/confidence:conFirst/claim:b/confidence:back/claim:a",
				terminal: true,
			}),
		]);
		expect(Object.keys(graph.claimOccurrences)).toHaveLength(4);
		expect(Object.keys(graph.connectorOccurrences)).toHaveLength(3);
	});
});

describe("planDebateAnimation", () => {
	it("positions delivery shells from ordered fluid intervals, including zero width", () => {
		const debate = createDebate({
			claims: ["a", "b", "c", "d"],
			connectors: [
				confidence("ab", "b", "a", "proTarget"),
				confidence("ac", "c", "a", "conTarget"),
				confidence("bd", "d", "b", "conTarget"),
			],
		});

		const frame = planStaticDebate({ debateCore: debate }).openingFrame;
		const rootConnections = Object.values(frame.confidenceConnections)
			.filter((connection) => connection.targetClaimOccurrenceId === "claim:a");
		const zeroConnection = rootConnections.find(
			(connection) => connection.confidenceConnectorId === "ab",
		);
		const fullConnection = rootConnections.find(
			(connection) => connection.confidenceConnectorId === "ac",
		);

		expect(zeroConnection).toMatchObject({
			deliveryScore: 0,
			deliveryScale: 1,
			targetSideOffset: -176,
		});
		expect(fullConnection).toMatchObject({
			deliveryScore: 1,
			deliveryScale: 1,
			targetSideOffset: 0,
		});
	});

	it("keeps named step boundaries continuous through First Fill", () => {
		const debate = createDebate({
			claims: ["a", "b"],
			connectors: [confidence("ab", "b", "a", "proTarget")],
		});
		const command: AddConfidenceClaimCommand = {
			claim: { content: "c", id: claimId("c") },
			connector: {
				id: "ac" as ConfidenceConnectorId,
				targetClaimId: claimId("a"),
				targetRelationship: "conTarget",
				type: "confidence",
			},
			type: "confidence/claim/add",
		};

		const plan = planDebateAnimation({ command, debateCore: debate });
		const voilaEnd = resolveAnimationFrame(plan, "voila", 1);
		const sproutEnd = resolveAnimationFrame(plan, "sprout", 1);
		const firstFillEnd = resolveAnimationFrame(plan, "firstFill", 1);
		const addedConnection = Object.values(firstFillEnd.confidenceConnections)
			.find((connection) => connection.confidenceConnectorId === command.connector.id);

		expect(voilaEnd).toEqual(plan.steps.sprout.initialFrame);
		expect(sproutEnd).toEqual(plan.steps.firstFill.initialFrame);
		expect(addedConnection).toMatchObject({ score: 1, shellReveal: 1, volumeTransitions: [
			expect.objectContaining({ finalValue: 1, initialValue: 0, progress: 1 }),
		] });
	});

	it("derives nonlinear Wave layout from the interpolated logical score", () => {
		const debate = createDebate({
			claims: ["a", "b", "e"],
			connectors: [
				confidence("ab", "b", "a", "proTarget"),
				confidence("ae", "e", "a", "conTarget"),
			],
		});
		const command: AddConfidenceClaimCommand = {
			claim: { content: "c", id: claimId("c") },
			connector: {
				id: "bc" as ConfidenceConnectorId,
				targetClaimId: claimId("b"),
				targetRelationship: "conTarget",
				type: "confidence",
			},
			type: "confidence/claim/add",
		};

		const midpoint = resolveAnimationFrame(
			planDebateAnimation({ command, debateCore: debate }),
			"wave",
			0.5,
		);
		const rootConnections = Object.values(midpoint.confidenceConnections)
			.filter((connection) => connection.targetClaimOccurrenceId === "claim:a");
		const changingConnection = rootConnections.find(
			(connection) => connection.confidenceConnectorId === "ab",
		);

		expect(changingConnection?.deliveryScore).toBeCloseTo(0.5);
		for (const connection of rootConnections) {
			expect(connection.sourceScale).toBeCloseTo(2 / 3);
			expect(connection.deliveryScale).toBeCloseTo(2 / 3);
		}
	});
});

function createDebate(args: {
	claims: string[]
	connectors: Connector[]
}): DebateCore {
	return {
		claims: Object.fromEntries(args.claims.map((id) => [claimId(id), createClaim(id)])) as DebateCore["claims"],
		connectors: Object.fromEntries(args.connectors.map((connector) => [connector.id, connector])) as DebateCore["connectors"],
		description: "",
		id: "debate" as DebateId,
		mainClaimId: claimId("a"),
		name: "Debate",
	};
}

function createClaim(id: string): Claim {
	return { content: id, id: claimId(id) };
}

function confidence(
	id: string,
	source: string,
	targetClaimId: string,
	targetRelationship: ConfidenceConnector["targetRelationship"],
): ConfidenceConnector {
	return {
		id: id as ConfidenceConnectorId,
		source: claimId(source),
		targetClaimId: claimId(targetClaimId),
		targetRelationship,
		type: "confidence",
	};
}

function claimId(id: string): ClaimId {
	return id as ClaimId;
}