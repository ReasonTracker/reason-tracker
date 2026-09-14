import { BalanceScale } from "@reasontracker/components";
import type { CSSProperties } from "react";

import type {
    CompiledSceneObject,
    EpisodeMediaAsset,
    ResolvedSceneObjectState,
} from "./compileEpisodeScript";
import { EpisodeMedia } from "./EpisodeMedia";

const BALANCE_VIEW_STYLE = {
    height: 1080,
    width: 1920,
} as const;

export type SceneObjectSurfaceProps = {
    mediaAssets: Readonly<Record<string, EpisodeMediaAsset>>
    sceneObject: ResolvedSceneObjectState & Pick<CompiledSceneObject, "key">
};

export function SceneObjectSurface({ mediaAssets, sceneObject }: SceneObjectSurfaceProps) {
    const { object } = sceneObject;
    const layoutStyle = {
        height: sceneObject.layout.height,
        left: sceneObject.layout.x,
        position: "absolute",
        rotate: `${sceneObject.layout.rotation}deg`,
        scale: sceneObject.layout.scale,
        top: sceneObject.layout.y,
        transformOrigin: `${sceneObject.layout.originX ?? sceneObject.layout.width / 2}px ${sceneObject.layout.originY ?? sceneObject.layout.height / 2}px`,
        width: sceneObject.layout.width,
    } as const;

    if (object.type === "media") {
        return (
            <EpisodeMedia
                source={requireMediaSource(mediaAssets, object.source)}
                style={{ ...layoutStyle, ...sceneObject.style }}
            />
        );
    }

    return (
        <div
            data-object-key={sceneObject.key}
            style={{ ...layoutStyle, pointerEvents: "none", ...sceneObject.style } as CSSProperties}
        >
            <div style={{ ...BALANCE_VIEW_STYLE, transformOrigin: "0 0", transform: `scale(${sceneObject.layout.width / BALANCE_VIEW_STYLE.width}, ${sceneObject.layout.height / BALANCE_VIEW_STYLE.height})` }}>
                <BalanceScale scorePercent={object.scorePercent} />
            </div>
        </div>
    );
}

function requireMediaSource(
    mediaAssets: Readonly<Record<string, EpisodeMediaAsset>>,
    source: string,
): string {
    const mediaAsset = mediaAssets[source];
    if (!mediaAsset) {
        throw new Error(`Unable to resolve episode media source: ${source}`);
    }
    return mediaAsset.src;
}