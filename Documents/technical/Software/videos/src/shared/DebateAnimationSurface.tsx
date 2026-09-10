import { DebateGraph } from "@reasontracker/components";
import type { DebateCore } from "@debate-core/Debate.ts";
import {
	resolveAnimationFrame,
	type AnimationStepId,
	type DebateAnimationPlan,
} from "@planner/DebateAnimationPlan.ts";
import { AbsoluteFill } from "remotion";

import { TimedCharacterReveal } from "./TimedCharacterReveal";
import type { ClaimTextReveal } from "./compileEpisodeScript";

export type DebateAnimationSurfaceProps = {
	cameraBounds?: DebateAnimationPlan["bounds"]
	claimScoreVisibility: Readonly<Record<string, boolean>>
	claimTextReveals: Readonly<Record<string, ClaimTextReveal>>
	debateCore: DebateCore
	plan: DebateAnimationPlan
	stepId?: AnimationStepId
	stepProgress: number
};

export function DebateAnimationSurface({
	cameraBounds,
	claimScoreVisibility,
	claimTextReveals,
	debateCore,
	plan,
	stepId,
	stepProgress,
}: DebateAnimationSurfaceProps) {
	const frame = stepId
		? resolveAnimationFrame(plan, stepId, stepProgress)
		: plan.openingFrame;

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
		</AbsoluteFill>
	);
}