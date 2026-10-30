import { DebateGraph } from "@reasontracker/components";
import type { ClaimId } from "@reasontracker/engine/debate-core/Claim.ts";
import {
	resolveAnimationFrame,
	type AnimationStepId,
	type DebateAnimationPlan,
	type DebateFrame,
} from "@reasontracker/engine/animation/DebateAnimationPlan.ts";
import { resolveDebateSceneGeometry } from "@reasontracker/engine/geometry/resolveDebateSceneGeometry.ts";
import { useMemo } from "react";
import { useCurrentFrame } from "remotion";
import type { ClaimTextReveal } from "./compileEpisodeScript";

export type DebateAnimationSurfaceProps = {
	claimScoreVisibility: Readonly<Record<string, boolean>>
	claimTextReveals: Readonly<Record<string, ClaimTextReveal>>
	frameOverride?: DebateFrame
	foregroundClaimIds?: ReadonlySet<ClaimId>
	hideScores: boolean
	plan: DebateAnimationPlan
	renderBounds?: DebateAnimationPlan["bounds"]
	stepId?: AnimationStepId
	stepProgress: number
};

export function DebateAnimationSurface({
	claimScoreVisibility,
	claimTextReveals,
	frameOverride,
	foregroundClaimIds,
	hideScores,
	plan,
	renderBounds,
	stepId,
	stepProgress,
}: DebateAnimationSurfaceProps) {
	const currentFrame = useCurrentFrame();
	const frame = useMemo(() => frameOverride ?? (stepId
		? resolveAnimationFrame(plan, stepId, stepProgress)
		: plan.openingFrame), [frameOverride, plan, stepId, stepProgress]);
	const geometry = useMemo(
		() => resolveDebateSceneGeometry({ frame, options: plan.options }),
		[frame, plan.options],
	);
	return (
		<DebateGraph
			bounds={renderBounds ?? plan.bounds}
			claimTextReveals={Object.fromEntries(
				Object.entries(claimTextReveals).map(([claimId, reveal]) => [claimId, {
					progress: resolveClaimTextRevealProgress(currentFrame, reveal),
				}]),
			)}
			foregroundClaimIds={foregroundClaimIds}
			scoreless={hideScores}
			showClaimScore={(claimId) => claimScoreVisibility[claimId] ?? true}
			frame={frame}
			geometry={geometry}
			options={plan.options}
		/>
	);
}

function resolveClaimTextRevealProgress(frame: number, reveal: ClaimTextReveal): number {
	return Math.max(0, Math.min(1, (frame - reveal.from) / reveal.durationInFrames));
}
