import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ELK from "elkjs/lib/elk.bundled.js";
import { cruise } from "dependency-cruiser";
import ts from "typescript";
import { normalizeDirectoryPath, selectPreferredIndex, toDirectoryHref, toFileOutputRelativePath } from "./markdown-index-rules.mts";
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
const FILE_LABEL_CHARACTER_WIDTH = 9;
const FILE_NODE_HORIZONTAL_PADDING = 32;
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
  const transparentEntries = await findTransparentEntries(softwareFiles, definition.areas);
  const areas = buildAreas(softwareFiles, definition, packageData, transparentEntries);
  const repositoryTree = buildRepositoryTree(repositoryFiles, definition.workspacePrefix);
  const dependencyData = await analyzeDependencies(definition, packageData, areas, transparentEntries);
  const exceptions = await validateExceptions(definition.approvedRuntimeExceptions);
  const excludedAreas = new Set(areas.filter((area) => area.diagramExclusion).map((area) => area.id));
  const diagramEdges = [];
  const excludedDiagramEdges = [];
  for (const { imports, ...edge } of dependencyData.diagramEdges) {
    if (excludedAreas.has(edge.fromArea) || excludedAreas.has(edge.toArea)) {
      excludedDiagramEdges.push({ ...edge, imports });
    } else {
      diagramEdges.push(edge);
    }
  }
  const connectedAreas = new Set(diagramEdges.flatMap((edge) => [edge.fromArea, edge.toArea]));
  const connectedNodes = new Set(diagramEdges.flatMap((edge) => [edge.from, edge.to]));
  const treeFiles = [...softwareFiles, OUTPUT_RELATIVE_PATH.slice(softwarePrefix.length)].sort(byName);
  const treeData = buildWorkspaceTree(treeFiles, definition, areas, connectedAreas);
  const fileEdges = buildTreeEdges(dependencyData.fileEdges, treeData, connectedAreas, excludedAreas);
  const diagramAreas = areas
    .filter((area) => connectedAreas.has(area.id))
    .map((area) => ({
      ...area,
      modules: area.modules.filter((module) => connectedNodes.has(module.id)),
    }));
  const layout = await layoutAreas(diagramAreas, diagramEdges);
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
    workspaceTree: treeData.root,
    layout: {
      width: layout.width,
      height: layout.height,
    },
    areas: areas.map((area) => {
      const { modules, ...areaData } = area;
      const node = layout.children.find((candidate) => candidate.id === area.id);
      return {
        ...areaData,
        inDiagram: Boolean(node),
        ...(node ? { x: node.x, y: node.y, width: node.width, height: node.height } : {}),
        modules: modules.map(({ files, ...module }) => {
          const moduleNode = node?.children?.find((candidate) => candidate.id === module.id);
          return {
            ...module,
            inDiagram: Boolean(moduleNode),
            ...(moduleNode ? {
              x: node.x + moduleNode.x,
              y: node.y + moduleNode.y,
              width: moduleNode.width,
              height: moduleNode.height,
            } : {}),
          };
        }),
      };
    }),
    edges: dependencyData.edges,
    diagramEdges,
    fileEdges,
    excludedDiagramEdges,
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

