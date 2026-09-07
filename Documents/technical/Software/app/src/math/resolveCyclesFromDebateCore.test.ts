import { describe, expect, it } from "vitest";
import type { Claim, ClaimId } from "../debate-core/Claim.ts";
import type {
	ConfidenceConnector,
	ConfidenceConnectorId,
	Connector,
	ConnectorId,
	RelevanceConnector,
	RelevanceConnectorId,
} from "../debate-core/Connector.ts";
import type { DebateCore, DebateId } from "../debate-core/Debate.ts";
import { resolveCyclesFromDebateCore } from "./resolveCyclesFromDebateCore.ts";

describe("resolveCyclesFromDebateCore", () => {
	it("models relevance against its confidence connector regardless of record order", () => {
		const debate = createDebate({
			claims: ["a", "b"],
			connectors: [
				relevance("r1", "a", "c1", "conTarget"),
				confidence("c1", "b", "a", "conTarget"),
			],
		});

		const result = resolveCyclesFromDebateCore(debate);

		expect(result.cycleComponents).toEqual([{
			claimIds: [claimId("a")],
			connectorIds: [connectorId("c1"), connectorId("r1")],
		}]);
		expect(result.variants.map((variant) => variant.breakConnectorIds)).toEqual([
			[connectorId("c1")],
			[connectorId("r1")],
		]);
		expect(result.claimScores[claimId("a")]?.value).toBe(0.5);
	});

	it("deduplicates overlapping cycles into global minimal break sets", () => {
		const debate = createDebate({
			claims: ["a", "b", "c"],
			connectors: [
				confidence("ab", "b", "a", "conTarget"),
				confidence("ba", "a", "b", "conTarget"),
				confidence("ac", "c", "a", "conTarget"),
				confidence("ca", "a", "c", "conTarget"),
			],
		});

		const result = resolveCyclesFromDebateCore(debate);

		expect(result.variants.map((variant) => variant.breakConnectorIds)).toEqual([
			[connectorId("ab"), connectorId("ac")],
			[connectorId("ab"), connectorId("ca")],
			[connectorId("ac"), connectorId("ba")],
			[connectorId("ba"), connectorId("ca")],
		]);
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

function relevance(
	id: string,
	source: string,
	targetConfidenceConnectorId: string,
	targetRelationship: RelevanceConnector["targetRelationship"],
): RelevanceConnector {
	return {
		id: id as RelevanceConnectorId,
		source: claimId(source),
		targetConfidenceConnectorId: targetConfidenceConnectorId as ConfidenceConnectorId,
		targetRelationship,
		type: "relevance",
	};
}

function claimId(id: string): ClaimId {
	return id as ClaimId;
}

function connectorId(id: string): ConnectorId {
	return id as ConnectorId;
}