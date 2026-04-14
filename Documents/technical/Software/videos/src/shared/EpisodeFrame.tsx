// See 📌README.md in this folder for local coding standards before editing this file.

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
		<AbsoluteFill style={{ background, color, fontFamily }}>
			<div style={{ width: "100%", height: "100%", position: "relative", ...contentStyle }}>{children}</div>
		</AbsoluteFill>
	);
};