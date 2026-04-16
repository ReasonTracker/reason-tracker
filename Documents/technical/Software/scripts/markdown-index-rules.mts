const DEFAULT_INDEX_CANDIDATE_KEYS = ["readme", "index"];

export function normalizeMdStemKey(fileName: string): string | null {
  const parsed = parseMarkdownFileName(fileName);
  if (!parsed) {
    return null;
  }

  const normalized = parsed.stem
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();

  return normalized.replace(/^[^a-z0-9]+/, "");
}

function normalizeCandidateStemKey(fileName: string): string {
  const parsed = parseMarkdownFileName(fileName);
  if (parsed) {
    return normalizeMdStemKey(fileName) ?? "";
  }

  return String(fileName || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function resolveIndexCandidateKeys(indexCandidateKeys?: string[]): string[] {
  const values = Array.isArray(indexCandidateKeys)
    ? indexCandidateKeys
    : DEFAULT_INDEX_CANDIDATE_KEYS;

  const normalized = values.map((entry) => normalizeCandidateStemKey(entry)).filter(Boolean);

  if (normalized.length === 0) {
    return DEFAULT_INDEX_CANDIDATE_KEYS;
  }

  return [...new Set(normalized)];
}

export function parseMarkdownFileName(fileName: string): { stem: string } | null {
  const value = String(fileName || "").trim();
  const match = value.match(/^(.*?)(?:\s*\.\s*md)\s*$/i);
  if (!match) {
    return null;
  }

  return {
    stem: match[1] ?? "",
  };
}

export function getIndexCandidateRank(fileName: string, options: { indexCandidateKeys?: string[] } = {}): number | null {
  const stemKey = normalizeMdStemKey(fileName);
  if (!stemKey) {
    return null;
  }

  const indexCandidateKeys = resolveIndexCandidateKeys(options.indexCandidateKeys);
  const index = indexCandidateKeys.indexOf(stemKey);
  return index >= 0 ? index : null;
}

export function isIndexCandidateFileName(fileName: string, options: { indexCandidateKeys?: string[] } = {}): boolean {
  return getIndexCandidateRank(fileName, options) !== null;
}

type RankedCandidate<T> = {
  entry: T;
  name: string;
  rank: number | null;
};

export function selectPreferredIndex<T>(
  entries: T[],
  getName: (entry: T) => string = (entry) => String(entry),
  options: { indexCandidateKeys?: string[] } = {},
): {
  selected: T | null;
  rankedCandidates: RankedCandidate<T>[];
  nonSelectedCandidates: T[];
  conflict: { rank: number | null; names: string[] } | null;
} {
  const ranked = entries
    .map((entry) => {
      const name = getName(entry);
      return {
        entry,
        name,
        rank: getIndexCandidateRank(name, options),
      };
    })
    .filter((item): item is RankedCandidate<T> & { rank: number } => item.rank !== null)
    .sort((a, b) => a.rank - b.rank || String(a.name).localeCompare(String(b.name)));

  if (ranked.length === 0) {
    return {
      selected: null,
      rankedCandidates: [],
      nonSelectedCandidates: [],
      conflict: null,
    };
  }

  const bestRank = ranked[0].rank;
  const best = ranked.filter((item) => item.rank === bestRank);
  if (best.length > 1) {
    return {
      selected: null,
      rankedCandidates: ranked,
      nonSelectedCandidates: ranked.map((item) => item.entry),
      conflict: {
        rank: bestRank,
        names: best.map((item) => String(item.name)),
      },
    };
  }

  return {
    selected: ranked[0]?.entry ?? null,
    rankedCandidates: ranked,
    nonSelectedCandidates: ranked.slice(1).map((item) => item.entry),
    conflict: null,
  };
}