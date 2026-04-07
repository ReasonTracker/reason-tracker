import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import frontMatter from "front-matter";
import { marked } from "marked";
import { normalizeMdStemKey, selectPreferredIndex } from "../../scripts/markdown-index-rules.mjs";

const WEBSITE_DIR = path.resolve(import.meta.dirname, "..");
const REPO_DIR = resolveRepoDir();
const DIST_DIR = path.join(WEBSITE_DIR, "dist");
const SITE_DIR = path.join(WEBSITE_DIR, "site");
const SITE_CONFIG_PATH = path.join(WEBSITE_DIR, "site", "site-config.json");
const PUBLISH_REPORT_PATH = path.join(WEBSITE_DIR, "scripts", "publish-website-report.md");
const WEBSITE_RELATIVE_DIR = toPosixPath(path.relative(REPO_DIR, WEBSITE_DIR));
const RESERVED_SITE_PREFIXES = ["css/", "icons/"];
const RESERVED_SITE_FILES = new Set(["site-config.json"]);
const DEFAULT_COLLAPSED_SOURCE_ROOT = "Documents";
const DEFAULT_INDEX_FILE_NAMES = Object.freeze(["README.md", "index.md"]);
const EXCLUDED_SOURCE_SEGMENTS = Object.freeze([
  "node_modules",
  ".pnpm-store",
  ".yarn",
  ".netlify",
]);
const AUGMENTATION_TYPES = Object.freeze({
  ".css": {
    bucket: "css",
    encoding: "utf8",
  },
  ".js": {
    bucket: "js",
    encoding: "utf8",
  },
});
let siteName = "Reason Tracker";
let indexCandidateKeys = ["readme", "index"];
let collapsedSourceRootName = DEFAULT_COLLAPSED_SOURCE_ROOT;
const runtimeOptions = parseRuntimeOptions(process.argv.slice(2));

async function main() {
  const siteConfig = await resolveSiteConfig();
  siteName = siteConfig.siteName;
  indexCandidateKeys = siteConfig.indexCandidateKeys;
  collapsedSourceRootName = siteConfig.collapsedSourceRootName;
  await ensureGitRepository();
  await resetDist();
  await copyStaticAssets();

  const sourcePaths = await collectSourcePaths();
  const filteredPaths = sourcePaths.filter((entry) => !isInsideDist(entry) && !isExcludedSourcePath(entry));
  const virtualEntries = createVirtualEntries(filteredPaths, collapsedSourceRootName);
  const sourceVirtualPathBySourcePath = createSourceVirtualPathMap(virtualEntries);
  const augmentationResult = await buildSourceAugmentations(sourceVirtualPathBySourcePath);
  const augmentationsBySourcePath = augmentationResult.augmentationsBySourcePath;
  const tree = buildTree(virtualEntries);
  const gitContext = await getGitContext();
  const routePlan = createRoutePlan(tree, indexCandidateKeys);

  await publishDirectoryPages(routePlan, tree, gitContext, augmentationsBySourcePath);
  await publishFilePages(routePlan, gitContext, augmentationsBySourcePath);
  if (runtimeOptions.writeReport) {
    await writePublishReport({
      sourceCount: filteredPaths.length,
      routePlan,
      augmentationResult,
    });
  }

  console.log(`Published ${filteredPaths.length} source files into ${DIST_DIR}`);
}

function resolveRepoDir() {
  let current = WEBSITE_DIR;

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

async function ensureGitRepository() {
  const output = await runCommand("git", ["-C", REPO_DIR, "rev-parse", "--is-inside-work-tree"]);
  if (output.stdout.trim() !== "true") {
    throw new Error("Git repository not detected. This builder requires Git metadata.");
  }
}

async function resetDist() {
  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });
}

async function copyStaticAssets() {
  await copyIfPresent(path.join(WEBSITE_DIR, "site", "css"), path.join(DIST_DIR, "css"));
  await copyIfPresent(path.join(WEBSITE_DIR, "site", "icons"), path.join(DIST_DIR, "icons"));
}

async function resolveSiteConfig() {
  try {
    const raw = await fs.readFile(SITE_CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return normalizeSiteConfig(parsed);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return normalizeSiteConfig({});
    }

    throw new Error(`Invalid site config at ${SITE_CONFIG_PATH}: ${error.message}`);
  }
}

function validateConfiguredFieldType(value, fieldName, expectedType) {
  if (value === undefined) {
    return;
  }

  if (expectedType === "array") {
    if (!Array.isArray(value)) {
      throw new Error(`\`${fieldName}\` must be an array when provided.`);
    }
    return;
  }

  if (typeof value !== expectedType) {
    throw new Error(`\`${fieldName}\` must be a ${expectedType} when provided.`);
  }
}

