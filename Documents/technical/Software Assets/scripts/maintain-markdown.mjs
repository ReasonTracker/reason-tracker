import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { selectPreferredIndex } from "./markdown-index-rules.mjs";

const SCRIPTS_DIR = path.resolve(import.meta.dirname);
const REPO_DIR = resolveRepoDir();
const REPORT_PATH = path.join(SCRIPTS_DIR, "markdown-maintenance-report.md");
const AUTONAV_START = "<!-- autonav:start -->";
const AUTONAV_END = "<!-- autonav:end -->";
const runtimeOptions = parseRuntimeOptions(process.argv.slice(2));

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  const sourcePaths = await collectMarkdownSourcePaths(REPO_DIR);
  const routeInfo = buildRouteInfo(sourcePaths);

  const docs = [];
  for (const sourcePath of sourcePaths) {
    const absolutePath = path.join(REPO_DIR, ...sourcePath.split("/"));
    const markdown = await fs.readFile(absolutePath, "utf8");
    const routeData = routeInfo.bySourcePath.get(sourcePath) || {};

    docs.push({
      sourcePath,
      absolutePath,
      markdown,
      title: extractTitle(markdown),
      routePath: routeData.routePath ?? null,
      parentRoute: routeData.parentRoute ?? null,
      isIndexDoc: Boolean(routeData.isIndexDoc),
    });
  }

  const docsBySourcePath = new Map(docs.map((doc) => [doc.sourcePath, doc]));
  const docsByRoute = new Map(
    docs.filter((doc) => doc.routePath).map((doc) => [doc.routePath, doc]),
  );
  const titleIndex = buildTitleIndex(docs);
  const childrenByParent = buildChildrenByParent(docs);

  const unresolved = [];
  const autoAdded = [];

  let changedDocs = 0;
  let fixedLinks = 0;
  let relabeledLinks = 0;
  let autoAddedLinks = 0;

  for (const doc of docs) {
    const fixed = rewriteBrokenLinks({
      markdown: doc.markdown,
      sourcePath: doc.sourcePath,
      docsBySourcePath,
      docsByRoute,
      titleIndex,
      unresolved,
    });
    fixedLinks += fixed.fixedCount;

    const relabeled = relabelResolvedDocLinks({
      markdown: fixed.markdown,
      sourcePath: doc.sourcePath,
      docsBySourcePath,
      docsByRoute,
    });
    relabeledLinks += relabeled.relabeledCount;

    const existingTargets = extractLinkedDocTargets({
      markdown: relabeled.markdown,
      sourcePath: doc.sourcePath,
      docsBySourcePath,
      docsByRoute,
    });

    const requiredTargets = deriveRequiredNavTargets(doc, childrenByParent);
    const missingTargets = requiredTargets.filter(
      (target) => !existingTargets.has(target.sourcePath),
    );

    const additions = missingTargets.map((target) => ({
      title: target.title,
      targetSourcePath: target.sourcePath,
      href: toRelativeMarkdownPath(doc.sourcePath, target.sourcePath),
    }));

    const withAutonav =
      additions.length > 0 ? appendAutonavLinks(relabeled.markdown, additions) : relabeled.markdown;

    if (additions.length > 0) {
      autoAdded.push({ sourcePath: doc.sourcePath, added: additions });
      autoAddedLinks += additions.length;
    }

    if (withAutonav !== doc.markdown) {
      changedDocs += 1;
      await fs.writeFile(doc.absolutePath, withAutonav, "utf8");
    }
  }

  if (runtimeOptions.writeReport) {
    await fs.writeFile(REPORT_PATH, buildReport({ unresolved, autoAdded }), "utf8");
  }

  console.log(
    `Markdown maintenance complete: changedDocs=${changedDocs}, fixedLinks=${fixedLinks}, relabeledLinks=${relabeledLinks}, unresolved=${unresolved.length}, autoAdded=${autoAddedLinks}.`,
  );
}

