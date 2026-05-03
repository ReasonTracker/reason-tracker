import { AbsoluteFill } from "remotion";

export const EPISODE0001_FPS = 30;
export const EPISODE0001_DURATION_IN_FRAMES = 90;

export const Episode0001 = () => {
    return (
        <AbsoluteFill
            style={{
                backgroundColor: `var(--bg)`,
                color: `var(--text)`,
                background: `var(--bg)`,
                fontFamily: `var(--sans)`,
                justifyContent: "center",
                alignItems: "center",
            }}
        >

            TEST
        </AbsoluteFill>
    );
};