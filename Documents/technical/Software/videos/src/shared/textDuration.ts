// AGENT NOTE: Keep text-timing values together so episode pacing is easy to tune.

/** Non-whitespace characters displayed per minute when using text-based duration. */
export const TEXT_CHARACTERS_PER_MINUTE = 1000;

export function calculateTextDurationSeconds(text: string): number {
    const characterCount = [...text].filter((character) => !/\s/.test(character)).length;
    return characterCount / TEXT_CHARACTERS_PER_MINUTE * 60;
}