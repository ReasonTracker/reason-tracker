const INDEX_CANDIDATE_KEYS = ["_starthere", "readme", "index"];

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

export function getIndexCandidateRank(fileName) {
  const stemKey = normalizeMdStemKey(fileName);
  if (!stemKey) {
    return null;
  }

  const index = INDEX_CANDIDATE_KEYS.indexOf(stemKey);
  return index >= 0 ? index : null;
}

export function isIndexCandidateFileName(fileName) {
  return getIndexCandidateRank(fileName) !== null;
}

export function selectPreferredIndex(entries, getName = (entry) => entry) {
  const ranked = entries
    .map((entry) => {
      const name = getName(entry);
      return {
        entry,
        name,
        rank: getIndexCandidateRank(name),
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
