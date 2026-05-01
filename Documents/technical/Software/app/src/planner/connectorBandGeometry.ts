import type { ConnectorBandPlacement } from "./Snapshot.ts";

export type ConnectorBandEnvelope = {
    bottomOffset: number;
    collapseOffset: number;
    topOffset: number;
};

export function resolveConnectorBandEnvelope(
    pipeWidth: number,
    bandWidth: number,
    bandPlacement: ConnectorBandPlacement,
): ConnectorBandEnvelope {
    const safePipeWidth = Math.max(0, Number.isFinite(pipeWidth) ? pipeWidth : 0);
    const safeBandWidth = Math.min(safePipeWidth, Math.max(0, Number.isFinite(bandWidth) ? bandWidth : 0));

    switch (bandPlacement) {
        case "center":
            return {
                bottomOffset: safeBandWidth / 2,
                collapseOffset: 0,
                topOffset: -(safeBandWidth / 2),
            };

        case "upperSide": {
            const collapseOffset = safePipeWidth / 2;

            return {
                bottomOffset: collapseOffset,
                collapseOffset,
                topOffset: collapseOffset - safeBandWidth,
            };
        }

        default: {
            const collapseOffset = -(safePipeWidth / 2);

            return {
                bottomOffset: collapseOffset + safeBandWidth,
                collapseOffset,
                topOffset: collapseOffset,
            };
        }
    }
}