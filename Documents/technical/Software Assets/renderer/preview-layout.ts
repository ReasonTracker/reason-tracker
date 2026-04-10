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

// AGENT NOTE: Keep preview layout tuning constants grouped here directly below imports.
const PREVIEW_LAYOUT_CONFIG = {
    sizing: {
        applyConfidenceScale: true,
        applyRelevanceScale: true,
        defaultClaimShape: {
            width: 320,
            height: 190,
        },
    },
    elk: {
        peerGap: 20,
        layerGap: 180,
        connectorClaimShapeGap: 32,
        favorStraightEdges: true,
        bkFixedAlignment: "LEFTUP" as const,
    },
    connectorGeometry: {
        connectorPathShape: "elk-bends" as const,
        sourceSideStraightSegmentPercent: 0.5,
        targetSideStraightSegmentPercent: 0.3,
        spreadTargetAnchorY: true,
    },
    debug: {
        connectorOrder: true,
    },
};

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

    const defaultClaimShapeSize = {
        width: PREVIEW_LAYOUT_CONFIG.sizing.defaultClaimShape.width,
        height: PREVIEW_LAYOUT_CONFIG.sizing.defaultClaimShape.height,
    };

    const contributorSizing = computeContributorNodeSizing(built.model, {
        ...PREVIEW_LAYOUT_CONFIG.sizing,
        defaultClaimShapeSize,
    });

    const placed = await placeLayoutWithElk(built.model, {
        defaultClaimShapeSize,
        claimShapeSizeByClaimShapeId: contributorSizing.claimShapeSizeByClaimShapeId,
        ...PREVIEW_LAYOUT_CONFIG.elk,
        ...PREVIEW_LAYOUT_CONFIG.connectorGeometry,
        debugConnectorOrder: PREVIEW_LAYOUT_CONFIG.debug.connectorOrder,
    });

    if (!placed.ok) {
        throw new Error(`placeLayoutWithElk failed: ${placed.error.code} ${placed.error.message}`);
    }

    const { html } = renderWebDocument(placed.model, {
        title: "Reason Tracker Layout Preview",
        includeScore: true,
        brandCssHref: "../../website/site/css/brand.css",
        useClaimShapeTransformScale: PREVIEW_LAYOUT_CONFIG.sizing.applyConfidenceScale || PREVIEW_LAYOUT_CONFIG.sizing.applyRelevanceScale,
        claimShapeScaleByClaimShapeId: contributorSizing.claimShapeScaleByClaimShapeId,
        claimShapeTransformBaseSize: defaultClaimShapeSize,
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
