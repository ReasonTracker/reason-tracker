export function sortSourceIdsFirst(connectors) {
  const edges = Object.values(connectors).map((c) => [c.target, c.source]);
  const nodes = new Set();
  const outgoing = new Map();
  const incomingCount = new Map();

  for (const [target, source] of edges) {
    nodes.add(target);
    nodes.add(source);
    if (!outgoing.has(source)) {
      outgoing.set(source, new Set());
    }
    outgoing.get(source).add(target);

    incomingCount.set(target, (incomingCount.get(target) ?? 0) + 1);
    incomingCount.set(source, incomingCount.get(source) ?? 0);
  }

  const queue = Array.from(nodes).filter((node) => (incomingCount.get(node) ?? 0) === 0);
  const sorted = [];

  while (queue.length > 0) {
    const node = queue.shift();
    sorted.push(node);
    const nextNodes = outgoing.get(node);
    if (!nextNodes) {
      continue;
    }

    for (const next of nextNodes) {
      const nextCount = (incomingCount.get(next) ?? 0) - 1;
      incomingCount.set(next, nextCount);
      if (nextCount === 0) {
        queue.push(next);
      }
    }
  }

  if (sorted.length < nodes.size) {
    for (const node of nodes) {
      if (!sorted.includes(node)) {
        sorted.push(node);
      }
    }
  }

  return sorted;
}

export function createConnectorsIndexes(debate) {
  const connectorsIndexes = {
    bySource: {},
    byTarget: {}
  };

  Object.values(debate.connectors).forEach((connector) => {
    (connectorsIndexes.byTarget[connector.target] ??= []).push(connector);
    (connectorsIndexes.bySource[connector.source] ??= []).push(connector);
  });

  return connectorsIndexes;
}

function scoreWeight(score) {
  if (!score) {
    return 0;
  }
  return Math.abs(score.confidence) * score.relevance;
}

export function calculateConfidence(children) {
  if (children.length < 1) {
    return {
      confidence: 1,
      reversibleConfidence: 1
    };
  }

  let childrenWeight = 0;
  for (const child of children) {
    if (!child.score) {
      continue;
    }
    childrenWeight += scoreWeight(child.score);
  }

  let confidence = 0;
  if (childrenWeight !== 0) {
    for (const child of children) {
      if (!child.score) {
        continue;
      }
      confidence +=
        ((child.score.confidence * scoreWeight(child.score)) / childrenWeight) *
        (child.connector?.proTarget === false ? -1 : 1);
    }
  }

  const reversibleConfidence = confidence;
  if (confidence < 0) {
    confidence = 0;
  }

  return {
    confidence,
    reversibleConfidence
  };
}

export function calculateRelevance(children) {
  if (children.length < 1) {
    return 1;
  }

  let relevance = 1;
  for (const child of children) {
    if (child?.score?.confidence > 0) {
      if (child.connector?.proTarget) {
        relevance += child.score.confidence;
      } else {
        relevance -= child.score.confidence / 2;
      }
    }
  }

  if (relevance < 0) {
    relevance = 0;
  }

  return relevance;
}

export function calculateScore(debate, id, scores, connectorsByTarget) {
  const claim = debate.claims[id];
  if (!claim) {
    throw new Error(`calculateScore: no claim found for id '${id}' referenced by a connector`);
  }

  const children =
    connectorsByTarget[id]?.map((connector) => {
      const score = scores[connector.source];
      return { score, connector };
    }) ?? [];

  const confidenceChildren = children.filter(
    (child) => child.score !== undefined && child.connector?.affects === "confidence"
  );
  const relevanceChildren = children.filter(
    (child) => child.score !== undefined && child.connector?.affects === "relevance"
  );

  const { confidence, reversibleConfidence } = calculateConfidence(confidenceChildren);

  return {
    type: "score",
    id: claim.id,
    relevance: calculateRelevance(relevanceChildren),
    confidence: claim.forceConfidence ?? confidence,
    reversibleConfidence
  };
}

export function calculateScores(debate) {
  let ids = sortSourceIdsFirst(debate.connectors);
  if (ids.length === 0) {
    ids = Object.keys(debate.claims);
  }

  const scores = {};
  const connectorsByTarget = createConnectorsIndexes(debate).byTarget;

  for (const id of ids) {
    const newScore = calculateScore(debate, id, scores, connectorsByTarget);
    scores[newScore.id] = newScore;
  }

  return scores;
}
