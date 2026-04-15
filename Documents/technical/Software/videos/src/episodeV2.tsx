// See 📌README.md in this folder for local coding standards before editing this file.

import { Composition } from "remotion";
import { applyChanges, buildRecalculationChanges } from "../../engine/src/v2/index.ts";
import { newClaim, type ClaimId } from "../../contracts/src/v2/Claim.ts";
import { newConnector, type ConnectorId } from "../../contracts/src/v2/Connector.ts";
import { newDebate, type Debate } from "../../contracts/src/v2/Debate.ts";
import { newScore, type ScoreId } from "../../contracts/src/v2/Score.ts";
import { EpisodeBrandSequence } from "./shared/EpisodeBrandSequence.tsx";
import { EpisodeTemplate } from "./shared/EpisodeTemplate.tsx";
import { Fade } from "./shared/Fade.tsx";
import { CameraMove, GraphEvents, GraphView } from "./shared/v2/GraphView.tsx";
import { buildTimelineTimes, wait } from "./shared/timeline.ts";

const EPISODE_ID = "EpisodeV2";
const EPISODE_TITLE = "Episode V2";
const EPISODE_FPS = 30;

const cameraMoveOptions = {
	padding: 200,
};
const claimRId = "r" as ClaimId;
const claimBId = "b" as ClaimId;
const connector27Id = "connector:27" as ConnectorId;

const graphEvents = buildTimelineTimes([
	["BackgroundFadeIn", 0.7],
	[wait, 1],
	["addClaimR", 10],
	[wait, 1],
	["brand", 3.3],
	["mainCamera", 1.7],
	[wait, 0.7],
	["bCamera", 1.7],
	[wait, 1],
	["aCamera", 1.7],
	[wait, 0.3],
	["resetCamera", 1.7],
	["BackgroundFadeout", 0.7],
] as const, EPISODE_FPS);

const TOTAL_EPISODE_FRAMES = graphEvents.totalDurationInFrames;
const episodeV2Debate = normalizeDebateScores(createEpisodeV2Debate());

export const EpisodeV2 = () => {
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
				<GraphView debate={episodeV2Debate} siblingOrderingMode="preserve-input" debugTimeline>
					<CameraMove {...cameraMoveOptions} {...graphEventTimes.mainCamera} claimId="main" />
					<GraphEvents
						{...graphEventTimes.addClaimR}
						id="addClaimR"
						applyMode="per-action"
						actions={[
							{
								id: "add-claim-r",
								action: {
									kind: "claim.upsert",
									claim: newClaim({
										id: claimRId,
											content: "c-R",
										side: "proMain",
									}),
								},
							},
							{
								id: "add-connector-27",
								action: {
									kind: "connector.upsert",
									connector: newConnector({
										id: connector27Id,
										source: claimRId,
										target: claimBId,
										affects: "confidence",
									}),
								},
							},
						]}
					/>
					<CameraMove {...cameraMoveOptions} {...graphEventTimes.bCamera} claimId={["b", "e", "f", "i", "o"]} />
					<CameraMove {...cameraMoveOptions} {...graphEventTimes.aCamera} claimId="a" />
					<CameraMove {...graphEventTimes.resetCamera} reset />
				</GraphView>
			</Fade>
			<EpisodeBrandSequence {...graphEventTimes.brand} />
		</EpisodeTemplate>
	);
};

