# AI Repo Organization Guidelines

This document defines how to organize technical documentation and software folders so agents and developers can work with low context use and high accuracy.

Use this file for organization rules that are broader than one package but more specific than general repository steering.

## Purpose

- Keep the path to relevant context short.
- Make ownership and intent visible near the code.
- Reduce repeated repo-wide searching before routine edits.
- Keep structural guidance in one canonical location instead of spreading it across many package docs.

## Prototype Expectations

This repository is currently a prototype.

While the repository remains in prototype phase:

- do not add or expand automated tests unless the prototype rule is explicitly changed
- avoid routine change-log style documentation for normal iteration
- update docs only when standing truth needs to stay accurate, such as structure, ownership, entrypoints, glossary terms, protected areas, or stable workflow rules

Prototype work should optimize for iteration speed without letting durable guidance drift out of date.

## Documentation Layers

Use the nearest layer that can state the rule without duplication.

The main split is this:

- `AGENTS.md` files tell agents how to behave in this repo.
- shared technical docs tell both humans and agents how the repo should be organized.
- local `📌README.md` files tell readers what a specific folder owns and where to start.

Humans may read `AGENTS.md`, but that does not make `AGENTS.md` the right home for normal repository standards.
Keep shared standards outside `AGENTS.md` unless the rule is primarily about agent workflow.

### Layer 1: Agent Behavior Rules

Store agent workflow rules in `AGENTS.md` files.

Examples:

- when agents may edit files
- when agents must update docs after code changes
- subtree-specific expectations for technical work
- how local repo expectations override common agent defaults

Use an `AGENTS.md` file when the rule changes agent behavior, constrains default agent habits, or defines how an agent should apply shared standards while working in the subtree.

Do not use an `AGENTS.md` file as the primary home for ordinary repository standards that should still be true even when no agent is involved.

### Layer 2: Shared Technical Standards

Store cross-cutting implementation and organization standards in shared docs under `Documents/technical`.

Examples:

- folder creation thresholds
- package layout standards
- tsconfig policy
- AI-oriented organization rules from this document

These are the main source of truth for repository standards that humans and agents both need.

Use a shared technical document when the rule should apply across multiple packages or documentation areas.

### Layer 3: Local Routing Docs

Store local ownership and navigation guidance in the nearest `📌README.md`.

Examples:

- what a folder owns
- which files are the main entrypoints
- where to make a specific class of change
- what is intentionally out of scope for the folder

Use a local routing doc when the information helps a reader decide whether to stay in the folder or leave it.

## What Good AI Navigation Looks Like

An agent should be able to answer these questions without broad exploration:

1. What is this folder for?
2. Which files are the primary entrypoints?
3. Which concepts are authoritative here?
4. What nearby docs should be updated if this area changes?
5. Is this area active, provisional, or just scaffolded?

If a folder does not answer those questions locally or through one obvious parent document, the documentation is too thin.

## Folder Organization Rules

### Prefer Stable Responsibility Boundaries

- Organize top-level software assets by responsibility, not by framework category.
- Prefer one clear responsibility per top-level folder.
- Avoid folders whose purpose is only structural grouping unless the grouping has clear operational value.

Good examples:

- a package for the engine
- a package for the website
- a package for generated video workflows

Less useful examples:

- `packages/`
- `apps/`
- `misc/`

### Keep Concept Count Low

- Avoid introducing a new folder, new doc type, and new naming rule at the same time unless all three are necessary.
- Prefer a small number of predictable locations over many special cases.
- Reuse the existing `AGENTS.md`, shared technical docs, and local `📌README.md` pattern instead of inventing new guidance surfaces.

### Create Deeper Local Docs Only When They Save Search Time

Add a new local `📌README.md` when a folder has one or more of these properties:

- it contains domain concepts rather than only implementation mechanics
- it is a common landing zone for edits
- it has its own ownership boundary
- multiple files inside the folder could plausibly be the place to start

Do not add a local doc just because a folder exists.

## Local README Standard

Every significant package or source subfolder should use the same local documentation pattern.

### Required Sections

Use these sections in the nearest `📌README.md` when the folder has meaningful ownership:

1. Purpose
2. Owns
3. Main entrypoints
4. Change here when
5. Do not change here for
6. Status
7. Related docs

### Section Guidance

#### Purpose

State what the folder is for in one or two sentences.

#### Owns

List the concepts, workflows, or artifacts that are authoritative in the folder.

#### Main entrypoints

Point to the files most likely to matter first.

#### Change here when

Give concrete edit-routing examples.

Examples:

- add a new engine entity
- change website publish flow
- update command center startup behavior

#### Do not change here for

Name the nearby concerns that belong somewhere else.

This prevents local edits from drifting across boundaries.

#### Status

Mark the area with one of these labels:

