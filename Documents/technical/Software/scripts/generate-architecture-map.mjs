import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ELK from "elkjs/lib/elk.bundled.js";
import { cruise } from "dependency-cruiser";
import ts from "typescript";
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
const importKindsCache = new Map();
/** Size of a package card that has no module boxes. */
const LEAF_AREA_WIDTH = 320;
const LEAF_AREA_HEIGHT = 170;
/** Space reserved above module boxes for the package title, path, and description. */
const AREA_HEADER_HEIGHT = 128;
const MODULE_WIDTH = 176;
const MODULE_HEIGHT = 58;
/** Extra module height for each additional folder link in a grouped module. */
const MODULE_PATH_HEIGHT = 18;

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
  const dependencyData = await analyzeDependencies(definition, packageData, areas);
  const exceptions = await validateExceptions(definition.approvedRuntimeExceptions);
  const layout = await layoutAreas(areas, dependencyData.diagramEdges);
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
    areas: areas.map((area) => {
      const { modules, ...areaData } = area;
      const node = layout.children.find((candidate) => candidate.id === area.id);
      return {
        ...areaData,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        modules: modules.map(({ files, ...module }) => {
          const moduleNode = node.children.find((candidate) => candidate.id === module.id);
          return {
            ...module,
            x: node.x + moduleNode.x,
            y: node.y + moduleNode.y,
            width: moduleNode.width,
            height: moduleNode.height,
          };
        }),
      };
    }),
    edges: dependencyData.edges,
    diagramEdges: dependencyData.diagramEdges,
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

    const allModules = buildModules(areaFiles, area, definition.workspacePrefix);
    const modules = allModules.length > 1 ? allModules : [];
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
      searchText: `${area.label ?? titleCase(area.id)} ${rootPath} ${area.description} ${modules.map((module) => module.searchText).join(" ")}`.toLowerCase(),
      modules,
    };
  });
}

function buildModules(files, area, workspacePrefix) {
  if (!area.moduleRoot) return [];
  const sourceExtensions = new Set([".cjs", ".css", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
  const groups = new Map();
  for (const file of files) {
    const relativePath = file.startsWith(`${area.moduleRoot}/`)
      ? file.slice(area.moduleRoot.length + 1)
      : null;
    if (relativePath === null || !sourceExtensions.has(path.posix.extname(file))) continue;
    const pathSegments = relativePath.split("/");
    const folder = pathSegments.length > 1 ? pathSegments[0] : "entry";
    const override = area.moduleGroups?.[folder];
    const key = override?.id ?? folder;
    const group = groups.get(key) ?? {
      id: `${area.id}--${key}`,
      key,
      label: override?.label ?? titleCase(key),
      folders: new Set(),
      files: [],
    };
    if (folder !== "entry") group.folders.add(folder);
    group.files.push(file);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => {
      const sourcePaths = group.folders.size > 0
        ? [...group.folders].sort(byName).map((folder) => `${area.moduleRoot}/${folder}`)
        : [area.moduleRoot];
      const fullPaths = sourcePaths.map((modulePath) => `${workspacePrefix}/${modulePath}`);
      return {
        id: group.id,
        areaId: area.id,
        key: group.key,
        label: group.label,
        paths: fullPaths.map((modulePath) => modulePath.startsWith("Documents/technical/")
          ? modulePath.slice("Documents/technical/".length)
          : modulePath),
        hrefs: fullPaths.map(toDirectoryHref),
        fileCount: group.files.length,
        files: group.files,
        searchText: `${group.label} ${fullPaths.join(" ")}`.toLowerCase(),
      };
    })
    .sort((left, right) => byName(left.label, right.label));
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

async function analyzeDependencies(definition, packageData, areas) {
  const cruiseResult = await cruise(definition.analysisRoots.map((root) => path.join(SOFTWARE_DIR, root)), {
    baseDir: SOFTWARE_DIR,
    doNotFollow: "node_modules",
    exclude: "(^|/)dist/",
    outputType: "json",
    tsPreCompilationDeps: true,
  });
  const graph = JSON.parse(cruiseResult.output);
  const packageNames = new Map(definition.areas.filter((area) => area.packageName).map((area) => [area.packageName, area]));
  const allowedImports = new Set(definition.allowedPackageImports.map(({ from, to }) => `${from}:${to}`));
  const allowedRelative = new Set(definition.allowedRelativeImports.map(({ from, to }) => `${from}:${to}`));
  const unexpectedDependencies = [];
  const boundaryBypasses = [];
  const edges = new Map();
  const nodeEdges = new Map();
  const modulesByArea = new Map(areas.map((area) => [area.id, area.modules]));

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
      const typeOnly = dependency.dependencyTypes?.includes("type-only")
        || (await readImportKinds(module.source)).get(dependency.module) === true;
      const reference = { file: module.source, specifier: dependency.module, typeOnly };
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
          addEdge(edges, fromArea.id, packageArea.id, reference);
          continue;
        }
        addEdge(edges, fromArea.id, packageArea.id, reference);
      } else {
        toArea = findArea(targetPath, definition.areas, definition.workspaceFiles);
      }

      if (!toArea) continue;
      addNodeEdge(
        nodeEdges,
        fromArea.id,
        findModuleForFile(modulesByArea.get(fromArea.id), module.source)?.id ?? fromArea.id,
        toArea.id,
        findModuleForFile(modulesByArea.get(toArea.id), targetPath)?.id ?? toArea.id,
        reference,
      );
      if (toArea.id === fromArea.id) continue;
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
        addEdge(edges, fromArea.id, toArea.id, reference);
      }
    }
  }

  const packageEdges = [...edges.values()]
    .map(({ references, typeReferences, assetReferences, ...edge }) => ({
      ...edge,
      count: references.size,
      typeCount: [...typeReferences].filter((key) => !references.has(key)).length,
      assetReferences: [...assetReferences].sort(byName),
    }))
    .sort((left, right) => byName(left.id, right.id));
  const importEdges = [...nodeEdges.values()]
    .map(({ references, typeReferences, ...edge }) => ({
      ...edge,
      count: references.size,
      typeCount: [...typeReferences].filter((key) => !references.has(key)).length,
      assetReferences: [],
    }));
  const coveredPackagePairs = new Set(importEdges.map((edge) => `${edge.fromArea}:${edge.toArea}`));
  // Package edges with no source import (published assets or declared-only) stay package-to-package.
  const packageOnlyEdges = packageEdges
    .filter((edge) => !coveredPackagePairs.has(`${edge.from}:${edge.to}`))
    .map((edge) => ({ ...edge, fromArea: edge.from, toArea: edge.to }));

  return {
    edges: packageEdges,
    diagramEdges: [...importEdges, ...packageOnlyEdges]
      .map(({ declared, ...edge }) => edge)
      .sort((left, right) => byName(left.id, right.id)),
    unexpectedDependencies: uniqueRecords(unexpectedDependencies),
    boundaryBypasses: uniqueRecords(boundaryBypasses),
  };
}

