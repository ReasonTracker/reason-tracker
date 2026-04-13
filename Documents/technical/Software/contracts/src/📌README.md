This folder contains shared contracts for the repo, plus a small number of helpers such as default constructors and `is...` type guards.

## File Header Note

Each code file in this folder should start with a short note that points readers to this README before they change the contract shape or conventions in that file.

Example:
- `See 📌README.md in this folder for local coding standards before editing this file.`

## Contract Naming

Name related contract shapes from the canonical entity type so they sort and scan together.

Examples:
- `Score`: the canonical full shape
- `ScoreCreate`: the creation or default-population shape
- `ScorePatch`: the partial update shape for an existing entity

Prefer suffixes that describe the role of the shape. Avoid names like `ProtoScore`, which describe neither the canonical contract nor the operation clearly.

Prefer object-shape names that read like nouns rather than commands. A contract type should sound like a kind of data, not like something the system is being told to do.

Prefer:
- `ScoreCreate`
- `ScorePatch`

Avoid when naming the object itself:
- `CreateScore`
- `UpdateScore`
- `PatchScore`

Verb-first names are better reserved for functions, commands, and actions.

## Standard Contract Pattern

When an entity supports both creation and partial updates, use separate shapes when their requirements differ.

- `Entity`: the complete canonical contract
- `EntityCreate`: fields accepted when creating a new entity
- `EntityPatch`: fields accepted when updating an existing entity, with `id` required

Example:

```ts
type ScoreCreate = Partial<Score> & Pick<Score, "claimId">
type ScorePatch = Pick<Score, "id"> & Partial<Omit<Score, "id">>
```

If some fields should not be changed after creation, exclude them from the patch type.

```ts
type ScorePatch = Pick<Score, "id"> & Partial<Omit<Score, "id" | "claimId">>
```

Keep the `Entity...` prefix consistent across related shapes unless there is a stronger domain-specific noun already established.