- `scaffold`: placeholder structure or minimal implementation
- `active`: current working implementation
- `authoritative`: source of truth for the named concept
- `legacy`: retained for compatibility or transition

If a folder mixes statuses, explain the split clearly.

#### Related docs

Link only the few documents a reader should plausibly open next.
If a child-folder link is already maintained by autonav, do not repeat the same target in nearby manual sections unless the duplicate adds clear routing value.

Valid reasons to keep a manual link alongside autonav include:

- the manual section adds context or description that the autonav link does not provide
- the manual section needs a deliberate display order that differs from autonav order
- the manual section is curating a short guided path rather than listing every child target equally

### Nested Folder Docs

When a child folder exists mainly to route readers deeper within an already documented package, keep the child `📌README.md` thinner than its parent.

For example, a `src` folder doc should usually act as a local routing note rather than restating package-level purpose, ownership, status, or policy that already belongs in the parent package README.

## Status Markers

Status markers are important because prototypes often mix thin scaffolds with real domain logic.

- Use `scaffold` when the folder exists mainly to establish layout or future intent.
- Use `active` when the folder contains the current implementation but may not be the final stable boundary.
- Use `authoritative` when the folder or file defines the canonical model, contract, or workflow.
- Use `legacy` when the folder remains in use but should not attract new design work.

Do not assume readers can infer maturity from file size or naming.

## Change Guard Standard

Use `CHANGE-GUARD` as the neutral marker for code or documentation that should only be changed intentionally and with explicit approval.

This marker applies to both humans and agents.

Use it sparingly for areas such as:

- core domain contracts
- intentional behavior boundaries
- fragile workflow pivots
- documentation that defines a protected policy boundary

Recommended form:

```ts
/**
 * CHANGE-GUARD
 * Explicit approval required before changing this area.
 * Reason: core domain contract.
 */
```

Guidance:

- place the marker directly on the guarded file, declaration, or code region
- include a short reason so reviewers know why the guard exists
- do not use the marker on routine implementation details
- if the guarded boundary moves, move or remove the marker intentionally rather than leaving stale guards behind

## Ownership And Update Rules

When code or docs change, update the narrowest document that owns the truth.

Use this rule of thumb:

- if the statement starts with "agents should", it likely belongs in `AGENTS.md`
- if the statement starts with "this repo should" or "this folder should", it likely belongs in a shared technical doc or local `📌README.md`
- if the statement is true for both humans and agents, prefer a shared technical doc and let `AGENTS.md` point to it when needed

### Update The Nearest Local README When

- a folder gains a new responsibility
- a folder loses responsibility to another area
- the best entrypoint files change
- a common edit path changes
- the folder status changes

### Update Shared Technical Docs When

- the rule should apply across multiple packages
- a new organization pattern becomes standard
- a naming or layout convention changes
- the repo adopts a new status marker or documentation expectation

### Update AGENTS Files When

- agent behavior should change
- a subtree needs different workflow rules
- documentation updates should become mandatory for a change type

## System Map Guidance

Keep a short system map near the software root.

The system map should list, for each top-level software asset:

- purpose
- primary entrypoints
- primary concepts
- current status
- closest related docs

Use a small table or short structured list. The goal is fast routing, not deep explanation.

## Glossary Guidance

If a package has domain language that is not obvious from file names alone, keep a short glossary near that package.

Use a glossary when:

- two or more domain terms are easy to confuse
- naming carries product meaning not visible in type signatures
- the same concept appears in docs, code, and content workflows

Keep glossary entries short and authoritative.

## Automation Boundary

The markdown maintenance scripts can help preserve documentation structure, but they do not decide semantic truth.

Automation is well-suited for:

- index doc creation
- navigation link maintenance
- broken-link repair when the target is clear
- maintenance reporting

Automation is not the source of truth for:

- architectural ownership
- status markers
- glossary accuracy
- entrypoint recommendations
- behavioral boundaries between folders

Document these manually in the shared docs and local `📌README.md` files.

## Documentation Update Checklist

Use this checklist after structural or semantic changes:

1. Update the nearest local `📌README.md` if ownership, entrypoints, scope, or status changed.
2. Update this document or another shared technical doc if the change establishes a reusable pattern.
3. Update the nearest applicable `AGENTS.md` if agents should behave differently after the change.
4. Run markdown maintenance in the maintained docs scope.
5. Fix any comment or doc text that points to missing or outdated local guidance.

## Review Standard

When reviewing repo organization for AI accuracy, check for these failure modes:

- comments that point to docs that do not exist
- packages with no clear status or entrypoints
- shared rules duplicated across many package docs
- local docs that describe intent too vaguely to route an edit
- new structural patterns introduced without shared documentation

If one of these appears, tighten the nearest owning document instead of adding more scattered notes.