function normalizeSiteConfig(value) {
  validateConfiguredFieldType(value?.siteName, "siteName", "string");
  validateConfiguredFieldType(value?.collapsedSourceRootName, "collapsedSourceRootName", "string");
  validateConfiguredFieldType(value?.indexFileNames, "indexFileNames", "array");

  const siteNameValue = typeof value?.siteName === "string" ? value.siteName.trim() : "";
  const collapsedSourceRootValue =
    typeof value?.collapsedSourceRootName === "string" ? value.collapsedSourceRootName.trim() : "";

  if (value?.collapsedSourceRootName !== undefined && !collapsedSourceRootValue) {
    throw new Error("`collapsedSourceRootName` cannot be blank when provided.");
  }

  const configuredIndexNames = Array.isArray(value?.indexFileNames) ? value.indexFileNames : [];
  if (Array.isArray(value?.indexFileNames) && configuredIndexNames.length === 0) {
    throw new Error("`indexFileNames` must include at least one value when provided.");
  }

  for (const [index, entry] of configuredIndexNames.entries()) {
    if (typeof entry !== "string") {
      throw new Error(`\`indexFileNames[${index}]\` must be a string.`);
    }

    if (!entry.trim()) {
      throw new Error(`\`indexFileNames[${index}]\` cannot be blank.`);
    }

    if (!normalizeMdStemKey(entry)) {
      throw new Error(`\`indexFileNames[${index}]\` must resolve to a valid markdown stem.`);
    }
  }

  const indexFileNames = configuredIndexNames.length > 0 ? configuredIndexNames : DEFAULT_INDEX_FILE_NAMES;
  const indexKeys = indexFileNames.map((name) => normalizeMdStemKey(name)).filter(Boolean);

  return {
    siteName: siteNameValue || "Reason Tracker",
    collapsedSourceRootName: collapsedSourceRootValue || DEFAULT_COLLAPSED_SOURCE_ROOT,
    indexCandidateKeys: [...new Set(indexKeys.length > 0 ? indexKeys : ["readme", "index"])],
  };
}

async function collectSourcePaths() {
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
      // Skip entries that do not currently exist in the working tree.
    }
  }

  return existing;
}

function isInsideDist(sourcePath) {
  const distPrefix = `${WEBSITE_RELATIVE_DIR}/dist/`;
  return sourcePath === `${WEBSITE_RELATIVE_DIR}/dist` || sourcePath.startsWith(distPrefix);
}

function isExcludedSourcePath(sourcePath) {
  const normalized = toPosixPath(String(sourcePath || ""));
  if (!normalized) {
    return true;
  }

  const segments = normalized.split("/").filter(Boolean);
  return segments.some((segment) => EXCLUDED_SOURCE_SEGMENTS.includes(segment));
}

function createVirtualEntries(sourcePaths, collapsedSourceRootName) {
  return sourcePaths.map((sourcePath) => ({
    sourcePath,
    virtualPath: toVirtualPath(sourcePath, collapsedSourceRootName),
  }));
}

function createSourceVirtualPathMap(virtualEntries) {
  const sourceVirtualPathBySourcePath = new Map();

  for (const entry of virtualEntries) {
    sourceVirtualPathBySourcePath.set(entry.sourcePath, entry.virtualPath);
  }

  return sourceVirtualPathBySourcePath;
}

async function buildSourceAugmentations(sourceVirtualPathBySourcePath) {
  const indexResult = await createAugmentationIndex();
  const augmentationIndex = indexResult.augmentationIndex;
  const augmentationsBySourcePath = new Map();
  const matchedAugmentations = [];
  const matchedLookupKeys = new Set();

  for (const [sourcePath, virtualPath] of sourceVirtualPathBySourcePath.entries()) {
    const augmentationKey = toAugmentationKeyFromVirtualPath(virtualPath);
    if (!augmentationKey) {
      continue;
    }

    const payload = {};
    for (const definition of Object.values(AUGMENTATION_TYPES)) {
      const lookupKey = `${definition.bucket}:${augmentationKey}`;
      const augmentation = augmentationIndex.get(lookupKey);
      if (!augmentation) {
        continue;
      }

      payload[definition.bucket] = [augmentation.content];
      matchedLookupKeys.add(lookupKey);
      matchedAugmentations.push({
        sourcePath,
        type: definition.bucket,
        augmentationPath: augmentation.path,
      });
    }

    if (Object.keys(payload).length > 0) {
      augmentationsBySourcePath.set(sourcePath, payload);
    }
  }

  const unmatchedAugmentations = [];
  for (const [lookupKey, value] of augmentationIndex.entries()) {
    if (matchedLookupKeys.has(lookupKey)) {
      continue;
    }

    unmatchedAugmentations.push({
      type: value.type,
      augmentationPath: value.path,
      lookupKey: value.key,
    });
  }

  matchedAugmentations.sort((a, b) => {
    const sourceDiff = a.sourcePath.localeCompare(b.sourcePath);
    if (sourceDiff !== 0) {
      return sourceDiff;
    }
    return a.type.localeCompare(b.type);
  });

  unmatchedAugmentations.sort((a, b) => {
    const typeDiff = a.type.localeCompare(b.type);
    if (typeDiff !== 0) {
      return typeDiff;
    }
    return a.augmentationPath.localeCompare(b.augmentationPath);
  });

  return {
    augmentationsBySourcePath,
    diagnostics: {
      scannedSiteFileCount: indexResult.scannedSiteFileCount,
      skippedSiteFiles: indexResult.skippedSiteFiles,
      augmentationFileCount: indexResult.augmentationFileCount,
      augmentationFilesByType: indexResult.augmentationFilesByType,
      matchedAugmentations,
      unmatchedAugmentations,
    },
  };
}

