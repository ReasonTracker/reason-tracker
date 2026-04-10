import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runCli } from "@reasontracker/engine";
import type {
    Claim,
    ClaimId,
    Connector,
    ConnectorId,
    Debate,
    DebateId,
} from "@reasontracker/contracts";
import {
    buildLayoutModel,
    computeContributorNodeSizing,
    placeLayoutWithElk,
    renderWebDocument,
} from "./src/index.ts";

const APPLY_CONFIDENCE_SCALE = true;
const APPLY_RELEVANCE_SCALE = true;

function asClaimId(value: string): ClaimId {
    return value as ClaimId;
}

function asConnectorId(value: string): ConnectorId {
    return value as ConnectorId;
}

function asDebateId(value: string): DebateId {
    return value as DebateId;
}

function buildSampleDebate(): Debate {
    const cMain = asClaimId("main");
    const cA = asClaimId("a");
    const cB = asClaimId("b");
    const cC = asClaimId("c");
    const cD = asClaimId("d");
    const cE = asClaimId("e");
    const cF = asClaimId("f");
    const cG = asClaimId("g");
    const cH = asClaimId("h");
    const cI = asClaimId("i");
    const cJ = asClaimId("j");
    const cK = asClaimId("k");

    const claims: Record<ClaimId, Claim> = {
        [cMain]: { id: cMain, content: "Main claim", pol: "pro" },
        [cA]: { id: cA, content: "Evidence A", pol: "pro" },
        [cB]: { id: cB, content: "Counterpoint B", pol: "pro" },
        [cC]: { id: cC, content: "Sub reason C", pol: "pro" },
        [cD]: { id: cD, content: "Sub reason D", pol: "pro" },
        [cE]: { id: cE, content: "Alternative source E", pol: "pro" },
        [cF]: { id: cF, content: "Alternative source F", pol: "pro" },
        [cG]: { id: cG, content: "Detail G", pol: "pro" },
        [cH]: { id: cH, content: "Detail H", pol: "pro" },
        [cI]: { id: cI, content: "Detail I", pol: "pro" },
        [cJ]: { id: cJ, content: "Detail J", pol: "pro" },
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
            proTarget: true,
            affects: "confidence",
        },
        [asConnectorId("edge:3")]: {
            id: asConnectorId("edge:3"),
            source: cC,
            target: cA,
            proTarget: true,
            affects: "confidence",
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
            affects: "relevance",
        },
        [asConnectorId("edge:6")]: {
            id: asConnectorId("edge:6"),
            source: cF,
            target: cB,
            proTarget: true,
            affects: "confidence",
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
            affects: "confidence",
        },
        [asConnectorId("edge:9")]: {
            id: asConnectorId("edge:9"),
            source: cI,
            target: cB,
            proTarget: true,
            affects: "confidence",
        },
        [asConnectorId("edge:10")]: {
            id: asConnectorId("edge:10"),
            source: cJ,
            target: cF,
            proTarget: true,
            affects: "confidence",
        },
        [asConnectorId("edge:11")]: {
            id: asConnectorId("edge:11"),
            source: cK,
            target: cD,
            proTarget: true,
            affects: "confidence",
        },
    };

    return {
        id: asDebateId("debate:preview"),
        name: "Renderer Preview",
        description: "Preview graph for ELK layout and SVG connectors",
        mainClaimId: cMain,
        claims,
        connectors,
    };
}

async function main(): Promise<void> {
    const debate = buildSampleDebate();

    const calculation = runCli({
        command: "calculateDebate",
        debate,
        cycleHandling: "fail",
    });

    if (!calculation.ok) {
        throw new Error(`calculateDebate failed: ${calculation.error.code} ${calculation.error.message}`);
    }

    const built = buildLayoutModel({
        calculatedDebate: calculation.calculatedDebate,
        cycleMode: "preserve",
    });

    if (!built.ok) {
        throw new Error(`buildLayoutModel failed: ${built.error.code} ${built.error.message}`);
    }

    const defaultNodeSize = {
        width: 320,
        height: 190,
    };

    const contributorSizing = computeContributorNodeSizing(built.model, {
        applyConfidenceScale: APPLY_CONFIDENCE_SCALE,
        applyRelevanceScale: APPLY_RELEVANCE_SCALE,
        defaultNodeSize,
    });

    const placed = await placeLayoutWithElk(built.model, {
        defaultNodeSize,
        nodeSizeByNodeId: contributorSizing.nodeSizeByNodeId,
        nodeSpacing: 36,
        layerSpacing: 108,
        favorStraightEdges: true,
        bkFixedAlignment: "LEFTUP",
    });

    if (!placed.ok) {
        throw new Error(`placeLayoutWithElk failed: ${placed.error.code} ${placed.error.message}`);
    }

    const { html } = renderWebDocument(placed.model, {
        title: "Reason Tracker Layout Preview",
        includeScore: true,
        density: "comfortable",
        useNodeTransformScale: APPLY_CONFIDENCE_SCALE || APPLY_RELEVANCE_SCALE,
        nodeScaleByNodeId: contributorSizing.nodeScaleByNodeId,
        nodeTransformBaseSize: defaultNodeSize,
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
