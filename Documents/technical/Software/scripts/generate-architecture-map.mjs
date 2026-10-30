import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ELK from "elkjs/lib/elk.bundled.js";
import { cruise } from "dependency-cruiser";
import { toDirectoryHref } from "./markdown-index-rules.mts";
import { PUBLISHED_PACKAGE_ASSETS } from "./published-package-assets.mts";

const SOFTWARE_DIR = path.resolve(import.meta.dirname, "..");
const REPO_DIR = path.resolve(SOFTWARE_DIR, "../../..");
const DEFINITION_PATH = path.join(SOFTWARE_DIR, "design", "repository-architecture.json");
const OUTPUT_PATH = path.join(SOFTWARE_DIR, "website", "site", "modules", "software-architecture.json");
const OUTPUT_RELATIVE_PATH = "Documents/technical/Software/website/site/modules/software-architecture.json";
const isCheck = process.argv.includes("--check");
const isStrict = process.argv.includes("--strict");
const byName = (left, right) => left < right ? -1 : left > right ? 1 : 0;

try {
  const definition = JSON.parse(await readFile(DEFINITION_PATH, "utf8"));
  const packageData = await loadPackageData(definition.areas);
  const files = await collectFiles(definition);
  const softwarePrefix = `${definition.workspacePrefix}/`;
  const softwareFiles = files
    .filter((file) => file.startsWith(softwarePrefix))
    .map((file) => file.slice(softwarePrefix.length));
  const repositoryFiles = files.filter((file) => !file.startsWith(softwarePrefix));
  const unassignedFiles = softwareFiles.filter((file) => !findArea(file, definition.areas, definition.workspaceFiles));
  const areas = buildAreas(softwareFiles, definition, packageData);
  const repositoryTree = buildRepositoryTree(repositoryFiles, definition.workspacePrefix);
  const dependencyData = await analyzeDependencies(definition, packageData);
  const exceptions = await validateExceptions(definition.approvedRuntimeExceptions);
  const layout = await layoutAreas(areas, dependencyData.edges);
  const report = {
    unexpectedDependencies: dependencyData.unexpectedDependencies,
    boundaryBypasses: dependencyData.boundaryBypasses,
    unassignedFiles,
    staleExceptions: exceptions.stale,
    approvedExceptions: exceptions.approved,
  };
  const output = {
    version: definition.version,
    repositoryTree,
    layout: {
      width: layout.width,
      height: layout.height,
    },
    areas: areas.map((area) => ({
      ...area,
      ...layout.children.find((node) => node.id === area.id),
    })),
    edges: layout.edges.map((edge) => ({
      id: edge.id,
      from: edge.sources[0],
      to: edge.targets[0],
      count: dependencyData.edges.find((candidate) => candidate.id === edge.id)?.count ?? 0,
      assetReferences: dependencyData.edges.find((candidate) => candidate.id === edge.id)?.assetReferences ?? [],
      declared: dependencyData.edges.find((candidate) => candidate.id === edge.id)?.declared ?? false,
    })),
    allowedPackageImports: definition.allowedPackageImports,
    allowedRelativeImports: definition.allowedRelativeImports,
    report,
  };

  if (!isCheck) {
    await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  }

  printReport(report, isCheck ? "Checked" : "Generated");
  if (isStrict && hasFindings(report)) {
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`[architecture] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}

async function collectFiles(definition) {
  const output = execFileSync("git", [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
  ], {
    cwd: REPO_DIR,
    encoding: "utf8",
  });
  const files = [...new Set(output.split("\0").filter(Boolean))]
    .map((file) => file.replaceAll("\\", "/"))
    .filter((file) => file !== OUTPUT_RELATIVE_PATH)
    .filter((file) => !file.split("/").some((segment) => definition.excludedPathSegments.includes(segment)))
    .filter((file) => existsSync(path.join(REPO_DIR, ...file.split("/"))))
    .sort(byName);

  return files;
}

function buildRepositoryTree(files, workspacePrefix) {
  const tree = { name: "Repository", path: ".", kind: "directory", children: [] };
  for (const file of files) {
    const directorySegments = file.split("/").slice(0, -1);
    if (directorySegments.length > 0) insertDirectory(tree, directorySegments);
  }
  const workspace = insertDirectory(tree, workspacePrefix.split("/"));
  workspace.kind = "workspace";
  workspace.children = [];
  sortTree(tree);
  return tree;
}

function insertDirectory(root, segments) {
  let current = root;
  for (const [index, segment] of segments.entries()) {
    const relativePath = segments.slice(0, index + 1).join("/");
    let child = current.children.find((entry) => entry.name === segment);
    if (!child) {
      child = { name: segment, path: relativePath, kind: "directory", children: [] };
      current.children.push(child);
    }
    current = child;
  }
  return current;
}

function findArea(file, areas, workspaceFiles = []) {
  return areas.find((area) => area.rootFiles === true
    ? workspaceFiles.includes(file)
    : Array.isArray(area.rootFiles)
      ? area.rootFiles.includes(file)
    : file === area.root || file.startsWith(`${area.root}/`));
}

function buildAreas(files, definition, packageData) {
  return definition.areas.map((area) => {
    const areaFiles = files.filter((file) => findArea(file, [area], definition.workspaceFiles));
    const rootPath = area.rootFiles === true
      ? definition.workspacePrefix
      : `${definition.workspacePrefix}/${area.root}`;
    const displayPath = rootPath.startsWith("Documents/technical/")
      ? rootPath.slice("Documents/technical/".length)
      : rootPath;

    return {
      id: area.id,
      label: area.label ?? titleCase(area.id),
      root: area.root ?? ".",
      path: displayPath,
      href: toDirectoryHref(rootPath),
      description: area.description,
      fileCount: areaFiles.length,
      packageName: area.packageName ?? null,
      exports: packageData.get(area.id)?.exports ?? null,
      searchText: `${area.label ?? titleCase(area.id)} ${rootPath} ${area.description}`.toLowerCase(),
      width: 340,
      height: 200,
    };
  });
}

function sortTree(node) {
  node.children.sort((left, right) => {
    if (left.kind === "directory" && right.kind !== "directory") return -1;
    if (right.kind === "directory" && left.kind !== "directory") return 1;
    return byName(left.name, right.name);
  });
  node.children.forEach(sortTree);
}

function titleCase(value) {
  return value.replaceAll("-", " ").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

async function loadPackageData(areas) {
  const result = new Map();
  for (const area of areas.filter((entry) => entry.packageName)) {
    const packagePath = path.join(SOFTWARE_DIR, area.root, "package.json");
    const manifest = JSON.parse(await readFile(packagePath, "utf8"));
    result.set(area.id, { manifest, exports: manifest.exports ?? {} });
  }
  return result;
}

async function analyzeDependencies(definition, packageData) {
  const cruiseResult = await cruise(definition.analysisRoots.map((root) => path.join(SOFTWARE_DIR, root)), {
    baseDir: SOFTWARE_DIR,
    doNotFollow: "node_modules",
    exclude: "(^|/)dist/",
    outputType: "json",
  });
  const graph = JSON.parse(cruiseResult.output);
  const packageNames = new Map(definition.areas.filter((area) => area.packageName).map((area) => [area.packageName, area]));
  const allowedImports = new Set(definition.allowedPackageImports.map(({ from, to }) => `${from}:${to}`));
  const allowedRelative = new Set(definition.allowedRelativeImports.map(({ from, to }) => `${from}:${to}`));
  const unexpectedDependencies = [];
  const boundaryBypasses = [];
  const edges = new Map();

  for (const area of definition.areas.filter((entry) => entry.packageName)) {
    const manifest = packageData.get(area.id)?.manifest ?? {};
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      for (const [name, version] of Object.entries(manifest[field] ?? {})) {
        if (!String(version).startsWith("workspace:")) continue;
        const target = packageNames.get(name);
        if (!target) continue;
        if (!allowedImports.has(`${area.id}:${target.id}`)) {
          unexpectedDependencies.push({ from: area.id, to: target.id, file: `${area.root}/package.json`, kind: "package dependency" });
        }
        addEdge(edges, area.id, target.id, null, true);
      }
    }
  }

  for (const asset of PUBLISHED_PACKAGE_ASSETS) {
    const target = packageNames.get(asset.packageName);
    if (!target) {
      throw new Error(`Published asset ${asset.specifier} has no architecture area for ${asset.packageName}.`);
    }
    addEdge(edges, asset.from, target.id, null, false, asset.specifier);
  }

  for (const module of graph.modules) {
    const fromArea = findArea(module.source, definition.areas, definition.workspaceFiles);
    if (!fromArea) continue;

    for (const dependency of module.dependencies ?? []) {
      const packageImport = [...packageNames.entries()].find(([name]) =>
        dependency.module === name || dependency.module.startsWith(`${name}/`),
      );
      let targetPath = dependency.resolved?.replaceAll("\\", "/") ?? "";
      let toArea = findArea(targetPath, definition.areas, definition.workspaceFiles);
      if (packageImport) {
        const [packageName, packageArea] = packageImport;
        const exportedPath = resolveExportPath(packageData.get(packageArea.id)?.exports, packageName, dependency.module, packageArea.root);
        if (!exportedPath) {
          boundaryBypasses.push({
            from: module.source,
            to: dependency.module,
            reason: "The workspace import does not match an exported package entrypoint.",
          });
          continue;
        }
        targetPath = exportedPath;
        toArea = findArea(targetPath, definition.areas, definition.workspaceFiles);
        if (!allowedImports.has(`${fromArea.id}:${packageArea.id}`)) {
          unexpectedDependencies.push({ from: module.source, to: targetPath, kind: "package import" });
          addEdge(edges, fromArea.id, packageArea.id, { file: module.source, specifier: dependency.module });
          continue;
        }
        addEdge(edges, fromArea.id, packageArea.id, { file: module.source, specifier: dependency.module });
      } else {
        toArea = findArea(targetPath, definition.areas, definition.workspaceFiles);
      }

      if (!toArea || toArea.id === fromArea.id) continue;
      if (!packageImport) {
        const relativeImport = definition.allowedRelativeImports.find((entry) =>
          entry.from === module.source && entry.to === targetPath,
        );
        if (!relativeImport) {
          boundaryBypasses.push({
            from: module.source,
            to: targetPath || dependency.module,
            reason: "A relative import crosses an ownership boundary instead of using an allowed package entrypoint.",
          });
          unexpectedDependencies.push({ from: module.source, to: targetPath || dependency.module, kind: "relative import" });
        }
        addEdge(edges, fromArea.id, toArea.id, { file: module.source, specifier: dependency.module });
      }
    }
  }

  return {
    edges: [...edges.values()]
      .map(({ references, assetReferences, ...edge }) => ({
        ...edge,
        count: references.size,
        assetReferences: [...assetReferences].sort(byName),
      }))
      .sort((left, right) => byName(left.id, right.id)),
    unexpectedDependencies: uniqueRecords(unexpectedDependencies),
    boundaryBypasses: uniqueRecords(boundaryBypasses),
  };
}

function resolveExportPath(exportsMap, packageName, specifier, packageRoot) {
  const subpath = specifier === packageName ? "." : `.${specifier.slice(packageName.length)}`;
  const keys = Object.keys(exportsMap ?? {}).sort((left, right) => right.length - left.length);
  for (const key of keys) {
    const wildcardIndex = key.indexOf("*");
    const matches = wildcardIndex < 0
      ? key === subpath ? "" : null
      : subpath.startsWith(key.slice(0, wildcardIndex))
        && subpath.endsWith(key.slice(wildcardIndex + 1))
        ? subpath.slice(wildcardIndex, subpath.length - key.length + wildcardIndex + 1)
        : null;
    if (matches === null) continue;
    const targets = collectExportTargets(exportsMap[key]);
    if (targets.length === 0) continue;
    return path.posix.normalize(path.posix.join(packageRoot, targets[0].replaceAll("*", matches).replace(/^\.\//, "")));
  }
  return null;
}

function collectExportTargets(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectExportTargets);
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(collectExportTargets);
  }
  return [];
}

function addEdge(edges, from, to, reference, declared = false, assetReference = null) {
  if (from === to) return;
  const id = `${from}--${to}`;
  const edge = edges.get(id) ?? {
    id,
    from,
    to,
    references: new Set(),
    assetReferences: new Set(),
    declared: false,
  };
  if (reference) edge.references.add(`${reference.file}\0${reference.specifier}`);
  if (assetReference) edge.assetReferences.add(assetReference);
  edge.declared ||= declared;
  edges.set(id, edge);
}

function uniqueRecords(records) {
  const unique = new Map(records.map((record) => [JSON.stringify(record), record]));
  return [...unique.values()].sort((left, right) => byName(JSON.stringify(left), JSON.stringify(right)));
}

async function validateExceptions(definitions) {
  const approved = [];
  const stale = [];
  for (const exception of definitions) {
    const filePath = path.join(SOFTWARE_DIR, ...exception.file.split("/"));
    const content = await readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    const locationLine = lines.findIndex((line) => line.includes(exception.locationMatch));
    const symbolLine = lines.findIndex((line) => line.includes(`function ${exception.symbol}(`));
    if (locationLine < 0 || symbolLine < 0) {
      stale.push({ file: exception.file, symbol: exception.symbol, reason: "The documented runtime path or function could not be found." });
      continue;
    }
    approved.push({
      file: exception.file,
      symbol: exception.symbol,
      line: symbolLine + 1,
      pathLine: locationLine + 1,
      target: exception.target,
      reason: exception.reason,
    });
  }
  return { approved, stale };
}

async function layoutAreas(areas, edges) {
  const elk = new ELK();
  const graph = await elk.layout({
    id: "software-workspace",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "48",
      "elk.layered.spacing.nodeNodeBetweenLayers": "92",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: areas.map(({ id, width, height }) => ({ id, width, height })),
    edges: edges.map(({ id, from, to }) => ({ id, sources: [from], targets: [to] })),
  });
  return graph;
}

function hasFindings(report) {
  return report.unexpectedDependencies.length > 0
    || report.boundaryBypasses.length > 0
    || report.unassignedFiles.length > 0
    || report.staleExceptions.length > 0;
}

function printReport(report, action) {
  console.log(`[architecture] ${action} software map data.`);
  console.log(`[architecture] ${report.unexpectedDependencies.length} unexpected dependencies; ${report.boundaryBypasses.length} boundary bypasses; ${report.unassignedFiles.length} unassigned files; ${report.approvedExceptions.length} approved runtime exceptions.`);
  for (const entry of report.unexpectedDependencies) {
    console.log(`[architecture] unexpected ${entry.kind}: ${entry.from} imports from ${entry.to}`);
  }
  for (const entry of report.boundaryBypasses) {
    console.log(`[architecture] boundary bypass: ${entry.from} imports from ${entry.to} (${entry.reason})`);
  }
  for (const file of report.unassignedFiles) {
    console.log(`[architecture] unassigned file: ${file}`);
  }
  for (const entry of report.staleExceptions) {
    console.log(`[architecture] stale exception: ${entry.file} ${entry.symbol}: ${entry.reason}`);
  }
}