async function createAugmentationIndex() {
  const files = await listFilesRecursive(SITE_DIR);
  const augmentationIndex = new Map();
  const skippedSiteFiles = [];
  const augmentationFilesByType = {};
  let augmentationFileCount = 0;

  for (const absolutePath of files) {
    const relativePath = toPosixPath(path.relative(SITE_DIR, absolutePath));
    if (!relativePath || shouldSkipSiteFile(relativePath)) {
      if (relativePath) {
        skippedSiteFiles.push(relativePath);
      }
      continue;
    }

    const parsed = parseSourcePath(relativePath);
    const definition = AUGMENTATION_TYPES[parsed.extension];
    if (!definition) {
      continue;
    }

    const key = toCanonicalLookupKey(toAugmentationKeyFromVirtualPath(relativePath));
    if (!key) {
      continue;
    }

    const lookupKey = `${definition.bucket}:${key}`;
    const existing = augmentationIndex.get(lookupKey);
    if (existing) {
      throw new Error(
        [
          "Augmentation file collision detected after canonicalization.",
          `Type: ${definition.bucket}`,
          `First file: ${existing.path}`,
          `Second file: ${relativePath}`,
          `Lookup key: ${key}`,
        ].join("\n"),
      );
    }

    const content = await fs.readFile(absolutePath, definition.encoding);
    augmentationIndex.set(lookupKey, {
      path: relativePath,
      type: definition.bucket,
      key,
      content,
    });
    augmentationFileCount += 1;
    augmentationFilesByType[definition.bucket] = (augmentationFilesByType[definition.bucket] || 0) + 1;
  }

  skippedSiteFiles.sort((a, b) => a.localeCompare(b));

  return {
    augmentationIndex,
    scannedSiteFileCount: files.length,
    skippedSiteFiles,
    augmentationFileCount,
    augmentationFilesByType,
  };
}

