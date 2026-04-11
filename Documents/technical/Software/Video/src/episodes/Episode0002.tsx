import { AbsoluteFill, Sequence, useCurrentFrame, interpolate } from "remotion";
import type { EpisodeCompositionProps } from "../shared/episode.ts";

const slateBackground = "linear-gradient(140deg, #0f172a 0%, #111827 38%, #1e293b 100%)";

export const Episode0002 = ({ episodeId, title }: EpisodeCompositionProps) => {
  const frame = useCurrentFrame();
  const panelScale = interpolate(frame, [0, 24], [0.92, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const panelOpacity = interpolate(frame, [0, 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: slateBackground,
        color: "#e5eefb",
        fontFamily: '"Aptos Display", "Segoe UI", sans-serif',
        padding: 96,
      }}
    >
      <Sequence from={0}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "0.9fr 1.1fr",
            gap: 40,
            height: "100%",
            alignItems: "stretch",
            opacity: panelOpacity,
            transform: `scale(${panelScale})`,
          }}
        >
          <div
            style={{
              borderRadius: 44,
              background: "linear-gradient(180deg, rgba(14, 165, 233, 0.26), rgba(59, 130, 246, 0.12))",
              border: "1px solid rgba(125, 211, 252, 0.35)",
              padding: 40,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ fontSize: 22, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.72 }}>
                Second composition test
              </div>
              <h1 style={{ margin: "22px 0 0", fontSize: 92, lineHeight: 0.95 }}>{title}</h1>
            </div>
            <div style={{ fontSize: 34, lineHeight: 1.4, opacity: 0.9 }}>
              {episodeId} proves the workspace can support a second composition without hard-wiring everything into the
              first one.
            </div>
          </div>
          <div
            style={{
              borderRadius: 44,
              backgroundColor: "rgba(15, 23, 42, 0.62)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              padding: 40,
              display: "grid",
              gridTemplateRows: "repeat(3, minmax(0, 1fr))",
              gap: 24,
            }}
          >
            <div style={{ borderRadius: 28, backgroundColor: "rgba(30, 41, 59, 0.92)", padding: 28 }}>
              <div style={{ fontSize: 22, textTransform: "uppercase", letterSpacing: "0.16em", opacity: 0.72 }}>
                Episode folder rule
              </div>
              <div style={{ marginTop: 16, fontSize: 34, lineHeight: 1.35 }}>Use folder and file names like Episode0002.</div>
            </div>
            <div style={{ borderRadius: 28, backgroundColor: "rgba(30, 41, 59, 0.92)", padding: 28 }}>
              <div style={{ fontSize: 22, textTransform: "uppercase", letterSpacing: "0.16em", opacity: 0.72 }}>
                Usage display rule
              </div>
              <div style={{ marginTop: 16, fontSize: 34, lineHeight: 1.35 }}>
                Render labels and headings should display Episode 2.
              </div>
            </div>
            <div style={{ borderRadius: 28, backgroundColor: "rgba(30, 41, 59, 0.92)", padding: 28 }}>
              <div style={{ fontSize: 22, textTransform: "uppercase", letterSpacing: "0.16em", opacity: 0.72 }}>
                Next extraction point
              </div>
              <div style={{ marginTop: 16, fontSize: 34, lineHeight: 1.35 }}>
                Only pull common patterns into helpers after both episodes reveal the same need.
              </div>
            </div>
          </div>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};