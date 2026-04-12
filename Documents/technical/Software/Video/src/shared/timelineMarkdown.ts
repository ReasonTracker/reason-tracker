import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { buildTimelineTimes, wait, type TimelineBuildResult, type TimelineEntry, type TimelineSegment } from "./timeline.ts";

type TimelineBlockDefinition = {
  id: string;
  parentId?: string;
  entries: TimelineEntry<string>[];
};

export type ParsedTimelineDocument = {
  timelines: Record<string, TimelineBuildResult<string>>;
  totalDurationInFrames: number;
};

type MarkdownTimelineOptions = {
  src: string;
  fps: number;
};

export function useMarkdownTimelineDocument({ src, fps }: MarkdownTimelineOptions): ParsedTimelineDocument | null {
  const [document, setDocument] = useState<ParsedTimelineDocument | null>(null);
  const [renderHandle] = useState(() => delayRender(`Load markdown timeline: ${src}`));

  useEffect(() => {
    let isActive = true;

    fetch(staticFile(src))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load timeline markdown: ${src}`);
        }

        return response.text();
      })
      .then((markdown) => {
        if (!isActive) {
          return;
        }

        setDocument(parseTimelineMarkdown(markdown, fps));
        continueRender(renderHandle);
      })
      .catch((error: unknown) => {
        cancelRender(error instanceof Error ? error : new Error(String(error)));
      });

    return () => {
      isActive = false;
    };
  }, [fps, renderHandle, src]);

  return document;
}

export function parseTimelineMarkdown(markdown: string, fps: number): ParsedTimelineDocument {
  const tableBlocks = extractTableBlocks(markdown);

  if (tableBlocks.length !== 1) {
    throw new Error("Timeline markdown must contain exactly one table.");
  }

  const definitions = buildTimelineDefinitions(parseMarkdownTable(tableBlocks[0]));

  const timelines: Record<string, TimelineBuildResult<string>> = {};
  const knownSegments: Record<string, TimelineSegment> = {};
  let totalDurationInFrames = 0;

  for (const definition of definitions) {
    const localTimeline = buildTimelineTimes(definition.entries, fps);
    const parentOffset = definition.parentId ? knownSegments[definition.parentId]?.from : 0;

    if (definition.parentId && parentOffset == null) {
      throw new Error(`Unknown parentId "${definition.parentId}" for timeline "${definition.id}".`);
    }

    const times = Object.fromEntries(
      Object.entries(localTimeline.times).map(([id, segment]) => {
        const absoluteSegment = {
          from: segment.from + (parentOffset ?? 0),
          durationInFrames: segment.durationInFrames,
        };

        if (knownSegments[id]) {
          throw new Error(`Duplicate timeline id "${id}" in markdown timelines.`);
        }

        knownSegments[id] = absoluteSegment;
        totalDurationInFrames = Math.max(totalDurationInFrames, absoluteSegment.from + absoluteSegment.durationInFrames);
        return [id, absoluteSegment];
      }),
    );

    timelines[definition.id] = {
      times,
      totalDurationInFrames: localTimeline.totalDurationInFrames + (parentOffset ?? 0),
    };
  }

  return {
    timelines,
    totalDurationInFrames,
  };
}

function extractTableBlocks(markdown: string): string[][] {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[][] = [];
  let currentBlock: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith("|")) {
      currentBlock.push(line);
      continue;
    }

    if (currentBlock.length > 0) {
      blocks.push(currentBlock);
      currentBlock = [];
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock);
  }

  return blocks;
}

type ParsedMarkdownTable = {
  headers: string[];
  rows: string[][];
};

function parseMarkdownTable(lines: string[]): ParsedMarkdownTable {
  if (lines.length < 2) {
    throw new Error("Markdown table must contain a header row and a separator row.");
  }

  const headers = parseMarkdownRow(lines[0]).map((cell) => cell.toLowerCase());
  const rows = lines
    .slice(2)
    .map(parseMarkdownRow)
    .filter((row) => row.some((cell) => cell.length > 0));

  return {
    headers,
    rows,
  };
}

function parseMarkdownRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function buildTimelineDefinitions(table: ParsedMarkdownTable): TimelineBlockDefinition[] {
  if (table.headers.length !== 4) {
    throw new Error("Timeline markdown table must use four columns.");
  }

  const definitions: TimelineBlockDefinition[] = [];
  let activeDefinition: TimelineBlockDefinition | null = null;
  let activeSection: "props" | "items" | null = null;

  for (const row of table.rows) {
    const [first = "", second = "", third = "", fourth = ""] = row.map((cell) => cell.trim());
    const isBlankRow = [first, second, third, fourth].every((cell) => cell === "");

    if (isBlankRow) {
      activeSection = null;
      continue;
    }

    if (isHeaderRow(row, "__prop__", "__value__", "", "")) {
      activeDefinition = {
        id: "",
        entries: [],
      };
      definitions.push(activeDefinition);
      activeSection = "props";
      continue;
    }

    if (isHeaderRow(row, "__id__", "__seconds__", "__pre__", "__overlap__")) {
      if (!activeDefinition) {
        throw new Error("Timeline items section must follow a props section.");
      }

      activeSection = "items";
      continue;
    }

    if (!activeDefinition || !activeSection) {
      throw new Error("Timeline markdown rows must appear under a props or items header.");
    }

    if (activeSection === "props") {
      if (first === "id" && second) {
        activeDefinition.id = second.trim();
      } else if (first === "parentId" && second) {
        activeDefinition.parentId = second.trim();
      }
      continue;
    }

    activeDefinition.entries.push(buildTimelineEntry(row, 0, 1, 2, 3, activeDefinition.id || "<unknown>"));
  }

  for (const definition of definitions) {
    if (!definition.id.trim()) {
      throw new Error("Timeline block requires an id.");
    }
  }

  return definitions;
}

function isHeaderRow(row: string[], first: string, second: string, third: string, fourth: string): boolean {
  return normalizeHeaderCell(row[0]) === first
    && normalizeHeaderCell(row[1]) === second
    && normalizeHeaderCell(row[2]) === third
    && normalizeHeaderCell(row[3]) === fourth;
}

function normalizeHeaderCell(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function buildTimelineEntry(
  row: string[],
  idColumn: number,
  secondsColumn: number,
  preColumn: number,
  overlapColumn: number,
  timelineId: string,
): TimelineEntry<string> {
  const rawId = row[idColumn]?.trim();

  if (!rawId) {
    throw new Error(`Timeline "${timelineId}" contains a row without an id.`);
  }

  const seconds = parseRequiredNumber(row[secondsColumn], timelineId, rawId, "seconds");
  const pre = parseOptionalNumber(preColumn >= 0 ? row[preColumn] : undefined, timelineId, rawId, "pre");
  const overlap = parseOptionalNumber(overlapColumn >= 0 ? row[overlapColumn] : undefined, timelineId, rawId, "overlap");

  if (rawId.trim() === wait) {
    return [wait, seconds];
  }

  return [rawId.trim(), seconds, pre, overlap];
}

function parseRequiredNumber(value: string | undefined, timelineId: string, rowId: string, field: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Timeline "${timelineId}" row "${rowId}" has an invalid ${field} value.`);
  }

  return parsed;
}

function parseOptionalNumber(value: string | undefined, timelineId: string, rowId: string, field: string): number | undefined {
  if (value == null || value.trim() === "") {
    return undefined;
  }

  return parseRequiredNumber(value, timelineId, rowId, field);
}