function shouldSkipSiteFile(relativePath) {
  if (RESERVED_SITE_FILES.has(relativePath)) {
    return true;
  }

  return RESERVED_SITE_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

async function listFilesRecursive(directoryPath) {
  const files = [];

  let entries;
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFilesRecursive(absolutePath);
      files.push(...nested);
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function toAugmentationKeyFromVirtualPath(virtualPath) {
  const normalized = toPosixPath(String(virtualPath || "")).replace(/^\/+|\/+$/g, "");
  if (!normalized) {
    return "";
  }

  const directoryPath = path.posix.dirname(normalized);
  const fileName = path.posix.basename(normalized);
  const parsed = parseSourcePath(fileName);

  const parts = [];
  if (directoryPath && directoryPath !== ".") {
    parts.push(directoryPath);
  }
  parts.push(parsed.name);

  return toCanonicalLookupKey(parts.filter(Boolean).join("/"));
}

function toCanonicalLookupKey(value) {
  return String(value || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => segment.toLowerCase())
    .join("/");
}

function toVirtualPath(sourcePath, collapsedSourceRootName) {
  const normalized = toPosixPath(sourcePath);
  const rootName = String(collapsedSourceRootName || DEFAULT_COLLAPSED_SOURCE_ROOT)
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const rootOnlyPattern = new RegExp(`^${rootName}$`, "i");
  const rootPrefixPattern = new RegExp(`^${rootName}/`, "i");

  if (rootOnlyPattern.test(normalized)) {
    return "";
  }
  if (rootPrefixPattern.test(normalized)) {
    return normalized.slice(normalized.indexOf("/") + 1);
  }
  return normalized;
}

function buildTree(entries) {
  const tree = new Map();
  tree.set("", { directories: new Set(), files: new Map() });

  for (const entry of entries) {
    if (!entry.virtualPath || entry.sourcePath.startsWith(".git/")) {
      continue;
    }

    const segments = entry.virtualPath.split("/").filter(Boolean);
    if (segments.length === 0) {
      continue;
    }

    let currentDir = "";
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      const childDir = currentDir ? `${currentDir}/${segment}` : segment;

      ensureDirectoryNode(tree, currentDir);
      tree.get(currentDir).directories.add(segment);
      ensureDirectoryNode(tree, childDir);

      currentDir = childDir;
    }

    ensureDirectoryNode(tree, currentDir);
    const fileName = segments[segments.length - 1];
    const existingSource = tree.get(currentDir).files.get(fileName);
    if (existingSource && existingSource !== entry.sourcePath) {
      throw new Error(
        [
          "Virtual path collision detected while collapsing Documents directory.",
          `Directory: ${currentDir || "<root>"}`,
          `File name: ${fileName}`,
          `Existing source: ${existingSource}`,
          `Conflicting source: ${entry.sourcePath}`,
        ].join("\n"),
      );
    }
    tree.get(currentDir).files.set(fileName, entry.sourcePath);
  }

  return tree;
}

function ensureDirectoryNode(tree, directoryPath) {
  if (!tree.has(directoryPath)) {
    tree.set(directoryPath, { directories: new Set(), files: new Map() });
  }
}

function createRoutePlan(tree, indexCandidateKeys) {
  const normalizedDirectoryPathBySource = new Map();
  const defaultMarkdownSourceByDirectory = new Map();
  const routeOwners = new Map();
  const sourceHrefByPath = new Map();
  const directoryPages = [];
  const filePages = [];

  const directoryPaths = [...tree.keys()].sort((a, b) => {
    const depthDiff = pathDepth(a) - pathDepth(b);
    if (depthDiff !== 0) {
      return depthDiff;
    }
    return a.localeCompare(b);
  });

  for (const directoryPath of directoryPaths) {
    const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath);
    normalizedDirectoryPathBySource.set(directoryPath, normalizedDirectoryPath);

    const outputRelPath = normalizedDirectoryPath
      ? `${normalizedDirectoryPath}/index.html`
      : "index.html";

    claimOutputPath(routeOwners, outputRelPath, `directory:${directoryPath || "<root>"}`);

    const node = tree.get(directoryPath);
    const fileEntries = [...node.files.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    const selection = selectPreferredIndex(fileEntries, (entry) => entry[0], {
      indexCandidateKeys,
    });
    if (selection.conflict) {
      throw new Error(
        [
          "Ambiguous top-priority index files after normalization.",
          `Directory: ${directoryPath || "<root>"}`,
          `Conflicting files: ${selection.conflict.names.join(", ")}`,
        ].join("\n"),
      );
    }

    const defaultMarkdownSource = selection.selected?.[1] || null;
    defaultMarkdownSourceByDirectory.set(directoryPath, defaultMarkdownSource);

    directoryPages.push({
      sourceDirectoryPath: directoryPath,
      normalizedDirectoryPath,
      outputRelPath,
      defaultMarkdownSource,
    });

    if (defaultMarkdownSource) {
      sourceHrefByPath.set(defaultMarkdownSource, toHrefFromOutputPath(outputRelPath));
    }
  }

  for (const directoryPath of directoryPaths) {
    const node = tree.get(directoryPath);
    const fileEntries = [...node.files.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const defaultMarkdownSource = defaultMarkdownSourceByDirectory.get(directoryPath) || null;

    for (const [, sourcePath] of fileEntries) {
      if (sourcePath === defaultMarkdownSource) {
        continue;
      }

      const normalizedDirectoryPath = normalizedDirectoryPathBySource.get(directoryPath) || "";
      const outputRelPath = toFileOutputRelativePath(normalizedDirectoryPath, sourcePath);

      claimOutputPath(routeOwners, outputRelPath, `file:${sourcePath}`);
      filePages.push({
        sourcePath,
        outputRelPath,
      });

      sourceHrefByPath.set(sourcePath, toHrefFromOutputPath(outputRelPath));
    }
  }

  return {
    directoryPages,
    filePages,
    normalizedDirectoryPathBySource,
    sourceHrefByPath,
  };
}

function claimOutputPath(routeOwners, outputRelPath, owner) {
  const existing = routeOwners.get(outputRelPath);
  if (!existing) {
    routeOwners.set(outputRelPath, owner);
    return;
  }

  if (existing === owner) {
    return;
  }

  throw new Error(
    [
      "Route conflict detected after URL normalization.",
      `Target output path: ${outputRelPath}`,
      `Existing owner: ${existing}`,
      `Conflicting owner: ${owner}`,
    ].join("\n"),
  );
}

function normalizeDirectoryPath(directoryPath) {
  const segments = directoryPath.split("/").filter(Boolean);
  return segments.map((segment) => normalizeSegment(segment)).join("/");
}

function toFileOutputRelativePath(normalizedDirectoryPath, sourcePath) {
  const parsed = parseSourcePath(sourcePath);

  if (parsed.extension === ".md") {
    const slug = normalizeSegment(parsed.name);
    return joinRoutePath(normalizedDirectoryPath, slug, "index.html");
  }

  const slug = parsed.extension
    ? normalizeSegment(`${parsed.name}-${parsed.extension.slice(1)}`)
    : normalizeSegment(parsed.name);

  return joinRoutePath(normalizedDirectoryPath, slug, "index.html");
}

function joinRoutePath(...segments) {
  return segments.filter(Boolean).join("/");
}

async function publishDirectoryPages(routePlan, tree, gitContext, augmentationsBySourcePath) {
  for (const page of routePlan.directoryPages) {
    const node = tree.get(page.sourceDirectoryPath);
    const directories = [...node.directories].sort((a, b) => a.localeCompare(b));
    const fileEntries = [...node.files.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const fallbackSelection = selectPreferredIndex(fileEntries, (entry) => entry[0], {
      indexCandidateKeys,
    });
    const resolvedDefaultSource = page.defaultMarkdownSource || fallbackSelection.selected?.[1] || null;

    const fileItems = fileEntries
      .filter(([, sourcePath]) => {
        return sourcePath !== resolvedDefaultSource;
      })
      .map(([fileName, sourcePath]) => {
        const href = toHrefFromOutputPath(
          toFileOutputRelativePath(page.normalizedDirectoryPath, sourcePath),
        );

        return {
          sourcePath,
          href,
          label: fileName,
        };
      });

    const directoryItems = directories.map((name) => {
      const sourceChildPath = page.sourceDirectoryPath
        ? `${page.sourceDirectoryPath}/${name}`
        : name;
      const normalizedChildPath = normalizeDirectoryPath(sourceChildPath);
      const href = toHrefFromOutputPath(joinRoutePath(normalizedChildPath, "index.html"));

      return {
        sourcePath: sourceChildPath,
        href,
        label: `${name}/`,
      };
    });

    const html = await renderDirectoryPage({
      page: {
        ...page,
        defaultMarkdownSource: resolvedDefaultSource,
      },
      directoryItems,
      fileItems,
      gitContext,
      sourceHrefByPath: routePlan.sourceHrefByPath,
      augmentationsBySourcePath,
    });

    const outputPath = path.join(DIST_DIR, ...page.outputRelPath.split("/"));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html, "utf8");
  }
}

async function publishFilePages(routePlan, gitContext, augmentationsBySourcePath) {
  for (const filePage of routePlan.filePages) {
    const absolutePath = path.join(REPO_DIR, ...filePage.sourcePath.split("/"));
    const preview = await readFilePreview(absolutePath);
    const html = renderFilePage({
      sourcePath: filePage.sourcePath,
      outputRelPath: filePage.outputRelPath,
      preview,
      gitContext,
      sourceHrefByPath: routePlan.sourceHrefByPath,
      augmentationsBySourcePath,
    });

    const outputPath = path.join(DIST_DIR, ...filePage.outputRelPath.split("/"));
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html, "utf8");
  }
}

async function renderDirectoryPage({
  page,
  directoryItems,
  fileItems,
  gitContext,
  sourceHrefByPath,
  augmentationsBySourcePath,
}) {
  const sourceLabel = page.sourceDirectoryPath ? `${page.sourceDirectoryPath}/` : siteName;
  const breadcrumbs = renderBreadcrumbItemsFromOutputPath(page.outputRelPath);

  let markdownSection = `<article class="markdown-body"><h1>${escapeHtml(sourceLabel)}</h1></article>`;
  let metadataSection = "";
  let documentTitle = page.sourceDirectoryPath ? `${page.sourceDirectoryPath}/ | ${siteName}` : siteName;

  if (page.defaultMarkdownSource) {
    const markdownPath = path.join(REPO_DIR, ...page.defaultMarkdownSource.split("/"));
    const markdown = await fs.readFile(markdownPath, "utf8");
    const parsed = parseMarkdownDocument(markdown);
    const html = marked.parse(parsed.body, { gfm: true, async: false });
    const rewritten = rewriteMarkdownLinks(String(html), page.defaultMarkdownSource, sourceHrefByPath);
    markdownSection = `<article class="markdown-body">${rewritten}</article>`;
    metadataSection = renderDocMetadata(parsed.metadata);

    const title = extractTitle(parsed.body);
    documentTitle = page.outputRelPath === "index.html" ? title : `${title} | ${siteName}`;
  }

  const body = `${metadataSection}
${markdownSection}`;

  return renderLayout({
    title: documentTitle,
    breadcrumbs,
    body,
    sourcePath: page.defaultMarkdownSource,
    sourceUrl: page.defaultMarkdownSource
      ? toSourceUrl(page.defaultMarkdownSource, gitContext)
      : null,
    augmentations: getAugmentationsForSourcePath(augmentationsBySourcePath, page.defaultMarkdownSource),
  });
}

function renderFilePage({
  sourcePath,
  outputRelPath,
  preview,
  gitContext,
  sourceHrefByPath,
  augmentationsBySourcePath,
}) {
  const breadcrumbs = renderBreadcrumbItemsFromOutputPath(outputRelPath);
  const extension = extensionLabel(sourcePath);
  const header = `<h1>${escapeHtml(sourcePath)}</h1>
<p class="subdued">${escapeHtml(extension)} • ${preview.size.toLocaleString()} bytes</p>`;

  let pageTitle = `${sourcePath} | ${siteName}`;
  let body = "";
  if (preview.type === "markdown") {
    const parsed = parseMarkdownDocument(preview.markdown);
    const html = marked.parse(parsed.body, { gfm: true, async: false });
    const rewritten = rewriteMarkdownLinks(String(html), sourcePath, sourceHrefByPath);
    const metadataSection = renderDocMetadata(parsed.metadata);
    body = `${metadataSection}<article class="markdown-body">${rewritten}</article>`;
    pageTitle = `${extractTitle(parsed.body)} | ${siteName}`;
  } else if (preview.type === "text") {
    const truncateNote = preview.truncated
      ? `<p class="subdued">Preview truncated to first 400,000 bytes.</p>`
      : "";
    body = `<article class="markdown-body">${header}${truncateNote}<pre><code>${escapeHtml(preview.content)}</code></pre></article>`;
  } else if (preview.type === "binary") {
    body = `<article class="markdown-body">${header}<p>Binary file preview is disabled.</p></article>`;
  } else {
    body = `<article class="markdown-body">${header}<p>File is not available for text preview.</p></article>`;
  }

  return renderLayout({
    title: pageTitle,
    breadcrumbs,
    body,
    sourcePath,
    sourceUrl: toSourceUrl(sourcePath, gitContext),
    augmentations: getAugmentationsForSourcePath(augmentationsBySourcePath, sourcePath),
  });
}

function getAugmentationsForSourcePath(augmentationsBySourcePath, sourcePath) {
  if (!sourcePath) {
    return null;
  }

  return augmentationsBySourcePath.get(sourcePath) || null;
}

async function readFilePreview(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile()) {
    return { type: "unavailable", size: stat.size };
  }

  const extension = path.extname(filePath).toLowerCase();
  const raw = await fs.readFile(filePath);

  if (extension === ".md") {
    const markdown = raw.toString("utf8");
    return {
      type: "markdown",
      size: stat.size,
      markdown,
    };
  }

  const maxBytes = 400_000;
  if (looksBinary(raw)) {
    return { type: "binary", size: stat.size };
  }

  const truncated = raw.length > maxBytes;
  const visible = truncated ? raw.subarray(0, maxBytes) : raw;

  return {
    type: "text",
    size: stat.size,
    truncated,
    content: visible.toString("utf8"),
  };
}

