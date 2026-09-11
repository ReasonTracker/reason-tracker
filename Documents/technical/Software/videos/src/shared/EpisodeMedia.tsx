import { Img } from "remotion";
import type { CSSProperties } from "react";

import type { CssStyle } from "./episodeScriptSpec";

type EpisodeMediaProps = {
    source: string
    style: CssStyle
};

export function EpisodeMedia({ source, style }: EpisodeMediaProps) {
    const { rotation, ...cssStyle } = style;

    return (
        <Img
            src={source}
            style={{
                display: "block",
                position: "absolute",
                ...cssStyle,
                ...(rotation === undefined ? {} : { rotate: rotation }),
            } as CSSProperties}
        />
    );
}