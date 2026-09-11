import { BalanceScale } from "@reasontracker/components";
import type { CSSProperties } from "react";

import type { CompiledSceneObject, ResolvedSceneObjectState } from "./compileEpisodeScript";
import { EpisodeMedia } from "./EpisodeMedia";

const BALANCE_VIEW_STYLE = {
    height: 1080,
    width: 1920,
} as const;

export type SceneObjectSurfaceProps = {
    mediaSources: Readonly<Record<string, string>>
    sceneObject: ResolvedSceneObjectState & Pick<CompiledSceneObject, "key">
};

export function SceneObjectSurface({ mediaSources, sceneObject }: SceneObjectSurfaceProps) {
    const { object } = sceneObject;

    if (object.type === "media") {
        return <EpisodeMedia source={requireMediaSource(mediaSources, object.source)} style={sceneObject.style} />;
    }

    return (
        <div
            data-object-key={sceneObject.key}
            style={{ pointerEvents: "none", position: "absolute", ...sceneObject.style } as CSSProperties}
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