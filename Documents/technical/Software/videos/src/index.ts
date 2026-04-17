// See 📌README.md in this folder for local coding standards before editing this file.

import "../../website/site/css/brand.css";
import { createElement } from "react";
import { AbsoluteFill, Composition, registerRoot } from "remotion";

export const RemotionRoot = () => {
	return createElement(Composition, {
		id: "StarterComposition",
		component: StarterComposition,
		durationInFrames: 150,
		fps: 30,
		height: 1080,
		width: 1920,
	});
};

const StarterComposition = () => {
	return createElement(
		AbsoluteFill,
		{
			style: {
				alignItems: "center",
				background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)",
				color: "#f8fafc",
				display: "flex",
				fontFamily: '"Segoe UI", sans-serif',
				fontSize: 72,
				fontWeight: 700,
				justifyContent: "center",
				letterSpacing: "0.04em",
			},
		},
		"Reason Tracker",
	);
};

registerRoot(RemotionRoot);