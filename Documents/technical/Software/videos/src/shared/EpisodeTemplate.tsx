// See 📌README.md in this folder for local coding standards before editing this file.

import type { ReactNode } from "react";
import { EpisodeFrame } from "./EpisodeFrame.tsx";

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