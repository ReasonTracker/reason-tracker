import { Img } from "remotion";
import type { CSSProperties } from "react";

import type { CssStyle } from "./episodeScriptSpec";

type EpisodeMediaProps = {
    source: string
    style: CssStyle
};

export function EpisodeMedia({ source, style }: EpisodeMediaProps) {
    return (
        <Img
            src={source}
            style={{
                display: "block",
                position: "absolute",
                ...style,
            } as CSSProperties}
        />
    );
}