function resolveRepoDir() {
  let current = SCRIPTS_DIR;

  while (true) {
    if (existsSync(path.join(current, ".git"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Unable to locate repository root (.git directory not found in ancestor paths).");
    }

    current = parent;
  }
}

async function collectMarkdownSourcePaths(directory) {
  const files = [];
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = toPosixPath(path.relative(REPO_DIR, absolutePath));

    if (entry.isDirectory()) {
      if (shouldIgnoreDirectory(relativePath)) {
        continue;
      }

      files.push(...(await collectMarkdownSourcePaths(absolutePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (/\.md\s*$/i.test(entry.name)) {
      if (shouldIncludeMarkdownPath(relativePath)) {
        files.push(relativePath);
      }
    }
  }

  return files;
}

function shouldIgnoreDirectory(relativePath) {
  const normalized = relativePath.toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    normalized === ".git" ||
    normalized.endsWith("/.git") ||
    normalized.includes("/.git/") ||
    normalized === "node_modules" ||
    normalized.endsWith("/node_modules") ||
    normalized.includes("/node_modules/") ||
    normalized.includes("/documents/technical/software assets/website/dist") ||
    normalized.includes("/documents/technical/software assets/website/.vite-preview")
  );
}

function shouldIncludeMarkdownPath(relativePath) {
  const normalized = toPosixPath(relativePath);
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) {
    return false;
  }

  if (segments.length === 1) {
    return true;
  }

  return /^documents$/i.test(segments[0]);
}

function buildRouteInfo(sourcePaths) {
  const bySourcePath = new Map();
  const byVirtualDirectory = new Map();

  for (const sourcePath of sourcePaths) {
    const virtualPath = toVirtualPath(sourcePath);
    const fileName = sourcePath.split("/").pop() || sourcePath;
    const virtualDirectory = virtualPath.includes("/")
      ? virtualPath.slice(0, virtualPath.lastIndexOf("/"))
      : "";

    const current = byVirtualDirectory.get(virtualDirectory) || [];
    current.push({ sourcePath, fileName, virtualPath, virtualDirectory });
    byVirtualDirectory.set(virtualDirectory, current);
  }

  for (const [virtualDirectory, entries] of byVirtualDirectory.entries()) {
    const selection = selectPreferredIndex(entries, (entry) => entry.fileName);
    if (selection.conflict) {
      throw new Error(
        [
          "Ambiguous top-priority index files after normalization.",
          `Directory: ${virtualDirectory || "<root>"}`,
          `Conflicting files: ${selection.conflict.names.join(", ")}`,
        ].join("\n"),
      );
    }

    const selectedSourcePath = selection.selected?.sourcePath || null;

    for (const entry of entries) {
      const isIndexDoc = selectedSourcePath === entry.sourcePath;
      const routePath = isIndexDoc
        ? toDirectoryRoute(virtualDirectory)
        : toMarkdownFileRoute(virtualDirectory, entry.fileName);

      bySourcePath.set(entry.sourcePath, {
        routePath,
        parentRoute: deriveParentRoute(routePath),
        isIndexDoc,
      });
    }
  }

  return { bySourcePath };
}

function toVirtualPath(sourcePath) {
  const normalized = toPosixPath(sourcePath);
  if (/^documents$/i.test(normalized)) {
    return "";
  }
  if (/^documents\//i.test(normalized)) {
    return normalized.slice(normalized.indexOf("/") + 1);
  }
  return normalized;
}

function toDirectoryRoute(virtualDirectory) {
  if (!virtualDirectory) {
    return "/";
  }

  const normalizedDirectory = virtualDirectory
    .split("/")
    .filter(Boolean)
    .map((segment) => normalizeSegment(segment))
    .join("/");

  return `/${normalizedDirectory}/`;
}

function toMarkdownFileRoute(virtualDirectory, fileName) {
  const withoutExtension = stripMarkdownExtension(fileName);
  const slug = normalizeSegment(withoutExtension);
  const prefix = toDirectoryRoute(virtualDirectory);
  return prefix === "/" ? `/${slug}/` : `${prefix}${slug}/`;
}

function deriveParentRoute(routePath) {
  if (!routePath || routePath === "/") {
    return null;
  }

  const segments = routePath.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return "/";
  }

  return `/${segments.slice(0, -1).join("/")}/`;
}

function buildTitleIndex(docs) {
  const byTitle = new Map();

  for (const doc of docs) {
    const key = normalizeTitle(doc.title);
    const current = byTitle.get(key) || [];
    current.push(doc);
    byTitle.set(key, current);
  }

  return byTitle;
}

function buildChildrenByParent(docs) {
  const byParent = new Map();

  for (const doc of docs) {
    if (!doc.parentRoute) {
      continue;
    }

    const current = byParent.get(doc.parentRoute) || [];
    current.push(doc);
    byParent.set(doc.parentRoute, current);
  }

  for (const [parentRoute, children] of byParent.entries()) {
    children.sort((a, b) => {
      const aOrder = deriveNavOrder(a.sourcePath, a.isIndexDoc);
      const bOrder = deriveNavOrder(b.sourcePath, b.isIndexDoc);
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return String(a.routePath).localeCompare(String(b.routePath));
    });
    byParent.set(parentRoute, children);
  }

  return byParent;
}

function rewriteBrokenLinks(input) {
  let fixedCount = 0;

  const markdown = input.markdown.replace(
    /(!?)\[([^\]\n]+)\]\(([^)\n]+)\)/g,
    (full, imagePrefix, linkText, rawTarget) => {
      if (imagePrefix) {
        return full;
      }

      const destination = parseDestination(rawTarget);
      if (!destination) {
        return full;
      }

      const resolution = resolveDocTarget(
        input.sourcePath,
        destination.url,
        input.docsBySourcePath,
        input.docsByRoute,
      );
      if (resolution.valid) {
        return full;
      }

      if (!resolution.relativePath) {
        input.unresolved.push({
          sourcePath: input.sourcePath,
          linkText,
          href: destination.url,
          reason: resolution.reason,
        });
        return full;
      }

      const normalizedText = normalizeTitle(linkText);
      const matches = input.titleIndex.get(normalizedText) || [];
      if (matches.length !== 1) {
        input.unresolved.push({
          sourcePath: input.sourcePath,
          linkText,
          href: destination.url,
          reason:
            matches.length === 0 ? "No matching H1 title found" : "Multiple H1 title matches found",
        });
        return full;
      }

      const matched = matches[0];
      const suffix = extractSuffix(destination.url);
      const replacement = `${toRelativeMarkdownPath(input.sourcePath, matched.sourcePath)}${suffix}`;
      fixedCount += 1;

      const rebuiltTarget = destination.wrappedInAngles
        ? `<${replacement}>${destination.rest}`
        : `${replacement}${destination.rest}`;

      return `[${linkText}](${rebuiltTarget})`;
    },
  );

  return { markdown, fixedCount };
}

