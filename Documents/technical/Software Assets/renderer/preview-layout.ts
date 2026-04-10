import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
    CalculatedDebate,
    Claim,
    ClaimId,
    Connector,
    ConnectorId,
    DebateId,
    Score,
} from "@reasontracker/contracts";
import {
    buildLayoutModel,
    placeLayoutWithElk,
    renderWebDocument,
} from "./src/index.ts";

function asClaimId(value: string): ClaimId {
    return value as ClaimId;
}

function asConnectorId(value: string): ConnectorId {
    return value as ConnectorId;
}

function asDebateId(value: string): DebateId {
    return value as DebateId;
}

function score(id: string, confidence: number, relevance: number): Score {
    return {
        id: id as Score["id"],
        confidence,
        reversibleConfidence: confidence * 2 - 1,
        relevance,
    };
}

function buildSampleCalculatedDebate(): CalculatedDebate {
    const cMain = asClaimId("claim:main");
    const cA = asClaimId("claim:a");
    const cB = asClaimId("claim:b");
    const cC = asClaimId("claim:c");
    const cD = asClaimId("claim:d");
    const cE = asClaimId("claim:e");
    const cF = asClaimId("claim:f");
    const cG = asClaimId("claim:g");
    const cH = asClaimId("claim:h");
    const cI = asClaimId("claim:i");
    const cJ = asClaimId("claim:j");
    const cK = asClaimId("claim:k");

    const claims: Record<ClaimId, Claim> = {
        [cMain]: { id: cMain, content: "Main claim", pol: "pro" },
        [cA]: { id: cA, content: "Evidence A", pol: "pro" },
        [cB]: { id: cB, content: "Counterpoint B", pol: "con" },
        [cC]: { id: cC, content: "Sub reason C", pol: "pro" },
        [cD]: { id: cD, content: "Sub reason D", pol: "pro" },
        [cE]: { id: cE, content: "Alternative source E", pol: "pro" },
        [cF]: { id: cF, content: "Alternative source F", pol: "con" },
        [cG]: { id: cG, content: "Detail G", pol: "pro" },
        [cH]: { id: cH, content: "Detail H", pol: "pro" },
        [cI]: { id: cI, content: "Detail I", pol: "pro" },
        [cJ]: { id: cJ, content: "Detail J", pol: "con" },
        [cK]: { id: cK, content: "Detail K", pol: "pro" },
    };

    const connectors: Record<ConnectorId, Connector> = {
        [asConnectorId("edge:1")]: {
            id: asConnectorId("edge:1"),
            source: cA,
            target: cMain,
            proTarget: true,
            affects: "confidence",
        },
        [asConnectorId("edge:2")]: {
            id: asConnectorId("edge:2"),
            source: cB,
            target: cMain,
            proTarget: false,
            affects: "confidence",
        },
        [asConnectorId("edge:3")]: {
            id: asConnectorId("edge:3"),
            source: cC,
            target: cA,
            proTarget: true,
            affects: "relevance",
        },
        [asConnectorId("edge:4")]: {
            id: asConnectorId("edge:4"),
            source: cD,
            target: cC,
            proTarget: true,
            affects: "confidence",
        },
        [asConnectorId("edge:5")]: {
            id: asConnectorId("edge:5"),
            source: cE,
            target: cB,
            proTarget: true,
            affects: "confidence",
        },
        [asConnectorId("edge:6")]: {
            id: asConnectorId("edge:6"),
            source: cF,
            target: cB,
            proTarget: false,
            affects: "relevance",
        },
        [asConnectorId("edge:7")]: {
            id: asConnectorId("edge:7"),
            source: cG,
            target: cC,
            proTarget: true,
            affects: "confidence",
        },
        [asConnectorId("edge:8")]: {
            id: asConnectorId("edge:8"),
            source: cH,
            target: cC,
            proTarget: true,
            affects: "relevance",
        },
        [asConnectorId("edge:9")]: {
            id: asConnectorId("edge:9"),
            source: cI,
            target: cE,
            proTarget: true,
            affects: "confidence",
        },
        [asConnectorId("edge:10")]: {
            id: asConnectorId("edge:10"),
            source: cJ,
            target: cF,
            proTarget: false,
            affects: "confidence",
        },
        [asConnectorId("edge:11")]: {
            id: asConnectorId("edge:11"),
            source: cK,
            target: cD,
            proTarget: true,
            affects: "relevance",
        },
    };

    const scores: Record<ClaimId, Score> = {
        [cMain]: score("score:main", 0.71, 1),
        [cA]: score("score:a", 0.84, 0.9),
        [cB]: score("score:b", 0.42, 1.1),
        [cC]: score("score:c", 0.67, 0.8),
        [cD]: score("score:d", 0.58, 0.7),
        [cE]: score("score:e", 0.61, 0.9),
        [cF]: score("score:f", 0.47, 0.95),
        [cG]: score("score:g", 0.73, 0.85),
        [cH]: score("score:h", 0.64, 0.75),
        [cI]: score("score:i", 0.69, 0.82),
        [cJ]: score("score:j", 0.38, 0.92),
        [cK]: score("score:k", 0.66, 0.7),
    };

    return {
        id: asDebateId("debate:preview"),
        name: "Renderer Preview",
        description: "Preview graph for ELK layout and SVG connectors",
        mainClaimId: cMain,
        claims,
        connectors,
        scores,
    };
}

async function main(): Promise<void> {
    const debate = buildSampleCalculatedDebate();

    const built = buildLayoutModel({
        calculatedDebate: debate,
        cycleMode: "preserve",
    });

    if (!built.ok) {
        throw new Error(`buildLayoutModel failed: ${built.error.code} ${built.error.message}`);
    }

    const placed = await placeLayoutWithElk(built.model, {
        defaultNodeSize: {
            width: 320,
            height: 190,
        },
        nodeSpacing: 36,
        layerSpacing: 108,
    });

    if (!placed.ok) {
        throw new Error(`placeLayoutWithElk failed: ${placed.error.code} ${placed.error.message}`);
    }

    const { html } = renderWebDocument(placed.model, {
        title: "Reason Tracker Layout Preview",
        includeScore: true,
        density: "comfortable",
    });

    const outDir = resolve(process.cwd(), "preview");
    const outPath = resolve(outDir, "layout-preview.html");
    await mkdir(outDir, { recursive: true });
    await writeFile(outPath, html, "utf8");

    process.stdout.write(`${outPath}\n`);
}

main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
});
