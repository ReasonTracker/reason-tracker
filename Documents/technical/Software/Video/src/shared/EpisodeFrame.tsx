import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";

type EpisodeFrameProps = {
  background: string;
  color: string;
  fontFamily: string;
  children: ReactNode;
  contentStyle?: CSSProperties;
};

export const EpisodeFrame = ({ background, color, fontFamily, children, contentStyle }: EpisodeFrameProps) => {
  return (
    <AbsoluteFill className="rt-episode-frame" style={{ background, color, fontFamily }}>
      <div className="rt-episode-frame__content" style={contentStyle}>
        {children}
      </div>
    </AbsoluteFill>
  );
};