import { resolveAnimationFrame } from "@planner/DebateAnimationPlan.ts";

import type { GraphPlayback, SceneTarget } from "./compileEpisodeScript";

export function resolveGraphSceneTargets(playback: GraphPlayback): readonly SceneTarget[] {
    const frame = playback.stepId
        ? resolveAnimationFrame(playback.animation.plan, playback.stepId, playback.stepProgress)
        : playback.animation.plan.openingFrame;
    const claimTargets = new Map<string, SceneTarget>();
    const claimIdPrefix = `${playback.animation.graph}:claim:`;

    for (const claim of Object.values(frame.claims)) {
        const claimId = String(claim.claimId);
        if (!claimId.startsWith(claimIdPrefix)) {
            throw new Error(`Graph ${playback.animation.graph} rendered an unexpected claim ID: ${claimId}`);
        }
        const id = `${playback.animation.graph}/${claimId.slice(claimIdPrefix.length)}`;
        const width = playback.animation.plan.options.claimWidth * claim.scale;
        const height = playback.animation.plan.options.claimHeight * claim.scale;
        const bounds = {
            height,
            minX: claim.position.x - (width / 2),
            minY: claim.position.y - (height / 2),
            width,
        };
        const existing = claimTargets.get(id);
        claimTargets.set(id, {
            anchor: playback.animation.anchor,
            bounds: existing ? combineBounds(existing.bounds, bounds) : bounds,
            id,
            parentId: playback.animation.graph,
        });
    }

    return [
        {
            anchor: playback.animation.anchor,
            bounds: playback.animation.plan.bounds,
            id: playback.animation.graph,
        },
        ...claimTargets.values(),
    ];
}

function combineBounds(
    left: SceneTarget["bounds"],
    right: SceneTarget["bounds"],
): SceneTarget["bounds"] {
    const minX = Math.min(left.minX, right.minX);
    const minY = Math.min(left.minY, right.minY);
    const maxX = Math.max(left.minX + left.width, right.minX + right.width);
    const maxY = Math.max(left.minY + left.height, right.minY + right.height);
    return {
        height: maxY - minY,
        minX,
        minY,
        width: maxX - minX,
    };
}
