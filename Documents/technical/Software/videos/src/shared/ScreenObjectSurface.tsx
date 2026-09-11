import { BalanceScale } from "@reasontracker/components";
import type { CSSProperties } from "react";

import type { CompiledScreenObject, ResolvedScreenObjectState } from "./compileEpisodeScript";
import { EpisodeMedia } from "./EpisodeMedia";

const BALANCE_VIEW_STYLE = {
    height: 1080,
    width: 1920,
} as const;

export type ScreenObjectSurfaceProps = {
    mediaSources: Readonly<Record<string, string>>
    screenObject: ResolvedScreenObjectState & Pick<CompiledScreenObject, "key">
};

export function ScreenObjectSurface({ mediaSources, screenObject }: ScreenObjectSurfaceProps) {
    const { object } = screenObject;

    if (object.type === "media") {
        return <EpisodeMedia source={requireMediaSource(mediaSources, object.source)} style={screenObject.style} />;
    }

    return (
        <div
            data-object-key={screenObject.key}
            style={{ pointerEvents: "none", position: "absolute", ...screenObject.style } as CSSProperties}
        >
            <div style={BALANCE_VIEW_STYLE}>
                <BalanceScale scorePercent={object.scorePercent} />
            </div>
        </div>
    );
}

function requireMediaSource(mediaSources: Readonly<Record<string, string>>, source: string): string {
    const resolvedSource = mediaSources[source];
    if (!resolvedSource) {
        throw new Error(`Unable to resolve episode media source: ${source}`);
    }
    return resolvedSource;
}