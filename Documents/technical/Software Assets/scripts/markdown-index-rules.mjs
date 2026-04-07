const DEFAULT_INDEX_CANDIDATE_KEYS = ["readme", "index"];

export function normalizeMdStemKey(fileName) {
  const parsed = parseMarkdownFileName(fileName);
  if (!parsed) {
    return null;
  }

  return parsed.stem
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function normalizeCandidateStemKey(fileName) {
  const parsed = parseMarkdownFileName(fileName);
  if (parsed) {
    return normalizeMdStemKey(fileName);
  }

  return String(fileName || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .trim();
}

function resolveIndexCandidateKeys(indexCandidateKeys) {
  const values = Array.isArray(indexCandidateKeys)
    ? indexCandidateKeys
    : DEFAULT_INDEX_CANDIDATE_KEYS;

  const normalized = values
    .map((entry) => normalizeCandidateStemKey(entry))
    .filter(Boolean);

  if (normalized.length === 0) {
    return DEFAULT_INDEX_CANDIDATE_KEYS;
  }

  return [...new Set(normalized)];
}

export function parseMarkdownFileName(fileName) {
  const value = String(fileName || "").trim();
  const match = value.match(/^(.*?)(?:\s*\.\s*md)\s*$/i);
  if (!match) {
    return null;
  }

  return {
    stem: match[1] ?? "",
  };
}

export function getIndexCandidateRank(fileName, options = {}) {
  const stemKey = normalizeMdStemKey(fileName);
  if (!stemKey) {
    return null;
  }

  const indexCandidateKeys = resolveIndexCandidateKeys(options.indexCandidateKeys);
  const index = indexCandidateKeys.indexOf(stemKey);
  return index >= 0 ? index : null;
}

export function isIndexCandidateFileName(fileName, options = {}) {
  return getIndexCandidateRank(fileName, options) !== null;
}

export function selectPreferredIndex(entries, getName = (entry) => entry, options = {}) {
  const ranked = entries
    .map((entry) => {
      const name = getName(entry);
      return {
        entry,
        name,
        rank: getIndexCandidateRank(name, options),
      };
    })
    .filter((item) => item.rank !== null)
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
    selected: ranked[0].entry,
    rankedCandidates: ranked,
    nonSelectedCandidates: ranked.slice(1).map((item) => item.entry),
    conflict: null,
  };
}