function relabelResolvedDocLinks(input) {
  let relabeledCount = 0;

  const markdown = input.markdown.replace(
    /(!?)\[([^\]\n]+)\]\(([^)\n]+)\)/g,
    (full, imagePrefix, linkText, rawTarget) => {
      if (imagePrefix) {
        return full;
      }

      const destination = parseDestination(rawTarget);
      if (!destination) {
        return full;
      }

      const resolution = resolveDocTarget(
        input.sourcePath,
        destination.url,
        input.docsBySourcePath,
        input.docsByRoute,
      );
      if (!resolution.valid || !resolution.targetSourcePath) {
        return full;
      }

      const targetDoc = input.docsBySourcePath.get(resolution.targetSourcePath);
      if (!targetDoc) {
        return full;
      }

      const expectedText = targetDoc.title;
      if (normalizeTitle(linkText) === normalizeTitle(expectedText)) {
        return full;
      }

      relabeledCount += 1;
      return `[${expectedText}](${rawTarget})`;
    },
  );

  return { markdown, relabeledCount };
}

function extractLinkedDocTargets(input) {
  const targets = new Set();

  for (const match of input.markdown.matchAll(/(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)/g)) {
    const destination = parseDestination(String(match[1]));
    if (!destination) {
      continue;
    }

    const resolution = resolveDocTarget(
      input.sourcePath,
      destination.url,
      input.docsBySourcePath,
      input.docsByRoute,
    );
    if (resolution.valid && resolution.targetSourcePath) {
      targets.add(resolution.targetSourcePath);
    }
  }

  return targets;
}

function deriveRequiredNavTargets(doc, childrenByParent) {
  if (!doc.routePath || !doc.isIndexDoc) {
    return [];
  }

  return childrenByParent.get(doc.routePath) || [];
}

