import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { selectPreferredIndex, toVirtualPath } from "./markdown-index-rules.mts";

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
  const sourcePaths = await collectMarkdownSourcePaths();
  const routeInfo = buildRouteInfo(sourcePaths);

  const docs = [];
  for (const sourcePath of sourcePaths) {
    const absolutePath = path.join(REPO_DIR, ...sourcePath.split("/"));
    const markdown = await fs.readFile(absolutePath, "utf8");
    const routeData = routeInfo.bySourcePath.get(sourcePath) || {};
    const title = formatLinkText(extractTitle(markdown));
    const isIndexDoc = Boolean(routeData.isIndexDoc);

    docs.push({
      sourcePath,
      absolutePath,
      markdown,
      title,
      linkTitle: deriveDocLinkTitle({ sourcePath, isIndexDoc, title }),
      routePath: routeData.routePath ?? null,
      parentRoute: routeData.parentRoute ?? null,
      isIndexDoc,
    });
  }

  const docsBySourcePath = new Map(docs.map((doc) => [doc.sourcePath, doc]));
  const docsByRoute = new Map(
    docs.filter((doc) => doc.routePath).map((doc) => [doc.routePath, doc]),
  );
  const linkTextIndex = buildLinkTextIndex(docs);
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
      linkTextIndex,
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
      title: target.linkTitle,
      targetSourcePath: target.sourcePath,
      href: toRelativeMarkdownPath(doc.sourcePath, target.sourcePath),
    }));

    const hasAutonavSection =
      relabeled.markdown.includes(AUTONAV_START) && relabeled.markdown.includes(AUTONAV_END);

    const withAutonav =
      additions.length > 0 || hasAutonavSection
        ? appendAutonavLinks(relabeled.markdown, additions, {
            docsByRoute,
            docsBySourcePath,
            sourcePath: doc.sourcePath,
          })
        : relabeled.markdown;

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
}

async function collectMarkdownSourcePaths() {
  const sourcePaths = await collectGitSourcePaths();
  return sourcePaths.filter(
    (sourcePath) => /\.md\s*$/i.test(sourcePath) && shouldIncludeMarkdownPath(sourcePath),
  );
}

async function collectGitSourcePaths() {
  const output = await runCommand("git", [
    "-C",
    REPO_DIR,
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ]);

  const candidates = output.stdout
    .split("\u0000")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => toPosixPath(entry));

  const existing = [];
  for (const sourcePath of candidates) {
    const absolutePath = path.join(REPO_DIR, ...sourcePath.split("/"));
    try {
      await fs.access(absolutePath);
      existing.push(sourcePath);
    } catch {
      // Skip entries that are no longer in the working tree.
    }
  }

  return existing;
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

async function runCommand(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? REPO_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const stdoutParts = [];
    const stderrParts = [];

    child.stdout.on("data", (chunk) => stdoutParts.push(chunk));
    child.stderr.on("data", (chunk) => stderrParts.push(chunk));

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutParts).toString("utf8");
      const stderr = Buffer.concat(stderrParts).toString("utf8");

      if (code === 0 || options.allowFailure) {
        resolve({ code, stdout, stderr });
        return;
      }

      reject(
        new Error(
          `Command failed: ${command} ${args.join(" ")}\nExit code: ${code}\n${stderr || stdout}`,
        ),
      );
    });
  });
}

