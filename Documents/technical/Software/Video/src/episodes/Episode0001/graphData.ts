import type {
  Claim,
  ClaimId,
  Connector,
  ConnectorId,
  Debate,
  DebateId,
} from "@reasontracker/contracts";

function asClaimId(value: string): ClaimId {
  return value as ClaimId;
}

function asConnectorId(value: string): ConnectorId {
  return value as ConnectorId;
}

function asDebateId(value: string): DebateId {
  return value as DebateId;
}

const cMain = asClaimId("main");
const cA = asClaimId("a");
const cB = asClaimId("b");
const cC = asClaimId("c");
const cE = asClaimId("e");
const cF = asClaimId("f");
const cI = asClaimId("i");
const cL = asClaimId("l");
const cM = asClaimId("m");
const cN = asClaimId("n");
const cO = asClaimId("o");
const cU = asClaimId("u");
const cV = asClaimId("v");
const cW = asClaimId("w");
const cX = asClaimId("x");
const cY = asClaimId("y");
const cZ = asClaimId("z");

const claims: Record<ClaimId, Claim> = {
  [cMain]: { id: cMain, content: "Main claim", side: "proMain" },
  [cA]: { id: cA, content: "Evidence A", side: "proMain" },
  [cB]: { id: cB, content: "Counterpoint B", side: "proMain" },
  [cC]: { id: cC, content: "Sub reason C", side: "proMain" },
  [cE]: { id: cE, content: "Alternative source E", side: "proMain" },
  [cF]: { id: cF, content: "Alternative source F", side: "proMain" },
  [cI]: { id: cI, content: "Detail I", side: "proMain" },
  [cL]: { id: cL, content: "Counterpoint L", side: "conMain" },
  [cM]: { id: cM, content: "Support M", side: "proMain" },
  [cN]: { id: cN, content: "Counterpoint N", side: "conMain" },
  [cO]: { id: cO, content: "Counterpoint O", side: "conMain" },
  [cU]: { id: cU, content: "Support U", side: "conMain" },
  [cV]: { id: cV, content: "Support V", side: "conMain" },
  [cW]: { id: cW, content: "Counterpoint W", side: "proMain" },
  [cX]: { id: cX, content: "Support X", side: "proMain" },
  [cY]: { id: cY, content: "Counterpoint Y", side: "conMain" },
  [cZ]: { id: cZ, content: "Counterpoint Z", side: "proMain" },
};

const connectors: Record<ConnectorId, Connector> = {
  [asConnectorId("connector:1")]: {
    id: asConnectorId("connector:1"),
    source: cA,
    target: cMain,
    affects: "confidence",
  },
  [asConnectorId("connector:2")]: {
    id: asConnectorId("connector:2"),
    source: cB,
    target: cMain,
    affects: "confidence",
  },
  [asConnectorId("connector:3")]: {
    id: asConnectorId("connector:3"),
    source: cC,
    target: cA,
    affects: "confidence",
  },
  [asConnectorId("connector:5")]: {
    id: asConnectorId("connector:5"),
    source: cE,
    target: cB,
    affects: "relevance",
  },
  [asConnectorId("connector:6")]: {
    id: asConnectorId("connector:6"),
    source: cF,
    target: cB,
    affects: "confidence",
  },
  [asConnectorId("connector:9")]: {
    id: asConnectorId("connector:9"),
    source: cI,
    target: cB,
    affects: "confidence",
  },
  [asConnectorId("connector:12")]: {
    id: asConnectorId("connector:12"),
    source: cL,
    target: cA,
    affects: "confidence",
  },
  [asConnectorId("connector:13")]: {
    id: asConnectorId("connector:13"),
    source: cM,
    target: cA,
    affects: "confidence",
  },
  [asConnectorId("connector:14")]: {
    id: asConnectorId("connector:14"),
    source: cN,
    target: cMain,
    affects: "confidence",
  },
  [asConnectorId("connector:15")]: {
    id: asConnectorId("connector:15"),
    source: cO,
    target: cB,
    affects: "confidence",
  },
  [asConnectorId("connector:21")]: {
    id: asConnectorId("connector:21"),
    source: cU,
    target: cN,
    affects: "confidence",
  },
  [asConnectorId("connector:22")]: {
    id: asConnectorId("connector:22"),
    source: cV,
    target: cN,
    affects: "confidence",
  },
  [asConnectorId("connector:23")]: {
    id: asConnectorId("connector:23"),
    source: cW,
    target: cN,
    affects: "confidence",
  },
  [asConnectorId("connector:24")]: {
    id: asConnectorId("connector:24"),
    source: cX,
    target: cMain,
    affects: "confidence",
  },
  [asConnectorId("connector:25")]: {
    id: asConnectorId("connector:25"),
    source: cY,
    target: cMain,
    affects: "confidence",
  },
  [asConnectorId("connector:26")]: {
    id: asConnectorId("connector:26"),
    source: cZ,
    target: cY,
    affects: "confidence",
  },
};

export const episode0001Debate: Debate = {
  id: asDebateId("debate:episode-0001"),
  name: "Episode 0001 graph",
  description: "Reason Tracker graph for Episode 0001.",
  mainClaimId: cMain,
  claims,
  connectors,
};