function looksBinary(buffer) {
  const sampleSize = Math.min(buffer.length, 4096);
  if (sampleSize === 0) {
    return false;
  }

  let nonTextCount = 0;
  for (let index = 0; index < sampleSize; index += 1) {
    const value = buffer[index];
    if (value === 0) {
      return true;
    }

    const isControl = value < 32 && value !== 9 && value !== 10 && value !== 13;
    if (isControl) {
      nonTextCount += 1;
    }
  }

  return nonTextCount / sampleSize > 0.1;
}

function renderLayout({ title, breadcrumbs, body, sourcePath, sourceUrl, augmentations }) {
  const metaBar = renderMetaBar(breadcrumbs);
  const sourceLine = sourcePath
    ? sourceUrl
      ? `<p class="doc-source subdued">Source: <a href="${escapeHtmlAttribute(sourceUrl)}">${escapeHtml(sourcePath)}</a></p>`
      : `<p class="doc-source subdued">Source: ${escapeHtml(sourcePath)}</p>`
    : "";
  const inlineCssBlocks = renderInlineCssAugmentations(augmentations?.css);
  const inlineJsBlocks = renderInlineJsAugmentations(augmentations?.js);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" type="image/svg+xml" href="/icons/favicon.svg" />
    <link rel="stylesheet" href="/css/style.css" />
${inlineCssBlocks}
  </head>
  <body>
    <main class="doc-shell">
      ${body}
    </main>
    <footer class="page-footer">
      ${metaBar}
      ${sourceLine}
    </footer>
${inlineJsBlocks}
  </body>
</html>
`;
}

function renderInlineCssAugmentations(cssChunks) {
  if (!Array.isArray(cssChunks) || cssChunks.length === 0) {
    return "";
  }

  return cssChunks
    .map((chunk) => {
      const css = String(chunk || "").trim();
      if (!css) {
        return "";
      }

      return `    <style data-augmentation="css">\n${css}\n    </style>`;
    })
    .filter(Boolean)
    .join("\n");
}

function renderInlineJsAugmentations(jsChunks) {
  if (!Array.isArray(jsChunks) || jsChunks.length === 0) {
    return "";
  }

  return jsChunks
    .map((chunk) => {
      const js = String(chunk || "").trim();
      if (!js) {
        return "";
      }

      return `    <script data-augmentation="js">\n${js}\n    </script>`;
    })
    .filter(Boolean)
    .join("\n");
}

async function writePublishReport({ sourceCount, routePlan, augmentationResult }) {
  const updatedDate = new Date().toISOString().slice(0, 10);
  const diagnostics = augmentationResult.diagnostics;

  const matchedBySource = new Map();
  for (const entry of diagnostics.matchedAugmentations) {
    const current = matchedBySource.get(entry.sourcePath) || [];
    current.push(entry);
    matchedBySource.set(entry.sourcePath, current);
  }

  const matchedBody =
    matchedBySource.size === 0
      ? "No matched augmentations."
      : [...matchedBySource.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([sourcePath, entries]) => {
            const href = routePlan.sourceHrefByPath.get(sourcePath) || "(no route)";
            const lines = entries
              .sort((a, b) => a.type.localeCompare(b.type))
              .map((entry) => `  - ${entry.type}: ${entry.augmentationPath}`)
              .join("\n");
            return `- Source: ${sourcePath}\n  - Route: ${href}\n${lines}`;
          })
          .join("\n");

  const unmatchedBody =
    diagnostics.unmatchedAugmentations.length === 0
      ? "No unmatched augmentations."
      : diagnostics.unmatchedAugmentations
          .map(
            (entry) =>
              `- Type: ${entry.type}\n  - File: ${entry.augmentationPath}\n  - Lookup key: ${entry.lookupKey}`,
          )
          .join("\n");

  const skippedBody =
    diagnostics.skippedSiteFiles.length === 0
      ? "No skipped site files."
      : diagnostics.skippedSiteFiles.map((entry) => `- ${entry}`).join("\n");

  const typeSummary = Object.keys(diagnostics.augmentationFilesByType)
    .sort((a, b) => a.localeCompare(b))
    .map((type) => `- ${type}: ${diagnostics.augmentationFilesByType[type]}`)
    .join("\n");

  const report = `# Publish Website Report

Last updated: ${updatedDate}

Run type: Publish website

## Summary

- Source files published: ${sourceCount}
- Site files scanned: ${diagnostics.scannedSiteFileCount}
- Augmentation files loaded: ${diagnostics.augmentationFileCount}
- Matched augmentation links: ${diagnostics.matchedAugmentations.length}
- Unmatched augmentation files: ${diagnostics.unmatchedAugmentations.length}

## Augmentation Files By Type

${typeSummary || "No augmentation files loaded."}

## Matched Augmentations

${matchedBody}

## Unmatched Augmentations

${unmatchedBody}

## Skipped Site Files

${skippedBody}
`;

  await fs.writeFile(PUBLISH_REPORT_PATH, report, "utf8");
}

function renderMetaBar(breadcrumbs) {
  if (breadcrumbs.length <= 1) {
    return "";
  }

  const breadcrumbHtml = breadcrumbs
    .map((item, index) => {
      if (index === breadcrumbs.length - 1 || !item.href) {
        return `<span aria-current="page">${escapeHtml(item.title)}</span>`;
      }
      return `<a href="${escapeHtmlAttribute(item.href)}">${escapeHtml(item.title)}</a>`;
    })
    .join(" / ");

  return `
      <section class="doc-meta-bar subdued" aria-label="Source and path">
        <nav class="doc-breadcrumbs" aria-label="Breadcrumb">${breadcrumbHtml}</nav>
      </section>
  `;
}

function renderBreadcrumbItemsFromOutputPath(outputRelPath) {
  if (outputRelPath === "index.html") {
    return [{ title: siteName, href: null }];
  }

  const normalizedDirectoryPath = outputRelPath.endsWith("/index.html")
    ? outputRelPath.slice(0, -"/index.html".length)
    : path.posix.dirname(outputRelPath);

  if (!normalizedDirectoryPath) {
    return [{ title: siteName, href: null }];
  }

  const parts = normalizedDirectoryPath.split("/").filter(Boolean);
  const crumbs = [{ title: siteName, href: "/" }];

  let current = "";
  for (let index = 0; index < parts.length; index += 1) {
    current = current ? `${current}/${parts[index]}` : parts[index];

    if (index === parts.length - 1) {
      crumbs.push({ title: parts[index], href: null });
      continue;
    }

    const href = toHrefFromOutputPath(`${current}/index.html`);
    crumbs.push({ title: parts[index], href });
  }

  return crumbs;
}

function toHrefFromOutputPath(outputRelPath) {
  if (outputRelPath === "index.html") {
    return "/";
  }

  if (!outputRelPath.endsWith("/index.html")) {
    throw new Error(`Unexpected output path format: ${outputRelPath}`);
  }

  return `/${outputRelPath.slice(0, -"index.html".length)}`;
}

function rewriteMarkdownLinks(html, sourcePath, sourceHrefByPath) {
  return html.replace(/href="([^"]+)"/g, (fullMatch, rawHref) => {
    const resolved = resolveMarkdownHref(sourcePath, rawHref, sourceHrefByPath);
    return `href="${escapeHtmlAttribute(resolved)}"`;
  });
}

function resolveMarkdownHref(sourcePath, href, sourceHrefByPath) {
  const cleaned = String(href || "").trim();
  if (!cleaned || cleaned.startsWith("#")) {
    return cleaned || "#";
  }

  if (/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(cleaned) || cleaned.startsWith("//")) {
    return cleaned;
  }

  const hashIndex = cleaned.indexOf("#");
  const pathPart = hashIndex >= 0 ? cleaned.slice(0, hashIndex) : cleaned;
  const hash = hashIndex >= 0 ? cleaned.slice(hashIndex) : "";

  const resolvedSourcePath = resolveSourceRelativePath(sourcePath, pathPart);
  if (!resolvedSourcePath) {
    return `${pathPart}${hash}`;
  }

  const mappedHref = sourceHrefByPath.get(resolvedSourcePath);
  if (!mappedHref) {
    const fallbackHref = findCaseInsensitiveSourceHref(sourceHrefByPath, resolvedSourcePath);
    if (!fallbackHref) {
      return `${pathPart}${hash}`;
    }
    return `${fallbackHref}${hash}`;
  }

  return `${mappedHref}${hash}`;
}

function findCaseInsensitiveSourceHref(sourceHrefByPath, sourcePath) {
  const normalized = sourcePath.toLowerCase();
  for (const [candidatePath, href] of sourceHrefByPath.entries()) {
    if (candidatePath.toLowerCase() === normalized) {
      return href;
    }
  }

  return null;
}

function resolveSourceRelativePath(sourcePath, hrefPath) {
  if (!hrefPath) {
    return null;
  }

  if (hrefPath.startsWith("/")) {
    return hrefPath.slice(1);
  }

  const baseDirectory = sourcePath.includes("/")
    ? sourcePath.slice(0, sourcePath.lastIndexOf("/") + 1)
    : "";

  const baseSegments = baseDirectory.split("/").filter(Boolean);
  const hrefSegments = hrefPath.split("/").filter(Boolean);

  for (const segment of hrefSegments) {
    if (segment === ".") {
      continue;
    }

    if (segment === "..") {
      baseSegments.pop();
      continue;
    }

    baseSegments.push(segment);
  }

  return baseSegments.join("/");
}

function parseSourcePath(sourcePath) {
  const fileName = sourcePath.split("/").pop() || sourcePath;
  const extension = path.extname(fileName).toLowerCase();
  const name = extension ? fileName.slice(0, -extension.length) : fileName;

  return {
    fileName,
    extension,
    name,
  };
}

function parseMarkdownDocument(markdown) {
  const parsed = frontMatter(markdown);
  return {
    body: parsed.body,
    metadata: toDocMetadata(parsed.attributes),
  };
}

function toDocMetadata(attributes) {
  const metadata = { linkedRequirements: [] };
  const audienceValue = attributes?.audience;
  if (typeof audienceValue === "string") {
    metadata.audience = audienceValue.trim();
  }

  const linkedRequirementsValue = attributes?.linkedRequirements ?? attributes?.linked_requirements;
  metadata.linkedRequirements = normalizeLinkedRequirements(linkedRequirementsValue);

  return metadata;
}

function normalizeLinkedRequirements(value) {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function renderDocMetadata(metadata) {
  const audience = metadata.audience?.trim();
  const linkedRequirements = metadata.linkedRequirements;
  if (!audience && linkedRequirements.length === 0) {
    return "";
  }

  const audienceLine = audience ? `<p><strong>Audience:</strong> ${escapeHtml(audience)}</p>` : "";
  const requirementsLine =
    linkedRequirements.length > 0
      ? `<p><strong>Linked requirements:</strong> ${escapeHtml(linkedRequirements.join(", "))}</p>`
      : "";

  return `
      <section aria-label="Document metadata">
        ${audienceLine}
        ${requirementsLine}
      </section>
  `;
}

function extractTitle(markdown) {
  const titleMatch = markdown.match(/^#\s+(.+)$/m);
  return titleMatch?.[1].trim() || "Reason Tracker";
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

function extensionLabel(filePath) {
  const fileName = filePath.split("/").pop() || filePath;
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return "no extension";
  }

  return fileName.slice(dotIndex + 1).toLowerCase();
}

function pathDepth(relativePath) {
  if (!relativePath) {
    return 0;
  }

  return relativePath.split("/").filter(Boolean).length;
}

async function getGitContext() {
  const branchResult = await runCommand("git", ["-C", REPO_DIR, "rev-parse", "--abbrev-ref", "HEAD"]);
  const branch = branchResult.stdout.trim() || "main";

  const remoteResult = await runCommand(
    "git",
    ["-C", REPO_DIR, "config", "--get", "remote.origin.url"],
    { allowFailure: true },
  );

  const remote = remoteResult.stdout.trim();
  const githubBase = normalizeGitHubRemote(remote);

  return {
    branch,
    githubBase,
  };
}

function normalizeGitHubRemote(remote) {
  if (!remote) {
    return null;
  }

  const sshMatch = remote.match(/^git@github\.com:(.+?)(?:\.git)?$/i);
  if (sshMatch) {
    return `https://github.com/${sshMatch[1]}`;
  }

  const httpsMatch = remote.match(/^https?:\/\/github\.com\/(.+?)(?:\.git)?$/i);
  if (httpsMatch) {
    return `https://github.com/${httpsMatch[1]}`;
  }

  return null;
}

function toSourceUrl(relativePath, gitContext) {
  if (!gitContext.githubBase) {
    return null;
  }

  const encodedPath = encodePath(relativePath);
  return `${gitContext.githubBase}/blob/${encodeURIComponent(gitContext.branch)}/${encodedPath}`;
}

function encodePath(relativePath) {
  return relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function copyIfPresent(source, destination) {
  try {
    await fs.access(source);
    await fs.cp(source, destination, { recursive: true });
  } catch {
    // Static assets are optional in some setups.
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlAttribute(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
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

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
