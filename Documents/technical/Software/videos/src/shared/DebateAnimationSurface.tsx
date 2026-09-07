import { DebateGraph } from "@reasontracker/components";
import type { DebateCore } from "@debate-core/Debate.ts";
import {
	resolveAnimationFrame,
	type AnimationStepId,
	type DebateAnimationPlan,
} from "@planner/DebateAnimationPlan.ts";
import { AbsoluteFill } from "remotion";

export type DebateAnimationSurfaceProps = {
	cameraBounds?: DebateAnimationPlan["bounds"]
	debateCore: DebateCore
	plan: DebateAnimationPlan
	stepId?: AnimationStepId
	stepProgress: number
};

export function DebateAnimationSurface({
	cameraBounds,
	debateCore,
	plan,
	stepId,
	stepProgress,
}: DebateAnimationSurfaceProps) {
	const frame = stepId
		? resolveAnimationFrame(plan, stepId, stepProgress)
		: plan.openingFrame;

	return (
		<AbsoluteFill style={{ background: "#080b10" }}>
			<DebateGraph
				bounds={cameraBounds ?? plan.bounds}
				debateCore={debateCore}
				frame={frame}
				options={plan.options}
			/>
		</AbsoluteFill>
	);
}