function shouldIncludeMarkdownPath(relativePath) {
  const normalized = toPosixPath(relativePath);
  if (normalized.toLowerCase() === "documents/technical/software assets/scripts/markdown-maintenance-report.md") {
    return false;
  }

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

function getParentDirectory(sourcePath) {
  const normalized = toPosixPath(sourcePath);
  if (!normalized.includes("/")) {
    return "";
  }

  return normalized.slice(0, normalized.lastIndexOf("/"));
}

function toDirectoryTitle(relativeDirectory) {
  if (!relativeDirectory) {
    return "Reason Tracker";
  }

  const segments = toPosixPath(relativeDirectory).split("/").filter(Boolean);
  const name = segments[segments.length - 1] || "Reason Tracker";

  return name
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function deriveDocLinkTitle(input) {
  if (!input.isIndexDoc) {
    return formatLinkText(input.title);
  }

  const directory = getParentDirectory(input.sourcePath);
  return toDirectoryTitle(directory);
}

function buildLinkTextIndex(docs) {
  const byText = new Map();

  const addEntry = (key, doc) => {
    const normalized = normalizeTitle(key);
    if (!normalized) {
      return;
    }

    const current = byText.get(normalized) || [];
    if (!current.some((entry) => entry.sourcePath === doc.sourcePath)) {
      current.push(doc);
      byText.set(normalized, current);
    }
  };

  for (const doc of docs) {
    addEntry(doc.linkTitle, doc);
    addEntry(doc.title, doc);
  }

  return byText;
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
      const matches = input.linkTextIndex.get(normalizedText) || [];
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
  const startIndex = input.markdown.indexOf(AUTONAV_START);
  const endIndex = input.markdown.indexOf(AUTONAV_END);
  if (startIndex < 0 || endIndex <= startIndex) {
    return { markdown: input.markdown, relabeledCount: 0 };
  }

  let relabeledCount = 0;
  const before = input.markdown.slice(0, startIndex + AUTONAV_START.length);
  const inside = input.markdown.slice(startIndex + AUTONAV_START.length, endIndex);
  const after = input.markdown.slice(endIndex);

  const relabeledInside = inside.replace(
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

      const expectedText = formatLinkText(targetDoc.linkTitle || targetDoc.title);
      if (normalizeTitle(linkText) === normalizeTitle(expectedText)) {
        return full;
      }

      relabeledCount += 1;
      return `[${expectedText}](${rawTarget})`;
    },
  );

  return {
    markdown: `${before}${relabeledInside}${after}`,
    relabeledCount,
  };
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

function appendAutonavLinks(markdown, additions, input) {
  const startIndex = markdown.indexOf(AUTONAV_START);
  const endIndex = markdown.indexOf(AUTONAV_END);
  const linkLines = additions.map((item) => `- [${item.title}](${item.href})`);

  if (startIndex >= 0 && endIndex > startIndex) {
    const before = markdown.slice(0, startIndex + AUTONAV_START.length);
    const inside = markdown.slice(startIndex + AUTONAV_START.length, endIndex);
    const after = markdown.slice(endIndex);
    const outsideExisting = extractLinkedDocTargets({
      ...input,
      markdown: `${markdown.slice(0, startIndex)}${markdown.slice(endIndex + AUTONAV_END.length)}`,
    });
    const mergedInside = mergeAutonavSection(inside, linkLines, outsideExisting, input);
    return `${before}${mergedInside}${after}`;
  }

  const autonavBlock = `\n\n---\n\n${AUTONAV_START}\n${linkLines.join("\n")}\n${AUTONAV_END}\n`;
  return `${markdown.replace(/\s*$/, "")}${autonavBlock}`;
}

function mergeAutonavSection(inside, linkLines, outsideExisting, input) {
  const normalizedInside = inside.replace(/\r\n/g, "\n");
  const existingTargets = new Set(outsideExisting);
  const cleanedLines = [];
  for (const line of normalizedInside.split("\n")) {
    const match = line.match(/(?<!!)\[[^\]\n]+\]\(([^)\n]+)\)/);
    if (!match) {
      cleanedLines.push(line);
      continue;
    }

    const destination = parseDestination(match[1]);
    const resolution = destination
      ? resolveDocTarget(
          input.sourcePath,
          destination.url,
          input.docsBySourcePath,
          input.docsByRoute,
        )
      : { valid: false };
    if (
      !resolution.valid ||
      !resolution.targetSourcePath ||
      existingTargets.has(resolution.targetSourcePath)
    ) {
      continue;
    }

    existingTargets.add(resolution.targetSourcePath);
    cleanedLines.push(line);
  }
  const cleanedBase = cleanedLines.join("\n");

  const uniqueAdditions = linkLines.filter((line) => {
    const match = line.match(/\(([^)]+)\)$/);
    if (!match) {
      return true;
    }
    const destination = parseDestination(match[1]);
    const resolution = destination
      ? resolveDocTarget(
          input.sourcePath,
          destination.url,
          input.docsBySourcePath,
          input.docsByRoute,
        )
      : { valid: false };
    if (
      !resolution.valid ||
      !resolution.targetSourcePath ||
      existingTargets.has(resolution.targetSourcePath)
    ) {
      return false;
    }

    existingTargets.add(resolution.targetSourcePath);
    return true;
  });

  if (uniqueAdditions.length === 0) {
    const baseWithoutHeading = cleanedBase.replace(/^\s*##\s+Auto\s+Navigation\s*\n?/i, "").trim();
    return baseWithoutHeading ? `\n${baseWithoutHeading}\n` : "\n";
  }

  const base = cleanedBase.replace(/^\s*##\s+Auto\s+Navigation\s*\n?/i, "").trim();
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
              `- Source: ${entry.sourcePath}\n  - Link Text: ${entry.linkText}\n  - Target: ${entry.href}\n  - Reason: ${entry.reason}`,
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

  if (sourceFileExists(resolved)) {
    return { valid: true, reason: "Resolved source file", relativePath: true };
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

function sourceFileExists(sourcePath) {
  const absolutePath = path.resolve(REPO_DIR, ...sourcePath.split("/"));
  const relativePath = path.relative(REPO_DIR, absolutePath);
  return (
    relativePath !== "" &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath) &&
    existsSync(absolutePath)
  );
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

  // Support local markdown paths that contain spaces (for example, "📌 README.md").
  // Markdown link titles are uncommon in this repo; prioritize preserving the full href.
  return { url: trimmed, rest: "", wrappedInAngles: false };
}

function toRelativeMarkdownPath(sourcePath, targetSourcePath) {
  const fromDir = sourcePath.includes("/")
    ? sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1)
    : "";
  const rel = path.posix.relative(fromDir, targetSourcePath);
  if (!rel || rel === "") {
    return "./";
  }

  const withPrefix = rel.startsWith(".") ? rel : `./${rel}`;
  return encodeMarkdownPathSpaces(withPrefix);
}

function resolveRelativePath(sourcePath, relativePath) {
  const sourceDir = sourcePath.includes("/")
    ? sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1)
    : "";
  const decodedRelativePath = decodeMarkdownPath(relativePath);
  return toPosixPath(path.posix.normalize(path.posix.join(sourceDir, decodedRelativePath)));
}

function encodeMarkdownPathSpaces(value) {
  return String(value || "").replace(/ /g, "%20");
}

function decodeMarkdownPath(value) {
  const raw = String(value || "");
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
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
    .replace(/_/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function formatLinkText(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
