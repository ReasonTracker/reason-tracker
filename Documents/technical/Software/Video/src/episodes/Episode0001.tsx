import { AbsoluteFill, Sequence, staticFile, useCurrentFrame, interpolate } from "remotion";
import type { EpisodeCompositionProps } from "../shared/episode.ts";

const accentColor = "#14532d";
const accentGlow = "rgba(20, 83, 45, 0.28)";
const pageBackground = "radial-gradient(circle at top left, #ecfccb 0%, #d9f99d 28%, #f7fee7 58%, #ffffff 100%)";

export const Episode0001 = ({ episodeId, title }: EpisodeCompositionProps) => {
  const frame = useCurrentFrame();
  const headingOpacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const headingY = interpolate(frame, [0, 18], [28, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: pageBackground,
        color: "#1f2937",
        fontFamily: '"Aptos", "Segoe UI", sans-serif',
        padding: 96,
      }}
    >
      <Sequence from={0}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 32,
            opacity: headingOpacity,
            transform: `translateY(${headingY}px)`,
          }}
        >
          <div
            style={{
              alignSelf: "flex-start",
              padding: "10px 18px",
              borderRadius: 999,
              backgroundColor: "rgba(255, 255, 255, 0.72)",
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontSize: 24,
            }}
          >
            Visual validation composition
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 112,
              lineHeight: 0.95,
              color: accentColor,
              textShadow: `0 20px 40px ${accentGlow}`,
            }}
          >
            {title}
          </h1>
          <p
            style={{
              margin: 0,
              maxWidth: 1100,
              fontSize: 42,
              lineHeight: 1.35,
            }}
          >
            First test composition for the new Remotion workspace. Script, research, and raw assets belong in
            Documents/Videos/{episodeId} while reusable intros, overlays, and shared audio stay in the Video package.
          </p>
        </div>
      </Sequence>
      <Sequence from={75}>
        <div
          style={{
            marginTop: 120,
            display: "grid",
            gridTemplateColumns: "1.2fr 0.8fr",
            gap: 36,
          }}
        >
          <div
            style={{
              borderRadius: 42,
              padding: 36,
              backgroundColor: "rgba(255, 255, 255, 0.72)",
              boxShadow: "0 24px 60px rgba(15, 23, 42, 0.12)",
            }}
          >
            <div style={{ fontSize: 24, textTransform: "uppercase", letterSpacing: "0.16em", opacity: 0.7 }}>
              Current setup choices
            </div>
            <ul style={{ margin: "26px 0 0", paddingLeft: 32, fontSize: 34, lineHeight: 1.45 }}>
              <li>Episode folders and files use the Episode0001 naming pattern.</li>
              <li>H1 labels render zero-padded numbers as Episode 1 style text.</li>
              <li>Studio is the first preview surface.</li>
              <li>Shared audio starts in the repository.</li>
            </ul>
          </div>
          <div
            style={{
              borderRadius: 42,
              padding: 36,
              backgroundColor: accentColor,
              color: "#f7fee7",
              boxShadow: "0 24px 60px rgba(20, 83, 45, 0.32)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div style={{ fontSize: 24, textTransform: "uppercase", letterSpacing: "0.16em", opacity: 0.8 }}>
              Shared asset placeholders
            </div>
            <div style={{ fontSize: 36, lineHeight: 1.35 }}>
              Use {staticFile("shared/assets/README.md")} and {staticFile("shared/audio/README.md")} as the first tracked
              placeholders until real media is added.
            </div>
          </div>
        </div>
      </Sequence>
    </AbsoluteFill>
  );
};