function buildWorkspaceTree(files, definition, areas, connectedAreas) {
  const workspacePrefix = definition.workspacePrefix;
  const root = {
    id: "workspace",
    kind: "workspace",
    name: "Software workspace",
    path: ".",
    href: toDirectoryHref(workspacePrefix),
    children: [],
  };
  const nodesByPath = new Map();
  const groups = [];
  const siblingFiles = new Map();
  for (const file of files) {
    const directory = path.posix.dirname(file);
    if (!siblingFiles.has(directory)) siblingFiles.set(directory, new Set());
    siblingFiles.get(directory).add(path.posix.basename(file));
  }

  function ensureDirectory(areaNode, directory) {
    if (directory === areaNode.path) return areaNode;
    const relative = areaNode.path === "." ? directory : directory.slice(areaNode.path.length + 1);
    let parent = areaNode;
    let currentPath = areaNode.path === "." ? "" : areaNode.path;
    for (const segment of relative.split("/").filter(Boolean)) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      let child = nodesByPath.get(currentPath);
      if (!child) {
        child = {
          id: `path:${currentPath}`,
          kind: "directory",
          name: segment,
          path: currentPath,
          areaId: areaNode.areaId,
          href: toDirectoryHref(`${workspacePrefix}/${currentPath}`),
          children: [],
        };
        nodesByPath.set(currentPath, child);
        parent.children.push(child);
      }
      parent = child;
    }
    return parent;
  }

  for (const area of areas.filter((candidate) => connectedAreas.has(candidate.id))) {
    const areaNode = {
      id: `area:${area.id}`,
      kind: "area",
      name: area.label,
      path: area.root,
      areaId: area.id,
      href: area.href,
      children: [],
    };
    nodesByPath.set(area.root, areaNode);
    root.children.push(areaNode);
    const configured = definition.areas.find((candidate) => candidate.id === area.id);
    const grouped = new Map();
    for (const [folder, override] of Object.entries(configured.moduleGroups ?? {})) {
      const folderPath = `${configured.moduleRoot}/${folder}`;
      if (!files.some((file) => file.startsWith(`${folderPath}/`))) continue;
      const group = grouped.get(override.id) ?? {
        id: `group:${area.id}:${override.id}`,
        kind: "group",
        name: override.label,
        areaId: area.id,
        paths: [],
        hrefs: [],
        fileCount: 0,
      };
      if (group.name !== override.label) throw new Error(`Conflicting labels for module group ${override.id}.`);
      group.paths.push(folderPath);
      group.hrefs.push(toDirectoryHref(`${workspacePrefix}/${folderPath}`));
      grouped.set(override.id, group);
    }
    groups.push(...grouped.values());

    for (const file of files.filter((candidate) => findArea(candidate, [configured], definition.workspaceFiles))) {
      const group = [...grouped.values()].find((candidate) =>
        candidate.paths.some((groupPath) => file.startsWith(`${groupPath}/`)),
      );
      if (group) {
        group.fileCount += 1;
        const parent = ensureDirectory(areaNode, path.posix.dirname(group.paths[0]));
        if (!parent.children.includes(group)) parent.children.push(group);
        continue;
      }
      const directory = path.posix.dirname(file);
      const parent = ensureDirectory(areaNode, directory);
      const names = siblingFiles.get(directory);
      const selection = selectPreferredIndex([...names], (name) => name);
      if (selection.conflict) {
        throw new Error(`Ambiguous index files in ${directory}: ${selection.conflict.names.join(", ")}.`);
      }
      const fullPath = `${workspacePrefix}/${file}`;
      const outputPath = selection.selected === path.posix.basename(file)
        ? null
        : toFileOutputRelativePath(normalizeDirectoryPath(`${workspacePrefix}/${directory}`), fullPath, names);
      const node = {
        id: `path:${file}`,
        kind: "file",
        name: path.posix.basename(file),
        path: file,
        areaId: area.id,
        href: outputPath ? `/${outputPath.slice(0, -"index.html".length)}` : toDirectoryHref(`${workspacePrefix}/${directory}`),
        fileCount: 1,
      };
      nodesByPath.set(file, node);
      parent.children.push(node);
    }
  }

  function sortAndCount(node) {
    if (!node.children) return node.fileCount;
    node.children.sort((left, right) => {
      const kindDifference = Number(left.kind === "file") - Number(right.kind === "file");
      return kindDifference || byName(left.name.toLowerCase(), right.name.toLowerCase()) || byName(left.name, right.name);
    });
    node.fileCount = node.children.reduce((count, child) => count + sortAndCount(child), 0);
    return node.fileCount;
  }
  sortAndCount(root);
  return { root, nodesByPath, groups };
}