function appendAutonavLinks(markdown, additions) {
  const startIndex = markdown.indexOf(AUTONAV_START);
  const endIndex = markdown.indexOf(AUTONAV_END);
  const linkLines = additions.map((item) => `- [${item.title}](${item.href})`);

  if (startIndex >= 0 && endIndex > startIndex) {
    const before = markdown.slice(0, startIndex + AUTONAV_START.length);
    const inside = markdown.slice(startIndex + AUTONAV_START.length, endIndex);
    const after = markdown.slice(endIndex);
    const mergedInside = mergeAutonavSection(inside, linkLines);
    return `${before}${mergedInside}${after}`;
  }

  const autonavBlock = `\n\n---\n\n${AUTONAV_START}\n${linkLines.join("\n")}\n${AUTONAV_END}\n`;
  return `${markdown.replace(/\s*$/, "")}${autonavBlock}`;
}

function mergeAutonavSection(inside, linkLines) {
  const normalizedInside = inside.replace(/\r\n/g, "\n");
  const existing = new Set(
    [...normalizedInside.matchAll(/(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)/g)].map((match) =>
      String(match[1]).trim(),
    ),
  );

  const uniqueAdditions = linkLines.filter((line) => {
    const match = line.match(/\(([^)]+)\)$/);
    if (!match) {
      return true;
    }
    return !existing.has(match[1]);
  });

  if (uniqueAdditions.length === 0) {
    return inside;
  }

  const base = normalizedInside.replace(/^\s*##\s+Auto\s+Navigation\s*\n?/i, "").trim();
  if (!base) {
    return `\n${uniqueAdditions.join("\n")}\n`;
  }

  return `\n${base}\n${uniqueAdditions.join("\n")}\n`;
}

function buildReport(input) {
  const updatedDate = new Date().toISOString().slice(0, 10);

  const unresolvedBody =
    input.unresolved.length === 0
      ? "No unresolved links."
      : input.unresolved
          .map(
            (entry) =>
              `- Source: ${entry.sourcePath}\n  - Link: [${entry.linkText}](${entry.href})\n  - Reason: ${entry.reason}`,
          )
          .join("\n");

  const autoAddedBody =
    input.autoAdded.length === 0
      ? "No auto-added links."
      : input.autoAdded
          .map((entry) => {
            const lines = entry.added
              .map((item) => `  - [${item.title}](${item.href}) -> ${item.targetSourcePath}`)
              .join("\n");
            return `- Source: ${entry.sourcePath}\n${lines}`;
          })
          .join("\n");

  return `# Markdown Maintenance Report\n\nLast updated: ${updatedDate}\n\nRun type: Markdown maintenance\n\n## Unresolved Links\n\n${unresolvedBody}\n\n## Auto-Added Links\n\n${autoAddedBody}\n`;
}

function resolveDocTarget(sourcePath, href, docsBySourcePath, docsByRoute) {
  const cleaned = String(href || "").trim();
  if (!cleaned) {
    return { valid: false, reason: "Empty URL", relativePath: false };
  }

  if (cleaned.startsWith("#")) {
    return { valid: true, reason: "Hash-only link", relativePath: false };
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(cleaned) || cleaned.startsWith("//")) {
    return { valid: true, reason: "External URL", relativePath: false };
  }

  const { pathPart } = splitPathAndSuffix(cleaned);

  if (pathPart.startsWith("/")) {
    const route = normalizeRoute(pathPart);
    const target = docsByRoute.get(route);
    return target
      ? {
          valid: true,
          targetSourcePath: target.sourcePath,
          reason: "Resolved route",
          relativePath: false,
        }
      : { valid: false, reason: "Route does not exist", relativePath: false };
  }

  const resolved = resolveRelativePath(sourcePath, pathPart);
  if (looksLikeMarkdownPath(resolved)) {
    const target = findDocBySourcePath(resolved, docsBySourcePath);
    return target
      ? {
          valid: true,
          targetSourcePath: target.sourcePath,
          reason: "Resolved markdown file",
          relativePath: true,
        }
      : { valid: false, reason: "Relative markdown target does not exist", relativePath: true };
  }

  const asRoute = toRouteFromRelativePath(sourcePath, pathPart, docsBySourcePath);
  if (asRoute) {
    const target = docsByRoute.get(asRoute);
    if (target) {
      return {
        valid: true,
        targetSourcePath: target.sourcePath,
        reason: "Resolved relative route",
        relativePath: true,
      };
    }
  }

  return { valid: false, reason: "Relative target does not resolve to a doc", relativePath: true };
}

