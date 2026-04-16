import { describe, expect, it } from "vitest";

import {
	newClaim,
	newConnector,
	newDebate,
	newScore,
	type Connector,
	type Debate,
	type IntentInput,
	type Score,
} from "../../contracts/src/index.ts";
import { processDebateIntent } from "../../engine/src/v2/index.ts";

describe("v2 ChangeConnection", () => {
	it("emits no changes when the requested connection is identical", () => {
		const mainClaimId = "claim:main" as Debate["mainClaimId"];
		const sourceClaimId = "claim:source" as Connector["source"];
		const connectorId = "connector:source-to-main" as Connector["id"];
		const mainScoreId = "score:main" as Score["id"];
		const sourceScoreId = "score:source" as Score["id"];

		const debate = newDebate({
			id: "debate:no-op-change-connection" as Debate["id"],
			name: "No-op ChangeConnection",
			description: "Regression coverage for identical connection updates.",
			mainClaimId,
			claims: {
				[mainClaimId]: newClaim({ id: mainClaimId, content: "Main claim", side: "proMain" }),
				[sourceClaimId]: newClaim({ id: sourceClaimId, content: "Supporting claim", side: "proMain" }),
			},
			connectors: {
				[connectorId]: newConnector({
					id: connectorId,
					source: sourceClaimId,
					target: mainClaimId,
					affects: "confidence",
				}),
			},
			scores: {
				[mainScoreId]: newScore({
					id: mainScoreId,
					claimId: mainClaimId,
					incomingScoreIds: [sourceScoreId],
				}),
				[sourceScoreId]: newScore({
					id: sourceScoreId,
					claimId: sourceClaimId,
					connectorId,
				}),
			},
		});

		const intent: IntentInput = {
			id: "intent:no-op-change-connection" as IntentInput["id"],
			kind: "ChangeConnection",
			change: {
				type: "ChangeConnection",
				connectorId,
				connector: debate.connectors[connectorId],
				targetScoreId: mainScoreId,
			},
		};

		const result = processDebateIntent({ debate, intent });

		expect(result.intent.changes).toEqual([]);
		expect(result.finalDebate).toEqual(debate);
	});
	});