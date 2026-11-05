# Synthetic Graph

The app's **Synthetic Graph** examples are generated deterministically by `scripts/generate-synthetic-graph.mjs`. The dataset is wholly fabricated and contains 162 nodes (144 people, 12 research units, and 6 projects) and 745 event records. It is intended for exercising the app's configurable graph analyses, not for making claims about a real population.

The graph includes five typed relations, node roles/groups/attributes/removal costs, signed social ties, positive edge weights, event intervals, edge-removal costs, confidence values, per-record identity, and synthetic provenance references. Parallel records are retained to exercise multigraph behavior. This gives the sample the optional graph fields used by the app without requiring any of them from user-supplied data.

Two catalog entries use the same records and differ only in the declared graph direction:

- **Synthetic Graph** treats the relations as undirected and demonstrates contextual clique, signed triads, k-plex/k-core, weighted communities, motifs, and integrity checks.
- **Synthetic Graph · orientato** keeps each record's source-to-target direction and demonstrates directed paths, components, and temporal motifs. The contextual clique and signed-triad analyses that require undirected adjacency are not enabled on this profile.

The shared data has two deliberate integrity issues so the report and repair workflow have something concrete to find: `person-001.qualityStatus` is `unverified`, and `synthetic-membership-mismatch` is typed `member-of` although its target is a project. The configured suggestions are explicit candidate repairs; the application does not apply them to the source data automatically.

Regenerate all three JSON files with:

```sh
node scripts/generate-synthetic-graph.mjs
```

The generator keeps stable IDs and fails visibly if the generated record counts or intended anomaly count change.
