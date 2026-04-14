// See 📌README.md in this folder for local coding standards before editing this file.

import { createElement } from "react";
import { registerRoot } from "remotion";
import { Episode0001Composition } from "./episode0001.tsx";

export const RemotionRoot = () => {
	return createElement(Episode0001Composition);
};

registerRoot(RemotionRoot);