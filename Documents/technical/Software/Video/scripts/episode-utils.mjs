export function normalizeEpisodeId(value) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const directMatch = /^Episode(\d+)$/i.exec(trimmed);

  if (directMatch) {
    return `Episode${directMatch[1].padStart(4, "0")}`;
  }

  const numericMatch = /^(\d+)$/.exec(trimmed);

  if (numericMatch) {
    return `Episode${numericMatch[1].padStart(4, "0")}`;
  }

  return null;
}

export function toEpisodeDisplayName(value) {
  const matched = /^Episode(\d+)$/.exec(value);

  if (!matched) {
    return value;
  }

  return `Episode ${Number.parseInt(matched[1], 10)}`;
}