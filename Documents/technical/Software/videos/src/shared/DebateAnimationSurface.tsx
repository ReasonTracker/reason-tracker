import { DebateGraph } from "@reasontracker/components";
import type { DebateCore } from "@debate-core/Debate.ts";
import {
	resolveAnimationFrame,
	type AnimationStepId,
	type DebateAnimationPlan,
} from "@planner/DebateAnimationPlan.ts";
import { TimedCharacterReveal } from "./TimedCharacterReveal";
import type { ClaimTextReveal } from "./compileEpisodeScript";

export type DebateAnimationSurfaceProps = {
	claimScoreVisibility: Readonly<Record<string, boolean>>
	claimTextReveals: Readonly<Record<string, ClaimTextReveal>>
	debateCore: DebateCore
	hideScores: boolean
	plan: DebateAnimationPlan
	stepId?: AnimationStepId
	stepProgress: number
};

export function DebateAnimationSurface({
	claimScoreVisibility,
	claimTextReveals,
	debateCore,
	hideScores,
	plan,
	stepId,
	stepProgress,
}: DebateAnimationSurfaceProps) {
	const frame = stepId
		? resolveAnimationFrame(plan, stepId, stepProgress)
		: plan.openingFrame;
	return (
		<DebateGraph
			bounds={plan.bounds}
			claimContent={(claimId, content) => {
				const reveal = claimTextReveals[claimId];
				return reveal
					? <TimedCharacterReveal text={content} {...reveal} />
					: content;
			}}
			scoreless={hideScores}
			showClaimScore={(claimId) => claimScoreVisibility[claimId] ?? true}
			debateCore={debateCore}
			frame={frame}
			options={plan.options}
		/>
	);
}