function findModuleForFile(modules, file) {
  return modules.find((module) => module.files.includes(file));
}

function addNodeEdge(edges, fromArea, from, toArea, to, reference) {
  if (from === to) return;
  const id = `${from}--${to}`;
  const edge = edges.get(id) ?? {
    id,
    from,
    to,
    fromArea,
    toArea,
    references: new Set(),
    typeReferences: new Set(),
  };
  edge[reference.typeOnly ? "typeReferences" : "references"].add(`${reference.file}\0${reference.specifier}`);
  edges.set(id, edge);
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

// Maps each static import/export specifier in a file to true when every statement using it is type-only.
// dependency-cruiser drops this distinction for workspace imports it cannot resolve.
async function readImportKinds(source) {
  if (importKindsCache.has(source)) return importKindsCache.get(source);
  const kinds = new Map();
  importKindsCache.set(source, kinds);
  if (!/\.[cm]?tsx?$/.test(source)) return kinds;
  const text = await readFile(path.join(SOFTWARE_DIR, source), "utf8");
  const file = ts.createSourceFile(source, text, ts.ScriptTarget.Latest, false);
  for (const statement of file.statements) {
    if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue;
    if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const specifier = statement.moduleSpecifier.text;
    const typeOnly = isTypeOnlyStatement(statement);
    kinds.set(specifier, (kinds.get(specifier) ?? true) && typeOnly);
  }
  return kinds;
}

function isTypeOnlyStatement(statement) {
  if (ts.isExportDeclaration(statement)) {
    if (statement.isTypeOnly) return true;
    const clause = statement.exportClause;
    return Boolean(clause && ts.isNamedExports(clause) && clause.elements.length > 0
      && clause.elements.every((element) => element.isTypeOnly));
  }
  const clause = statement.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  const bindings = clause.namedBindings;
  return Boolean(bindings && ts.isNamedImports(bindings) && bindings.elements.length > 0
    && bindings.elements.every((element) => element.isTypeOnly));
}

function addEdge(edges, from, to, reference, declared = false, assetReference = null) {
  if (from === to) return;
  const id = `${from}--${to}`;
  const edge = edges.get(id) ?? {
    id,
    from,
    to,
    references: new Set(),
    typeReferences: new Set(),
    assetReferences: new Set(),
    declared: false,
  };
  if (reference) {
    edge[reference.typeOnly ? "typeReferences" : "references"].add(`${reference.file}\0${reference.specifier}`);
  }
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
      "elk.direction": "DOWN",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "64",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: areas.map((area) => area.modules.length === 0
      ? { id: area.id, width: LEAF_AREA_WIDTH, height: LEAF_AREA_HEIGHT }
      : {
        id: area.id,
        layoutOptions: {
          "elk.padding": `[top=${AREA_HEADER_HEIGHT},left=16,bottom=16,right=16]`,
          "elk.nodeSize.constraints": "[MINIMUM_SIZE]",
          // ELK applies this vector transposed when the hierarchical layout runs top-down.
          "elk.nodeSize.minimum": `(${LEAF_AREA_HEIGHT}, ${LEAF_AREA_WIDTH})`,
          "elk.spacing.nodeNode": "18",
          "elk.layered.spacing.nodeNodeBetweenLayers": "40",
        },
        children: area.modules.map((module) => ({
          id: module.id,
          width: MODULE_WIDTH,
          height: MODULE_HEIGHT + MODULE_PATH_HEIGHT * (module.paths.length - 1),
        })),
      }),
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
