import type { PathGeometryCommand } from "../../../../components/src/index";

export function pathGeometryCommandsToSvgPathData(
	commands: PathGeometryCommand[],
): string {
	return commands
		.map((command) => {
			if (command.kind === "moveTo") {
				return `M ${command.x} ${command.y}`;
			}

			if (command.kind === "lineTo") {
				return `L ${command.x} ${command.y}`;
			}

			if (command.kind === "arc") {
				return `A ${command.rx} ${command.ry} ${command.xAxisRotation} ${command.largeArc ? 1 : 0} ${command.sweep ? 1 : 0} ${command.x} ${command.y}`;
			}
		})
		.join(" ");
}