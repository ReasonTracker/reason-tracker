import { useCurrentFrame } from "remotion";

export type TimedCharacterRevealProps = {
	durationInFrames: number
	from: number
	text: string
};

export function TimedCharacterReveal({
	durationInFrames,
	from,
	text,
}: TimedCharacterRevealProps) {
	const frame = useCurrentFrame();
	if (frame - from >= durationInFrames) {
		return text;
	}

	const characters = Array.from(text);
	const elapsedFrames = Math.max(0, Math.min(durationInFrames, frame - from));
	const revealedCharacterCount = Math.floor(
		(characters.length * elapsedFrames) / durationInFrames,
	);

	return characters.map((character, index) => (
		<span key={index} style={index < revealedCharacterCount ? undefined : hiddenCharacterStyle}>
			{character}
		</span>
	));
}

const hiddenCharacterStyle = { visibility: "hidden" } as const;