export const EpisodeV2Composition = () => {
	return (
		<Composition
			id={EPISODE_ID}
			component={EpisodeV2}
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

function createEpisodeV2Debate(): Debate {
	const claimIds = {
		main: asClaimId("main"),
		a: asClaimId("a"),
		b: asClaimId("b"),
		c: asClaimId("c"),
		e: asClaimId("e"),
		f: asClaimId("f"),
		i: asClaimId("i"),
		l: asClaimId("l"),
		m: asClaimId("m"),
		n: asClaimId("n"),
		o: asClaimId("o"),
		u: asClaimId("u"),
		v: asClaimId("v"),
		w: asClaimId("w"),
		x: asClaimId("x"),
		y: asClaimId("y"),
		z: asClaimId("z"),
	} as const;

	const connectorIds = {
		1: asConnectorId("connector:1"),
		2: asConnectorId("connector:2"),
		3: asConnectorId("connector:3"),
		5: asConnectorId("connector:5"),
		6: asConnectorId("connector:6"),
		9: asConnectorId("connector:9"),
		12: asConnectorId("connector:12"),
		13: asConnectorId("connector:13"),
		14: asConnectorId("connector:14"),
		15: asConnectorId("connector:15"),
		21: asConnectorId("connector:21"),
		22: asConnectorId("connector:22"),
		23: asConnectorId("connector:23"),
		24: asConnectorId("connector:24"),
		25: asConnectorId("connector:25"),
		26: asConnectorId("connector:26"),
	} as const;

	const scoreIds = {
		main: asScoreId("score:main"),
		a: asScoreId("score:a"),
		b: asScoreId("score:b"),
		c: asScoreId("score:c"),
		e: asScoreId("score:e"),
		f: asScoreId("score:f"),
		i: asScoreId("score:i"),
		l: asScoreId("score:l"),
		m: asScoreId("score:m"),
		n: asScoreId("score:n"),
		o: asScoreId("score:o"),
		u: asScoreId("score:u"),
		v: asScoreId("score:v"),
		w: asScoreId("score:w"),
		x: asScoreId("score:x"),
		y: asScoreId("score:y"),
		z: asScoreId("score:z"),
	} as const;

	return newDebate({
		id: "debate:episode-v2" as Debate["id"],
		name: "Episode V2 graph",
		description: "Reason Tracker graph for EpisodeV2.",
		mainClaimId: claimIds.main,
		claims: {
			[claimIds.main]: newClaim({ id: claimIds.main, content: "Main Claim", side: "proMain" }),
			[claimIds.a]: newClaim({ id: claimIds.a, content: "c-A", side: "proMain" }),
			[claimIds.b]: newClaim({ id: claimIds.b, content: "c-B", side: "proMain" }),
			[claimIds.c]: newClaim({ id: claimIds.c, content: "c-C", side: "proMain" }),
			[claimIds.e]: newClaim({ id: claimIds.e, content: "c-E", side: "proMain" }),
			[claimIds.f]: newClaim({ id: claimIds.f, content: "c-F", side: "proMain" }),
			[claimIds.i]: newClaim({ id: claimIds.i, content: "c-I", side: "proMain" }),
			[claimIds.l]: newClaim({ id: claimIds.l, content: "c-L", side: "conMain" }),
			[claimIds.m]: newClaim({ id: claimIds.m, content: "c-M", side: "proMain" }),
			[claimIds.n]: newClaim({ id: claimIds.n, content: "c-N", side: "conMain" }),
			[claimIds.o]: newClaim({ id: claimIds.o, content: "c-O", side: "conMain" }),
			[claimIds.u]: newClaim({ id: claimIds.u, content: "c-U", side: "conMain" }),
			[claimIds.v]: newClaim({ id: claimIds.v, content: "c-V", side: "conMain" }),
			[claimIds.w]: newClaim({ id: claimIds.w, content: "c-W", side: "proMain" }),
			[claimIds.x]: newClaim({ id: claimIds.x, content: "c-X", side: "proMain" }),
			[claimIds.y]: newClaim({ id: claimIds.y, content: "c-Y", side: "conMain" }),
			[claimIds.z]: newClaim({ id: claimIds.z, content: "c-Z", side: "proMain" }),
		},
		connectors: {
			[connectorIds[1]]: newConnector({ id: connectorIds[1], source: claimIds.a, target: claimIds.main, affects: "confidence" }),
			[connectorIds[2]]: newConnector({ id: connectorIds[2], source: claimIds.b, target: claimIds.main, affects: "confidence" }),
			[connectorIds[3]]: newConnector({ id: connectorIds[3], source: claimIds.c, target: claimIds.a, affects: "confidence" }),
			[connectorIds[5]]: newConnector({ id: connectorIds[5], source: claimIds.e, target: claimIds.b, affects: "relevance" }),
			[connectorIds[6]]: newConnector({ id: connectorIds[6], source: claimIds.f, target: claimIds.b, affects: "confidence" }),
			[connectorIds[9]]: newConnector({ id: connectorIds[9], source: claimIds.i, target: claimIds.b, affects: "confidence" }),
			[connectorIds[12]]: newConnector({ id: connectorIds[12], source: claimIds.l, target: claimIds.a, affects: "confidence" }),
			[connectorIds[13]]: newConnector({ id: connectorIds[13], source: claimIds.m, target: claimIds.a, affects: "confidence" }),
			[connectorIds[14]]: newConnector({ id: connectorIds[14], source: claimIds.n, target: claimIds.main, affects: "confidence" }),
			[connectorIds[15]]: newConnector({ id: connectorIds[15], source: claimIds.o, target: claimIds.b, affects: "confidence" }),
			[connectorIds[21]]: newConnector({ id: connectorIds[21], source: claimIds.u, target: claimIds.n, affects: "confidence" }),
			[connectorIds[22]]: newConnector({ id: connectorIds[22], source: claimIds.v, target: claimIds.n, affects: "confidence" }),
			[connectorIds[23]]: newConnector({ id: connectorIds[23], source: claimIds.w, target: claimIds.n, affects: "confidence" }),
			[connectorIds[24]]: newConnector({ id: connectorIds[24], source: claimIds.x, target: claimIds.main, affects: "confidence" }),
			[connectorIds[25]]: newConnector({ id: connectorIds[25], source: claimIds.y, target: claimIds.main, affects: "confidence" }),
			[connectorIds[26]]: newConnector({ id: connectorIds[26], source: claimIds.z, target: claimIds.y, affects: "confidence" }),
		},
		scores: {
			[scoreIds.main]: newScore({
				id: scoreIds.main,
				claimId: claimIds.main,
				incomingScoreIds: [scoreIds.a, scoreIds.b, scoreIds.x, scoreIds.n, scoreIds.y],
			}),
			[scoreIds.a]: newScore({
				id: scoreIds.a,
				claimId: claimIds.a,
				connectorId: connectorIds[1],
				incomingScoreIds: [scoreIds.c, scoreIds.m, scoreIds.l],
			}),
			[scoreIds.b]: newScore({
				id: scoreIds.b,
				claimId: claimIds.b,
				connectorId: connectorIds[2],
				incomingScoreIds: [scoreIds.e, scoreIds.f, scoreIds.i, scoreIds.o],
			}),
			[scoreIds.c]: newScore({ id: scoreIds.c, claimId: claimIds.c, connectorId: connectorIds[3] }),
			[scoreIds.e]: newScore({ id: scoreIds.e, claimId: claimIds.e, connectorId: connectorIds[5] }),
			[scoreIds.f]: newScore({ id: scoreIds.f, claimId: claimIds.f, connectorId: connectorIds[6] }),
			[scoreIds.i]: newScore({ id: scoreIds.i, claimId: claimIds.i, connectorId: connectorIds[9] }),
			[scoreIds.l]: newScore({ id: scoreIds.l, claimId: claimIds.l, connectorId: connectorIds[12] }),
			[scoreIds.m]: newScore({ id: scoreIds.m, claimId: claimIds.m, connectorId: connectorIds[13] }),
			[scoreIds.n]: newScore({
				id: scoreIds.n,
				claimId: claimIds.n,
				connectorId: connectorIds[14],
				incomingScoreIds: [scoreIds.u, scoreIds.v, scoreIds.w],
			}),
			[scoreIds.o]: newScore({ id: scoreIds.o, claimId: claimIds.o, connectorId: connectorIds[15] }),
			[scoreIds.u]: newScore({ id: scoreIds.u, claimId: claimIds.u, connectorId: connectorIds[21] }),
			[scoreIds.v]: newScore({ id: scoreIds.v, claimId: claimIds.v, connectorId: connectorIds[22] }),
			[scoreIds.w]: newScore({ id: scoreIds.w, claimId: claimIds.w, connectorId: connectorIds[23] }),
			[scoreIds.x]: newScore({ id: scoreIds.x, claimId: claimIds.x, connectorId: connectorIds[24] }),
			[scoreIds.y]: newScore({
				id: scoreIds.y,
				claimId: claimIds.y,
				connectorId: connectorIds[25],
				incomingScoreIds: [scoreIds.z],
			}),
			[scoreIds.z]: newScore({ id: scoreIds.z, claimId: claimIds.z, connectorId: connectorIds[26] }),
		},
	});
}

function asClaimId(value: string): ClaimId {
	return value as ClaimId;
}

function asConnectorId(value: string): ConnectorId {
	return value as ConnectorId;
}

function asScoreId(value: string): ScoreId {
	return value as ScoreId;
}
