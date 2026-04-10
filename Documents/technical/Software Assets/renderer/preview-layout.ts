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
        [asConnectorId("edge:1")]: {
            id: asConnectorId("edge:1"),
            source: cA,
            target: cMain,
            affects: "confidence",
        },
        [asConnectorId("edge:2")]: {
            id: asConnectorId("edge:2"),
            source: cB,
            target: cMain,
            affects: "confidence",
        },
        [asConnectorId("edge:3")]: {
            id: asConnectorId("edge:3"),
            source: cC,
            target: cA,
            affects: "confidence",
        },
        [asConnectorId("edge:5")]: {
            id: asConnectorId("edge:5"),
            source: cE,
            target: cB,
            affects: "relevance",
        },
        [asConnectorId("edge:6")]: {
            id: asConnectorId("edge:6"),
            source: cF,
            target: cB,
            affects: "confidence",
        },
        [asConnectorId("edge:9")]: {
            id: asConnectorId("edge:9"),
            source: cI,
            target: cB,
            affects: "confidence",
        },
        [asConnectorId("edge:12")]: {
            id: asConnectorId("edge:12"),
            source: cL,
            target: cA,
            affects: "confidence",
        },
        [asConnectorId("edge:13")]: {
            id: asConnectorId("edge:13"),
            source: cM,
            target: cA,
            affects: "confidence",
        },
        [asConnectorId("edge:14")]: {
            id: asConnectorId("edge:14"),
            source: cN,
            target: cMain,
            affects: "confidence",
        },
        [asConnectorId("edge:15")]: {
            id: asConnectorId("edge:15"),
            source: cO,
            target: cB,
            affects: "confidence",
        },
        [asConnectorId("edge:21")]: {
            id: asConnectorId("edge:21"),
            source: cU,
            target: cN,
            affects: "confidence",
        },
        [asConnectorId("edge:22")]: {
            id: asConnectorId("edge:22"),
            source: cV,
            target: cN,
            affects: "confidence",
        },
        [asConnectorId("edge:23")]: {
            id: asConnectorId("edge:23"),
            source: cW,
            target: cN,
            affects: "confidence",
        },
        [asConnectorId("edge:24")]: {
            id: asConnectorId("edge:24"),
            source: cX,
            target: cMain,
            affects: "confidence",
        },
        [asConnectorId("edge:25")]: {
            id: asConnectorId("edge:25"),
            source: cY,
            target: cMain,
            affects: "confidence",
        },
        [asConnectorId("edge:26")]: {
            id: asConnectorId("edge:26"),
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
        width: 320,
        height: 190,
    };

    const contributorSizing = computeContributorNodeSizing(built.model, {
        applyConfidenceScale: APPLY_CONFIDENCE_SCALE,
        applyRelevanceScale: APPLY_RELEVANCE_SCALE,
        defaultClaimShapeSize,
    });

    const placed = await placeLayoutWithElk(built.model, {
        defaultClaimShapeSize,
        claimShapeSizeByClaimShapeId: contributorSizing.claimShapeSizeByClaimShapeId,
        claimShapeSpacing: 8,
        layerSpacing: 180,
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
        brandCssHref: "../../website/site/css/brand.css",
        useClaimShapeTransformScale: APPLY_CONFIDENCE_SCALE || APPLY_RELEVANCE_SCALE,
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
