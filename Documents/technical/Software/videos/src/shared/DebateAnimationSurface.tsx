import { DebateGraph } from "@reasontracker/components";
import type { ClaimId } from "@debate-core/Claim.ts";
import type { DebateCore } from "@debate-core/Debate.ts";
import {
	resolveAnimationFrame,
	type AnimationStepId,
	type DebateAnimationPlan,
} from "@planner/DebateAnimationPlan.ts";
import { useCurrentFrame } from "remotion";
import type { ClaimTextReveal } from "./compileEpisodeScript";

export type DebateAnimationSurfaceProps = {
	claimScoreVisibility: Readonly<Record<string, boolean>>
	claimTextReveals: Readonly<Record<string, ClaimTextReveal>>
	debateCore: DebateCore
	foregroundClaimIds?: ReadonlySet<ClaimId>
	hideScores: boolean
	plan: DebateAnimationPlan
	stepId?: AnimationStepId
	stepProgress: number
};

export function DebateAnimationSurface({
	claimScoreVisibility,
	claimTextReveals,
	debateCore,
	foregroundClaimIds,
	hideScores,
	plan,
	stepId,
	stepProgress,
}: DebateAnimationSurfaceProps) {
	const currentFrame = useCurrentFrame();
	const frame = stepId
		? resolveAnimationFrame(plan, stepId, stepProgress)
		: plan.openingFrame;
	return (
		<DebateGraph
			bounds={plan.bounds}
			claimTextReveals={Object.fromEntries(
				Object.entries(claimTextReveals).map(([claimId, reveal]) => [claimId, {
					progress: resolveClaimTextRevealProgress(currentFrame, reveal),
				}]),
			)}
			foregroundConnectorClaimIds={stepId === "voila" || stepId === "sprout" || stepId === "firstFill" || stepId === "wave"
				? foregroundClaimIds
				: undefined}
			foregroundClaimIds={foregroundClaimIds}
			scoreless={hideScores}
			showClaimScore={(claimId) => claimScoreVisibility[claimId] ?? true}
			debateCore={debateCore}
			frame={frame}
			options={plan.options}
		/>
	);
}

function resolveClaimTextRevealProgress(frame: number, reveal: ClaimTextReveal): number {
	return Math.max(0, Math.min(1, (frame - reveal.from) / reveal.durationInFrames));
}
