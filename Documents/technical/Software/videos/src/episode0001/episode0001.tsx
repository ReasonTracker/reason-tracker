// See 📌README.md in this folder for local coding standards before editing this file.

import { Composition } from "remotion";
import { applyChanges, buildRecalculationChanges } from "../../../engine/src/index.ts";
import { newClaim, type ClaimId } from "../../../contracts/src/Claim.ts";
import { newConnector, type ConnectorId } from "../../../contracts/src/Connector.ts";
import type { Debate } from "../../../contracts/src/Debate.ts";
import { EpisodeBrandSequence } from "../shared/EpisodeBrandSequence.tsx";
import { EpisodeTemplate } from "../shared/EpisodeTemplate.tsx";
import { Fade } from "../shared/Fade.tsx";
import { GraphEvents, GraphView, type GraphActionEntry } from "../shared/GraphView.tsx";
import { buildTimelineTimes, wait } from "../shared/timeline.ts";
// import graphData from "./episode0001.initial.json";
// import graphData from "./episode0001.five-sources-for-main.json";
 import graphData from "./episode0001.five-claim-chain.json";
// import graphData from "../episodeV2.data.json";


const EPISODE_ID = "Episode0001";
const EPISODE_TITLE = "Episode 0001";
const EPISODE_FPS = 30;

const claimIds = {
	main: asClaimId("main"),
	shopTraffic: asClaimId("shop-traffic"),
	childSafety: asClaimId("child-safety"),
	safetyPriority: asClaimId("safety-priority"),
	railroadStreet: asClaimId("railroad-street"),
	cost: asClaimId("cost"),
	payoff: asClaimId("payoff"),
} as const;

const connectorIds = {
	shopTraffic: asConnectorId("connector:shop-traffic"),
	childSafety: asConnectorId("connector:child-safety"),
	safetyPriority: asConnectorId("connector:safety-priority"),
	railroadStreet: asConnectorId("connector:railroad-street"),
	cost: asConnectorId("connector:cost"),
	payoff: asConnectorId("connector:payoff"),
} as const;

const graphEvents = buildTimelineTimes([
	["BackgroundFadeIn", 0.7],
	[wait, 7.6],
	["addShopTraffic", 2.2],
	[wait, 5.2],
	["addChildSafety", 2.2],
	[wait, 2.4],
	["addSafetyPriority", 2.2],
	[wait, 2.6],
	["addRailroadStreet", 2.2],
	[wait, 3.4],
	["addCost", 2.2],
	[wait, 2.8],
	["addPayoff", 2.2],
	[wait, 2.6],
	["brand", 3.3],
	["BackgroundFadeout", 0.7],
] as const, EPISODE_FPS);

const TOTAL_EPISODE_FRAMES = graphEvents.totalDurationInFrames;
const debate = normalizeDebateScores(graphData as unknown as Debate);

export const Episode0001 = () => {
	const graphEventTimes = graphEvents.times;
	const graphFadeFrom = graphEventTimes.BackgroundFadeIn.from;
	const graphFadeDurationInFrames = graphEventTimes.BackgroundFadeout.from
		+ graphEventTimes.BackgroundFadeout.durationInFrames
		- graphFadeFrom;

	return (
		<EpisodeTemplate>
			<Fade
				from={graphFadeFrom}
				durationInFrames={graphFadeDurationInFrames}
				fadeInFrames={graphEventTimes.BackgroundFadeIn.durationInFrames}
				fadeOutFrames={graphEventTimes.BackgroundFadeout.durationInFrames}
				name="Graph Fade"
			>
				<GraphView debate={debate} siblingOrderingMode="preserve-input" debugTimeline>
					<GraphEvents {...graphEventTimes.addShopTraffic} id="addShopTraffic" actions={buildAddLeafActions({
						claimId: claimIds.shopTraffic,
						connectorId: connectorIds.shopTraffic,
						content: "Converting Elm Street will increase foot traffic to local shops by 15%.",
						side: "proMain",
						target: claimIds.main,
					})} />
					<GraphEvents {...graphEventTimes.addChildSafety} id="addChildSafety" actions={buildAddLeafActions({
						claimId: claimIds.childSafety,
						connectorId: connectorIds.childSafety,
						content: "Converting Elm Street will divert traffic onto residential streets, endangering children.",
						side: "conMain",
						target: claimIds.main,
					})} />
					<GraphEvents {...graphEventTimes.addSafetyPriority} id="addSafetyPriority" actions={buildAddLeafActions({
						claimId: claimIds.safetyPriority,
						connectorId: connectorIds.safetyPriority,
						content: "Child safety is more important than local shops profit.",
						side: "conMain",
						target: claimIds.shopTraffic,
						affects: "relevance",
					})} />
					<GraphEvents {...graphEventTimes.addRailroadStreet} id="addRailroadStreet" actions={buildAddLeafActions({
						claimId: claimIds.railroadStreet,
						connectorId: connectorIds.railroadStreet,
						content: "Unused railroad tracks can be converted into a new street, cancelling out the traffic problem.",
						side: "proMain",
						target: claimIds.childSafety,
					})} />
					<GraphEvents {...graphEventTimes.addCost} id="addCost" actions={buildAddLeafActions({
						claimId: claimIds.cost,
						connectorId: connectorIds.cost,
						content: "The conversion will cost 2 million dollars.",
						side: "conMain",
						target: claimIds.main,
					})} />
					<GraphEvents {...graphEventTimes.addPayoff} id="addPayoff" actions={buildAddLeafActions({
						claimId: claimIds.payoff,
						connectorId: connectorIds.payoff,
						content: "The increase in revenue is expected to pay off the expense in under 2 years, meeting the city's investment requirements.",
						side: "proMain",
						target: claimIds.cost,
					})} />
				</GraphView>
			</Fade>
			<EpisodeBrandSequence {...graphEventTimes.brand} />
		</EpisodeTemplate>
	);
};

export const Episode001Composition = () => {
	return (
		<Composition
			id={EPISODE_ID}
			component={Episode0001}
			durationInFrames={TOTAL_EPISODE_FRAMES}
			fps={EPISODE_FPS}
			width={1920}
			height={1080}
			defaultProps={{
				episodeId: EPISODE_ID,
				title: EPISODE_TITLE,
			}}
		/>
	);
};

function normalizeDebateScores(debate: Debate): Debate {
	const leafScoreIds = Object.values(debate.scores)
		.filter((score) => score.incomingScoreIds.length === 0)
		.map((score) => score.id);

	if (leafScoreIds.length === 0) {
		return debate;
	}

	return applyChanges(debate, buildRecalculationChanges(debate, leafScoreIds));
}

function buildAddLeafActions(args: {
	claimId: ClaimId;
	connectorId: ConnectorId;
	content: string;
	side: "proMain" | "conMain";
	target: ClaimId;
	affects?: "confidence" | "relevance";
}): GraphActionEntry[] {
	return [
		{
			id: `add-claim:${args.claimId}`,
			action: {
				kind: "claim.upsert",
				claim: newClaim({
					id: args.claimId,
					content: args.content,
					side: args.side,
				}),
			},
		},
		{
			id: `add-connector:${args.connectorId}`,
			action: {
				kind: "connector.upsert",
				connector: newConnector({
					id: args.connectorId,
					source: args.claimId,
					target: args.target,
					affects: args.affects ?? "confidence",
				}),
			},
		},
	];
}

function asClaimId(value: string): ClaimId {
	return value as ClaimId;
}

function asConnectorId(value: string): ConnectorId {
	return value as ConnectorId;
}