function parseDestination(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("<")) {
    const closeIndex = trimmed.indexOf(">", 1);
    if (closeIndex < 0) {
      return null;
    }

    return {
      url: trimmed.slice(1, closeIndex).trim(),
      rest: trimmed.slice(closeIndex + 1),
      wrappedInAngles: true,
    };
  }

  const firstWhitespace = trimmed.search(/\s/);
  if (firstWhitespace < 0) {
    return { url: trimmed, rest: "", wrappedInAngles: false };
  }

  return {
    url: trimmed.slice(0, firstWhitespace),
    rest: trimmed.slice(firstWhitespace),
    wrappedInAngles: false,
  };
}

function toRelativeMarkdownPath(sourcePath, targetSourcePath) {
  const fromDir = sourcePath.includes("/")
    ? sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1)
    : "";
  const rel = path.posix.relative(fromDir, targetSourcePath);
  if (!rel || rel === "") {
    return "./";
  }

  return rel.startsWith(".") ? rel : `./${rel}`;
}

function resolveRelativePath(sourcePath, relativePath) {
  const sourceDir = sourcePath.includes("/")
    ? sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1)
    : "";
  return toPosixPath(path.posix.normalize(path.posix.join(sourceDir, relativePath)));
}

function toRouteFromRelativePath(sourcePath, relativePath, docsBySourcePath) {
  const resolved = resolveRelativePath(sourcePath, relativePath);
  const target = findDocBySourcePath(resolved, docsBySourcePath);
  return target?.routePath ?? null;
}

function findDocBySourcePath(candidatePath, docsBySourcePath) {
  const normalizedCandidate = normalizeSourcePathForMatch(candidatePath);

  for (const [sourcePath, doc] of docsBySourcePath.entries()) {
    if (normalizeSourcePathForMatch(sourcePath) === normalizedCandidate) {
      return doc;
    }
  }

  return null;
}

function normalizeSourcePathForMatch(sourcePath) {
  return toPosixPath(sourcePath)
    .split("/")
    .map((segment) => segment.toLowerCase().replace(/\s+/g, " ").trim())
    .join("/");
}

function looksLikeMarkdownPath(value) {
  return /\s*\.\s*md\s*$/i.test(String(value || ""));
}

function splitPathAndSuffix(url) {
  const hashIndex = url.indexOf("#");
  const queryIndex = url.indexOf("?");

  let splitIndex = -1;
  if (hashIndex >= 0 && queryIndex >= 0) {
    splitIndex = Math.min(hashIndex, queryIndex);
  } else if (hashIndex >= 0) {
    splitIndex = hashIndex;
  } else if (queryIndex >= 0) {
    splitIndex = queryIndex;
  }

  if (splitIndex < 0) {
    return { pathPart: url, suffix: "" };
  }

  return {
    pathPart: url.slice(0, splitIndex),
    suffix: url.slice(splitIndex),
  };
}

function extractSuffix(url) {
  const { suffix } = splitPathAndSuffix(url);
  return suffix;
}

function stripMarkdownExtension(fileName) {
  return String(fileName || "").replace(/\s*\.\s*md\s*$/i, "");
}

function deriveNavOrder(sourcePath, isIndexDoc) {
  if (isIndexDoc) {
    return 0;
  }

  const normalized = sourcePath.toLowerCase();
  if (normalized.endsWith("readme.md") || normalized.endsWith("index.md")) {
    return 1;
  }

  return 100;
}

function normalizeSegment(value) {
  const ascii = String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const collapsed = ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return collapsed || "untitled";
}

function normalizeRoute(pathname) {
  const trimmed = String(pathname || "").trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }
  const withoutTrailing = trimmed.replace(/\/+$/, "");
  return `${withoutTrailing}/`;
}

function extractTitle(markdown) {
  const titleMatch = String(markdown || "").match(/^#\s+(.+)$/m);
  return titleMatch?.[1].trim() || "Reason Tracker";
}

function normalizeTitle(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function toPosixPath(value) {
  return String(value).split(path.sep).join("/");
}

function parseRuntimeOptions(argv) {
  let writeReport = false;

  for (const arg of argv) {
    if (arg === "--write-report") {
      writeReport = true;
      continue;
    }

    if (arg === "--no-report") {
      writeReport = false;
      continue;
    }
  }

  return { writeReport };
}
