import type { ReactNode } from "react";

import { EpisodeFrame } from "./EpisodeFrame";

type EpisodeTemplateProps = {
    children: ReactNode;
};

export const EpisodeTemplate = ({ children }: EpisodeTemplateProps) => {
    return (
        <EpisodeFrame
            background="#000000"
            color="#ffffff"
            fontFamily='"Aptos Display", "Segoe UI", sans-serif'
        >
            {children}
        </EpisodeFrame>
    );
};
