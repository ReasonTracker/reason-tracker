import type { AddConfidenceClaimCommand } from "@debate-core/Commands.ts";
import type { ClaimId } from "@debate-core/Claim.ts";
import type { ConfidenceConnectorId } from "@debate-core/Connector.ts";
import { applyConfidenceClaimAddCommand } from "@planner/applyDebateCommand.ts";
import { buildSnapshotFromDebateCore, planner } from "@planner/planner.ts";
import type { Snapshot } from "@planner/Snapshot.ts";

import type { DebateSnapshotRenderState } from "../shared/debate-render/renderTypes";
import { c1ClaimId, episode0002DebateCore } from "../Episode0002/scenario";

const episode0004ClaimId = "episode-0004-claim-c7" as ClaimId;
const episode0004ConfidenceConnectorId = "episode-0004-confidence-c1-c7" as ConfidenceConnectorId;

const episode0004AddClaimCommand: AddConfidenceClaimCommand = {
    claim: {
        content: "C7",
        id: episode0004ClaimId,
    },
    connector: {
        id: episode0004ConfidenceConnectorId,
        targetClaimId: c1ClaimId,
        targetRelationship: "conTarget",
        type: "confidence",
    },
    type: "confidence/claim/add",
};

const appliedCommand = applyConfidenceClaimAddCommand({
    command: episode0004AddClaimCommand,
    debateCore: episode0002DebateCore,
});

const openingSnapshot = buildSnapshotFromDebateCore({
    debateCore: episode0002DebateCore,
});

const plannedSnapshots = planner({
    command: episode0004AddClaimCommand,
    debateCore: episode0002DebateCore,
});

if (plannedSnapshots.length !== 6) {
    throw new Error(`Episode0004 expected 6 planner snapshots, received ${plannedSnapshots.length}`);
}

console.log("Episode0004 planner snapshots", {
    firstFillSnapshot: plannedSnapshots[2],
    openingSnapshot,
    scaleSnapshot: plannedSnapshots[5],
    sproutSnapshot: plannedSnapshots[1],
    voilaSnapshot: plannedSnapshots[0],
    waveC1Snapshot: plannedSnapshots[3],
    waveMainSnapshot: plannedSnapshots[4],
});

function toRenderState(snapshot: Snapshot): DebateSnapshotRenderState {
    return {
        debateCore: appliedCommand.debateCore,
        snapshot,
    };
}

export const openingRenderState: DebateSnapshotRenderState = {
    debateCore: episode0002DebateCore,
    snapshot: openingSnapshot,
};
export const voilaRenderState: DebateSnapshotRenderState = toRenderState(plannedSnapshots[0]);
export const sproutRenderState: DebateSnapshotRenderState = toRenderState(plannedSnapshots[1]);
export const firstFillRenderState: DebateSnapshotRenderState = toRenderState(plannedSnapshots[2]);
export const waveC1RenderState: DebateSnapshotRenderState = toRenderState(plannedSnapshots[3]);
export const waveMainRenderState: DebateSnapshotRenderState = toRenderState(plannedSnapshots[4]);
export const scaleRenderState: DebateSnapshotRenderState = toRenderState(plannedSnapshots[5]);