function buildTreeEdges(edges, treeData, connectedAreas, excludedAreas) {
  function resolveNode(file, areaId) {
    const group = treeData.groups.find((candidate) =>
      candidate.areaId === areaId && candidate.paths.some((groupPath) => file.startsWith(`${groupPath}/`)),
    );
    if (group) return group.id;
    const node = treeData.nodesByPath.get(file);
    if (!node || node.areaId !== areaId) throw new Error(`Architecture tree has no node for ${areaId}: ${file}.`);
    return node.id;
  }

  return edges
    .filter((edge) => connectedAreas.has(edge.fromArea) && connectedAreas.has(edge.toArea)
      && !excludedAreas.has(edge.fromArea) && !excludedAreas.has(edge.toArea))
    .map((edge) => ({
      ...edge,
      from: resolveNode(edge.from, edge.fromArea),
      to: resolveNode(edge.to, edge.toArea),
    }));
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

async function findTransparentEntries(files, areas) {
  const entries = new Set();
  for (const file of files) {
    if (!/^index\.[cm]?[jt]sx?$/.test(path.posix.basename(file))) continue;
    if (!areas.some((area) => area.moduleRoot && path.posix.dirname(file) === area.moduleRoot)) continue;
    const text = await readFile(path.join(SOFTWARE_DIR, file), "utf8");
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
    if (source.statements.length > 0 && source.statements.every((statement) =>
      ts.isExportDeclaration(statement) && statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
    )) entries.add(file);
  }
  return entries;
}

function buildAreas(files, definition, packageData, transparentEntries) {
  return definition.areas.map((area) => {
    if (area.diagramExclusion !== undefined
      && (!area.diagramExclusion || typeof area.diagramExclusion !== "object"
        || typeof area.diagramExclusion.reason !== "string" || !area.diagramExclusion.reason.trim())) {
      throw new Error(`Area ${area.id} must provide a reason for its diagram exclusion.`);
    }
    const areaFiles = files.filter((file) => findArea(file, [area], definition.workspaceFiles));
    const rootPath = area.rootFiles === true
      ? definition.workspacePrefix
      : `${definition.workspacePrefix}/${area.root}`;
    const modules = buildModules(areaFiles, area, definition.workspacePrefix, transparentEntries);
    return {
      id: area.id,
      label: area.label ?? titleCase(area.id),
      root: area.root ?? ".",
      path: path.posix.relative(definition.workspacePrefix, rootPath) || ".",
      href: toDirectoryHref(rootPath),
      description: area.description,
      fileCount: areaFiles.length,
      packageName: area.packageName ?? null,
      exports: packageData.get(area.id)?.exports ?? null,
      ...(area.diagramExclusion ? { diagramExclusion: area.diagramExclusion } : {}),
      searchText: `${area.label ?? titleCase(area.id)} ${rootPath} ${area.description}`.toLowerCase(),
      modules,
    };
  });
}

function buildModules(files, area, workspacePrefix, transparentEntries) {
  if (!area.moduleRoot) return [];
  const sourceExtensions = new Set([".cjs", ".css", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
  const groups = new Map();
  const fileModules = [];
  const rootFiles = new Set(files
    .filter((file) => path.posix.dirname(file) === area.moduleRoot)
    .map((file) => path.posix.basename(file)));
  for (const file of files) {
    const relativePath = file.startsWith(`${area.moduleRoot}/`)
      ? file.slice(area.moduleRoot.length + 1)
      : null;
    if (relativePath === null || !sourceExtensions.has(path.posix.extname(file))) continue;
    const pathSegments = relativePath.split("/");
    if (pathSegments.length === 1) {
      if (transparentEntries.has(file)) continue;
      const fullPath = `${workspacePrefix}/${file}`;
      const outputPath = toFileOutputRelativePath(
        normalizeDirectoryPath(`${workspacePrefix}/${area.moduleRoot}`),
        fullPath,
        rootFiles,
      );
      fileModules.push({
        id: `${area.id}--file--${encodeURIComponent(relativePath)}`,
        areaId: area.id,
        key: `file:${relativePath}`,
        kind: "file",
        label: relativePath,
        paths: [path.posix.relative(workspacePrefix, fullPath)],
        hrefs: [`/${outputPath.slice(0, -"index.html".length)}`],
        fileCount: 1,
        files: [file],
        searchText: `${relativePath} ${fullPath}`.toLowerCase(),
      });
      continue;
    }
    const folder = pathSegments[0];
    const override = area.moduleGroups?.[folder];
    const key = override?.id ?? folder;
    const group = groups.get(key) ?? {
      id: `${area.id}--${key}`,
      key,
      label: override?.label ?? titleCase(key),
      folders: new Set(),
      files: [],
    };
    group.folders.add(folder);
    group.files.push(file);
    groups.set(key, group);
  }

  const folderModules = [...groups.values()]
    .map((group) => {
      const sourcePaths = [...group.folders].sort(byName).map((folder) => `${area.moduleRoot}/${folder}`);
      const fullPaths = sourcePaths.map((modulePath) => `${workspacePrefix}/${modulePath}`);
      return {
        id: group.id,
        areaId: area.id,
        key: group.key,
        kind: "folder",
        label: group.label,
        paths: fullPaths.map((modulePath) => path.posix.relative(workspacePrefix, modulePath)),
        hrefs: fullPaths.map(toDirectoryHref),
        fileCount: group.files.length,
        files: group.files,
        searchText: `${group.label} ${fullPaths.join(" ")}`.toLowerCase(),
      };
    });
  return [...folderModules, ...fileModules].sort((left, right) => byName(left.label, right.label));
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

async function analyzeDependencies(definition, packageData, areas, transparentEntries) {
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
  const fileNodeEdges = new Map();
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
    const targetPath = resolveExportPath(
      packageData.get(target.id)?.exports,
      asset.packageName,
      asset.specifier,
      target.root,
    );
    if (targetPath) {
      addNodeAssetEdge(
        nodeEdges,
        asset.from,
        findModuleForFile(modulesByArea.get(asset.from), asset.from)?.id ?? asset.from,
        target.id,
        findModuleForFile(modulesByArea.get(target.id), targetPath)?.id ?? target.id,
        asset.specifier,
      );
      const sourceArea = areas.find((area) => area.id === asset.from);
      if (!sourceArea) throw new Error(`Published asset ${asset.specifier} has no source architecture area.`);
      addNodeAssetEdge(fileNodeEdges, asset.from, sourceArea.root, target.id, targetPath, asset.specifier);
    }
  }

  for (const module of graph.modules) {
    const fromArea = findArea(module.source, definition.areas, definition.workspaceFiles);
    if (!fromArea) continue;
    const transparentSource = transparentEntries.has(module.source);
    const fromModule = findModuleForFile(modulesByArea.get(fromArea.id), module.source);
    const fromNode = fromModule?.id ?? fromArea.id;

    for (const dependency of module.dependencies ?? []) {
      const typeOnly = dependency.dependencyTypes?.includes("type-only")
        || (await readImportKinds(module.source)).get(dependency.module) === true;
      const reference = { file: module.source, specifier: dependency.module, typeOnly };
      const packageImport = [...packageNames.entries()].find(([name]) =>
        dependency.module === name || dependency.module.startsWith(`${name}/`),
      );
      let targetPath = dependency.resolved?.replaceAll("\\", "/") ?? "";
      let toArea = findArea(targetPath, definition.areas, definition.workspaceFiles);
      let targetPaths = [targetPath];
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
        targetPaths = transparentEntries.has(targetPath)
          ? await resolvePackageImportTargets(targetPath, module.source, dependency.module)
          : [targetPath];
        if (!allowedImports.has(`${fromArea.id}:${packageArea.id}`)) {
          unexpectedDependencies.push({ from: module.source, to: targetPath, kind: "package import" });
          addEdge(edges, fromArea.id, packageArea.id, reference);
          continue;
        }
        addEdge(edges, fromArea.id, packageArea.id, reference);
      } else {
        toArea = findArea(targetPath, definition.areas, definition.workspaceFiles);
        if (transparentEntries.has(targetPath)) {
          targetPaths = await resolvePackageImportTargets(targetPath, module.source, dependency.module);
        }
      }

      for (const resolvedTargetPath of targetPaths) {
        toArea = findArea(resolvedTargetPath, definition.areas, definition.workspaceFiles);
        if (!toArea) continue;
        if (!transparentSource) {
          addNodeEdge(
            nodeEdges,
            fromArea.id,
            fromNode,
            toArea.id,
            findModuleForFile(modulesByArea.get(toArea.id), resolvedTargetPath)?.id ?? toArea.id,
            reference,
          );
          addNodeEdge(fileNodeEdges, fromArea.id, module.source, toArea.id, resolvedTargetPath, reference);
        }
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
  }

  const packageEdges = [...edges.values()]
    .map(summarizeEdge)
    .sort((left, right) => byName(left.id, right.id));
  const importEdges = [...finalizeModules(areas, nodeEdges).values()].map(summarizeEdge);
  const coveredPackagePairs = new Set(importEdges.map((edge) => `${edge.fromArea}:${edge.toArea}`));
  // Package edges with no source import (published assets or declared-only) stay package-to-package.
  const packageOnlyEdges = packageEdges
    .filter((edge) => !coveredPackagePairs.has(`${edge.from}:${edge.to}`))
    .map((edge) => ({ ...edge, fromArea: edge.from, toArea: edge.to }));
  const fileImportEdges = [...fileNodeEdges.values()].map(summarizeEdge);
  const filePackagePairs = new Set(fileImportEdges.map((edge) => `${edge.fromArea}:${edge.toArea}`));
  const filePackageOnlyEdges = packageEdges
    .filter((edge) => !filePackagePairs.has(`${edge.from}:${edge.to}`))
    .map((edge) => ({
      ...edge,
      fromArea: edge.from,
      toArea: edge.to,
      from: areas.find((area) => area.id === edge.from).root,
      to: areas.find((area) => area.id === edge.to).root,
    }));

  return {
    edges: packageEdges.map(({ imports, ...edge }) => edge),
    diagramEdges: [...importEdges, ...packageOnlyEdges]
      .map(({ declared, ...edge }) => edge)
      .sort((left, right) => byName(left.id, right.id)),
    fileEdges: [...fileImportEdges, ...filePackageOnlyEdges]
      .map(({ declared: _declared, ...edge }) => edge)
      .sort((left, right) => byName(left.id, right.id)),
    unexpectedDependencies: uniqueRecords(unexpectedDependencies),
    boundaryBypasses: uniqueRecords(boundaryBypasses),
  };
}

function summarizeEdge({ references, typeReferences, assetReferences, ...edge }) {
  const types = [...typeReferences].filter((key) => !references.has(key));
  const imports = [
    ...[...references].map((key) => ({ key, typeOnly: false })),
    ...types.map((key) => ({ key, typeOnly: true })),
  ]
    .sort((left, right) => byName(left.key, right.key))
    .map(({ key, typeOnly }) => {
      const [file, specifier] = key.split("\0");
      return { file, specifier, typeOnly };
    });
  return {
    ...edge,
    count: references.size,
    typeCount: types.length,
    assetReferences: [...assetReferences].sort(byName),
    imports,
  };
}

function findModuleForFile(modules, file) {
  return modules.find((module) => module.files.includes(file));
}

function finalizeModules(areas, nodeEdges) {
  const connected = new Set([...nodeEdges.values()].flatMap((edge) => [edge.from, edge.to]));
  const collapsed = new Map();
  for (const area of areas) {
    area.modules = area.modules.filter((module) => module.kind !== "file" || connected.has(module.id));
    if (area.modules.length === 1 && area.modules[0].kind === "folder") {
      collapsed.set(area.modules[0].id, area.id);
      area.modules = [];
    }
    area.searchText = `${area.searchText} ${area.modules.map((module) => module.searchText).join(" ")}`.toLowerCase();
  }

  const result = new Map();
  for (const edge of nodeEdges.values()) {
    const from = collapsed.get(edge.from) ?? edge.from;
    const to = collapsed.get(edge.to) ?? edge.to;
    if (from === to) continue;
    const id = `${from}--${to}`;
    const merged = result.get(id) ?? {
      id,
      from,
      to,
      fromArea: edge.fromArea,
      toArea: edge.toArea,
      references: new Set(),
      typeReferences: new Set(),
      assetReferences: new Set(),
    };
    for (const field of ["references", "typeReferences", "assetReferences"]) {
      for (const reference of edge[field]) merged[field].add(reference);
    }
    result.set(id, merged);
  }
  return result;
}

async function resolvePackageImportTargets(entryPath, importerPath, specifier) {
  const importedNames = await readImportedNames(importerPath, specifier);
  if (importedNames === null) return readReexportTargets(entryPath, null);
  if (importedNames.size === 0) return [entryPath];
  return readReexportTargets(entryPath, importedNames);
}

async function readImportedNames(source, specifier) {
  const text = await readFile(path.join(SOFTWARE_DIR, source), "utf8");
  const file = ts.createSourceFile(source, text, ts.ScriptTarget.Latest, false);
  const names = new Set();
  for (const statement of file.statements) {
    if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
      || !statement.moduleSpecifier
      || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== specifier) continue;
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause || ts.isNamespaceExport(statement.exportClause)) return null;
      for (const element of statement.exportClause.elements) {
        names.add(element.propertyName?.text ?? element.name.text);
      }
      continue;
    }
    const clause = statement.importClause;
    if (!clause) continue;
    if (clause.name) names.add("default");
    if (!clause.namedBindings) continue;
    if (ts.isNamespaceImport(clause.namedBindings)) return null;
    for (const element of clause.namedBindings.elements) {
      names.add(element.propertyName?.text ?? element.name.text);
    }
  }
  return names;
}

async function readReexportTargets(entryPath, importedNames) {
  const text = await readFile(path.join(SOFTWARE_DIR, entryPath), "utf8");
  const file = ts.createSourceFile(entryPath, text, ts.ScriptTarget.Latest, false);
  const targets = new Set();
  for (const statement of file.statements) {
    if (!ts.isExportDeclaration(statement)
      || !statement.moduleSpecifier
      || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const exportClause = statement.exportClause;
    const isUsedExport = !exportClause
      || (ts.isNamedExports(exportClause)
        && (importedNames === null
          || exportClause.elements.some((element) => importedNames.has(element.name.text))))
      || (exportClause && ts.isNamespaceExport(exportClause)
        && (importedNames === null || importedNames.has(exportClause.name.text)));
    if (!isUsedExport) continue;
    const resolved = ts.resolveModuleName(
      statement.moduleSpecifier.text,
      path.join(SOFTWARE_DIR, entryPath),
      {},
      ts.sys,
    ).resolvedModule?.resolvedFileName;
    if (resolved) targets.add(path.relative(SOFTWARE_DIR, resolved).replaceAll("\\", "/"));
  }
  return targets.size > 0 ? [...targets] : [entryPath];
}

function addNodeEdge(edges, fromArea, from, toArea, to, reference) {
  if (from === to) return;
  const id = `${from}--${to}`;
  const key = JSON.stringify([from, to]);
  const edge = edges.get(key) ?? {
    id,
    from,
    to,
    fromArea,
    toArea,
    references: new Set(),
    typeReferences: new Set(),
    assetReferences: new Set(),
  };
  edge[reference.typeOnly ? "typeReferences" : "references"].add(`${reference.file}\0${reference.specifier}`);
  edges.set(key, edge);
}

function addNodeAssetEdge(edges, fromArea, from, toArea, to, assetReference) {
  if (from === to) return;
  const id = `${from}--${to}`;
  const key = JSON.stringify([from, to]);
  const edge = edges.get(key) ?? {
    id,
    from,
    to,
    fromArea,
    toArea,
    references: new Set(),
    typeReferences: new Set(),
    assetReferences: new Set(),
  };
  edge.assetReferences.add(assetReference);
  edges.set(key, edge);
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
          width: module.kind === "file"
            ? Math.max(MODULE_WIDTH, FILE_NODE_HORIZONTAL_PADDING + module.label.length * FILE_LABEL_CHARACTER_WIDTH)
            : MODULE_WIDTH,
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
