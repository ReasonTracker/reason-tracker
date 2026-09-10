import { DebateGraph, Scoreboard } from "@reasontracker/components";
import type { DebateCore } from "@debate-core/Debate.ts";
import {
	resolveAnimationFrame,
	type AnimationStepId,
	type DebateAnimationPlan,
} from "@planner/DebateAnimationPlan.ts";
import { AbsoluteFill } from "remotion";

import { TimedCharacterReveal } from "./TimedCharacterReveal";
import type { ClaimTextReveal } from "./compileEpisodeScript";
import type { ScoreboardLayout } from "./episodeScriptSpec";

export type DebateAnimationSurfaceProps = {
	cameraBounds?: DebateAnimationPlan["bounds"]
	claimScoreVisibility: Readonly<Record<string, boolean>>
	claimTextReveals: Readonly<Record<string, ClaimTextReveal>>
	debateCore: DebateCore
	graphId: string
	plan: DebateAnimationPlan
	scoreboard?: ScoreboardLayout
	stepId?: AnimationStepId
	stepProgress: number
};

export function DebateAnimationSurface({
	cameraBounds,
	claimScoreVisibility,
	claimTextReveals,
	debateCore,
	graphId,
	plan,
	scoreboard,
	stepId,
	stepProgress,
}: DebateAnimationSurfaceProps) {
	const frame = stepId
		? resolveAnimationFrame(plan, stepId, stepProgress)
		: plan.openingFrame;
	const mainClaim = Object.values(frame.claims).find(
		(claim) => claim.claimId === debateCore.mainClaimId,
	);

	return (
		<AbsoluteFill>
			<DebateGraph
				bounds={cameraBounds ?? plan.bounds}
				claimContent={(claimId, content) => {
					const reveal = claimTextReveals[claimId];
					return reveal
						? <TimedCharacterReveal text={content} {...reveal} />
						: content;
				}}
				showClaimScore={(claimId) => claimScoreVisibility[claimId] ?? true}
				debateCore={debateCore}
				frame={frame}
				options={plan.options}
			/>
			{scoreboard
				? (
					<div
						data-graph-id={graphId}
						style={{
							...scoreboardOverlayStyle,
							left: scoreboard.x,
							top: scoreboard.y,
						}}
					>
						<Scoreboard
							height={scoreboard.height}
							numberWidth={scoreboard.numberWidth}
							score={mainClaim?.rawScore ?? 0}
							thermometerWidth={scoreboard.thermometerWidth}
						/>
					</div>
				)
				: null}
		</AbsoluteFill>
	);
}

const scoreboardOverlayStyle = {
	position: "absolute",
	zIndex: 1,
} as const;