// See 📌README.md in this folder for local coding standards before editing this file.

import { Composition } from "remotion";
import { applyChanges, buildRecalculationChanges } from "../../engine/src/v2/index.ts";
import { newClaim, type ClaimId } from "../../contracts/src/v2/Claim.ts";
import { newConnector, type ConnectorId } from "../../contracts/src/v2/Connector.ts";
import type { Debate } from "../../contracts/src/v2/Debate.ts";
import { EpisodeBrandSequence } from "./shared/EpisodeBrandSequence.tsx";
import { EpisodeTemplate } from "./shared/EpisodeTemplate.tsx";
import { Fade } from "./shared/Fade.tsx";
import { CameraMove, GraphEvents, GraphView } from "./shared/v2/GraphView.tsx";
import { buildTimelineTimes, wait } from "./shared/timeline.ts";
import graphData from "./episodeV2.data.json";
// import graphData from "./episode0001/episode0001.initial.json";

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
	["brand", 4, 0],
	[wait, 2],
	["addCamera", 3],
	["addClaimR", 10,0],
	[wait, 2],
	["bMainCamera", 3],
		["CameraMain", 3],

	["resetCamera", 1.7],
	["BackgroundFadeout", 0.7],
] as const, EPISODE_FPS);

const TOTAL_EPISODE_FRAMES = graphEvents.totalDurationInFrames;
const debate = normalizeDebateScores(graphData as unknown as Debate);

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
				<GraphView debate={debate} siblingOrderingMode="preserve-input" debugTimeline>
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
					<CameraMove {...cameraMoveOptions} {...graphEventTimes.addCamera} claimId={["b", "e"]} />
					<CameraMove {...cameraMoveOptions} padding={-200} {...graphEventTimes.bMainCamera} claimId={["b", "main"]} />
					<CameraMove {...cameraMoveOptions} {...graphEventTimes.CameraMain} claimId={["main"]} />

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
