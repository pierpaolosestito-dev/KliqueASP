# 🧠 KliqueASP

> **Interactive Knowledge Graph exploration meets Answer Set Programming.**

KliqueASP is a browser-based framework for exploring heterogeneous graph datasets through an interactive 3D interface and client-side **Answer Set Programming (ASP)** reasoning.

It lets users load a JSON graph, declare optional mappings for its structure and metadata, filter the visible projection, run graph-analysis tasks in the browser, and inspect witnesses in the visualization. The original maximum-clique analysis of the Psychology History Graph remains the case-study baseline; the framework also supports k-plex, k-core, paths, components, typed motifs, signed triad balance, constrained modularity communities, integrity checks, and selected counterfactual tasks.

🌐 **Live demo**  
https://pierpaolosestito-dev.github.io/KliqueASP/PsychologyHistoryGraph/

---

## ✨ What is KliqueASP?

KliqueASP is designed to bridge two worlds:

- 🕸️ **interactive Knowledge Graph exploration**
- 🧩 **declarative reasoning with Answer Set Programming**

Instead of treating reasoning as an offline step, KliqueASP embeds ASP directly into the visual analytics loop.

```text
Explore → Filter → Project → Reason → Highlight → Inspect
```

The user interacts with the graph, selects temporal or semantic contexts, and the current visible projection becomes the input of the ASP solver.

The result is then mapped back into the 3D environment, making reasoning results immediately inspectable.

---

## 🚀 Main Features

### 🕸️ Interactive 3D Graph Exploration

KliqueASP provides a force-directed 3D visualization for heterogeneous graph data.

It supports:

- node selection;
- camera focus;
- neighbor inspection;
- visual highlighting;
- search with autocomplete;
- breadcrumb-style navigation history;
- configurable node colors, labels, icons, rings, and opacity.

---

### ⏳ Timeline-Aware Projection

Temporal metadata can be mapped from node fields using `nodeTypes.<type>.timeline` or from schema v2 edge records using `graphMapping.edge.validity.fromField` and `toField`.

With `features.timeline: true`, the slider is available when a loaded node type declares both timeline fields or when every schema v2 edge has a valid mapped interval. For edge intervals, the slider bounds are derived from the mapped data unless explicitly configured. An edge remains in the selected projection exactly when its closed validity interval overlaps the selected window; the same time-filtered edge set feeds the 3D view and ASP tasks. The existing **graph-aware timeline mode** for mapped temporal nodes remains available and can bring connected contextual nodes into the projection.

Incomplete or invalid edge intervals do not activate edge-time filtering. The application does not infer temporal fields from familiar node-type names or supply case-study dates to a different graph.

This is useful for datasets where entities such as people, institutions, places, events, or organizations are connected across time.

---

### 🧭 Dynamic Semantic Filters

KliqueASP can extract semantic groups from nested JSON metadata and automatically expose them as filters.

For example, if a node contains roles, affiliations, disciplines, or groups, these values can be extracted through configuration and used to restrict the reasoning task. Schema v2 can map groups with `graphMapping.node.groupFields`; legacy `nodeTypes.<type>.group` mappings are also supported when declared by the graph configuration.

Schema v2 mapping aliases, typed-motif role names, declared node-type names, and source record IDs are treated as literal JSON property names. Keys with special behavior in JavaScript objects, such as `__proto__`, remain ordinary properties through configuration merging and style normalization, semantic lookup, ASP fact generation, witness parsing, provenance lookup, and CSV exports. Node-type lookups use only declarations owned by the graph configuration, so inherited object properties do not create graph semantics.

---

### 🧠 Client-Side ASP Reasoning

The current graph projection is translated into ASP facts and solved directly in the browser through `clingo-wasm` running inside a Web Worker.

No dedicated backend is required.

This makes the reasoning workflow portable, inspectable, and reproducible from the client side.

The application batches compatible ground atoms and derives redundant edge relations from one per-record endpoint relation. It preserves the same query-visible predicates, edge identities, types, and mapped intervals while reducing the ASP source size. The shipped WASM runner was observed to fail on inputs at the 1 MiB boundary, so the app checks the UTF-8 size first and returns a clear error above a conservative 1,000,000-byte limit. Graph projections and filters can reduce the input before analysis.

After a completed solve, the panels report the clingo Worker's current and peak WebAssembly linear-memory buffer size since that Worker started. This measures WASM linear memory only; it excludes the Worker JavaScript heap, graph data, DOM, and total browser-process memory.

ASP timing diagnostics are opt-in with `solver.diagnostics.aspTiming: true`. They report clingo's `Time.Total` and `Time.Solve` for the latest single Worker invocation. Their difference is labeled **pre-solving** because it combines program parsing, grounding, and setup; it is not an isolated grounding timer. Composite app analyses may issue several clingo invocations, so this diagnostic describes only the latest invocation, while each result panel's existing elapsed time remains the end-to-end task duration. The option defaults to `false` and does not change the program, solver options, or answer sets.

Detailed ASP statistics are separately opt-in with `solver.diagnostics.aspStats: true`. KliqueASP requests clingo's `--stats=2` only when this flag is enabled, then shows ground-LP atoms and rules (original and simplified), solver variables, choices, and conflicts for the latest invocation. These counters are not aggregated across multi-query analyses. The flag defaults to `false`; the statistics option does not change the answer sets.

---

### 🔎 Clique Analysis

Maximum clique detection is the preserved case-study task and a representative combinatorial reasoning task. It shares the current graph projection and visualization with the additional structural ASP tasks described below.

The solver panel reports:

- number of exported cliques;
- maximum clique size;
- clique size distribution;
- execution time;
- number of visible nodes and links;
- current temporal interval;
- maximum cliques and additional clique structures.

Detected cliques can be highlighted directly in the 3D graph.

The set of cliques returned by the solver is controlled by `solver.cliqueMode` in the configuration:

| `cliqueMode` | Returned cliques | clingo options |
|---|---|---|
| `"maximal"` (default) | every maximal (non-extendable) clique | — |
| `"all"` | every clique, including sub-cliques of larger ones | `--opt-mode=enum` |
| `"maximum"` | only cliques of maximum cardinality | `--opt-mode=optN` |

Only cliques with more than two nodes are reported. The CSV files in `static/assets/PsychologyHistoryGraph/results/` were produced with the `"all"` semantics.

On the Psychology History Graph, the current default `"maximal"` profile returns 308 cliques: 255 of size 3, 52 of size 4, and 1 of size 5. Re-running `"all"` through the shipped clingo-WASM worker reproduces the case-study counts: 505 on the full graph, 192 on the person-only projection, 146 for the full Medicina group, and 45 for people in Medicina. These counts use different enumeration semantics and should not be compared as if they were the same query. The 335-node Psychology view starts with node labels hidden to reduce collisions; `Mostra etichette` shows them on demand without changing the graph data or ASP results.

The optional `solver.explainCliqueSupports` setting enables positive explanations directly in the ASP answer:

```json
{
  "solver": {
    "explainCliqueSupports": true
  }
}
```

When enabled, selecting a clique shows, for each unordered pair of its nodes, the edge record(s) that witness adjacency, and the 3D view highlights those records. A separate **Download clique witnesses CSV** export records the supported pairs, mapped source edge IDs, and any local record keys generated for records without source IDs; the existing clique CSV stays unchanged. In multigraphs all parallel records are shown, so the explanation includes every mapped record supporting each pair rather than choosing one arbitrarily. Legacy graphs show the supporting node pairs without fabricating edge IDs. The setting is off by default so the existing solver output and cost remain unchanged. This explains why the returned node set is a clique in the input projection; it does not explain why an edge exists or establish a social or historical interpretation.

When the selected node is absent from every maximum clique in the current result, **ASP why-not diagnosis** runs a separate maximum-clique query with that node forced into the solution, under the same visible projection and group used by the original query. It accepts a certificate only after clingo reports `OPTIMUM FOUND` and an independent checker confirms that the witness is a clique containing the target and that every pair has an observed supporting edge record. A smaller constrained optimum reports the size gap from the global maximum; a tie is shown as a counterexample to the earlier absence result. The witness can be highlighted and exported as `maximum_clique_membership_diagnosis.csv`. This is a structural explanation of the selected graph projection, not a historical or social cause.

The membership status uses the mathematical optimum, including singleton or two-node maxima. The historical result list still hides cliques smaller than three nodes; when the optimum falls below that display threshold, the panel states its size and can still diagnose a selected node.

### 🧩 Structural graph analysis

The structural analysis action supports connected components, weakly and strongly connected components for mapped directed graphs, k-plex, k-core, bounded shortest paths, minimum dominating sets, minimum node/edge separators, and modularity communities on the current visible graph projection.

- **Connected components** partitions the undirected induced graph into disjoint sets under ordinary reachability. It does not optimize or rank components; the group filter computes components of the induced subgraph on that group.
- **Weakly connected components** partitions a directed induced graph after ignoring arc direction. The ASP encoding derives a symmetric adjacency relation from the mapped directed edges and computes its transitive closure. Group restrictions apply to both endpoints and intermediate nodes. This differs from strong connectivity, which preserves direction in every reachability step.
- **Strongly connected components** partitions a directed induced graph by mutual reachability: every node in a component can reach every other by following the declared arc direction. It is available only when schema v2 maps the graph as directed. The ASP encoding computes transitive reachability and assigns each node to the smallest indexed node mutually reachable with it; this root is only a canonical component label, not a domain ranking. The group filter restricts both the nodes and the paths used to establish reachability. This task is validated on synthetic directed graphs; the current psychology case study does not supply a directed social relation suitable for interpreting SCCs.

Run `npm run benchmark:strong-components` to check directed chains and cycles with 34, 100, and 250 nodes against an independent Kosaraju implementation. Pass `-- --stress` to include 500-node profiles. The benchmark reports elapsed/solver time, ground atom count, and peak/current WASM linear memory; these synthetic sparse profiles are a scaling check, not a general performance guarantee.
- **Bounded shortest path** returns one simple path with the fewest edges between chosen endpoints, subject to a maximum length of 100 edges. It follows the graph's declared direction and can restrict path nodes to a configured group. Each step now carries the ID of every visible edge record supporting that adjacency, including parallel records; for legacy graphs without edge IDs it reports the endpoint pair. The 3D view highlights the route records and a separate CSV exports the step witnesses. An opt-in certificate derives the nodes reachable within each bound below the returned path length, proving that no shorter route exists in the selected projection; it can be exported separately and is disabled by default. If no path meets the bound, the same option runs a separate ASP query that returns the bounded reachable sets as a why-not certificate; the original no-route result remains unchanged. Both certificates may add solver time and memory, especially with high path limits. Ties are not all enumerated. Reachability is a topological witness and does not establish influence or causality.
- The bounded shortest-path encoding derives ASP reachability layers up to the requested limit, takes the goal's first reachable layer as the path length and constructs a witness along increasing shortest-distance layers. This establishes minimality without optimizing over arbitrary node sequences; a successful path query therefore returns `SATISFIABLE` after computing the shortest distance.
- **Typed path sequence** finds one simple path between chosen endpoints whose edge types match an exact ordered sequence selected in the panel. It requires schema version 2 with a type mapped for every edge. Directed graphs follow the declared arrow; undirected edges can be traversed either way. A group can restrict all path nodes. Static mode remains the default and preserves the existing path query and CSV. Edge-type labels are matched literally and are not assigned domain meanings by the solver. An opt-in static why-not query can run after an empty result: ASP reports the nodes reachable after every exact sequence prefix, respecting direction and group, and exports a separate CSV. If the destination is reachable only when node revisits are allowed, the explanation identifies the simple-path restriction as the blocker; otherwise the first empty prefix shows where typed walk reachability stops. It is a bounded certificate for the declared sequence, not a causal explanation.
- **Temporal typed path modes** are optional and require schema v2 mappings for both `graphMapping.edge.validity.fromField` and `toField`, with complete, valid intervals across the queried graph. `coValid` requires one instant shared by every step and returns the earliest common instant plus all parallel edge records active then. `orderedByStart` chooses one supporting edge record per step and requires its mapped validity start to be nondecreasing in sequence order; an opt-in strict setting requires strictly increasing starts. Intervals need not overlap in ordered mode. Temporal results include the selected edge IDs and mapped time values in the UI and a separate `typed_path_temporal.csv`. An opt-in temporal why-not query runs after an infeasible simple-path search and uses ASP to find a maximum-length typed temporal walk under the selected semantics. It reports the last reachable prefix or, when the goal is reachable only by revisiting nodes, shows that walk, which can be highlighted in the 3D graph; the separate `typed_path_temporal_why_not_certificate.csv` preserves its edge IDs and witness times. An optional temporal edge-addition counterfactual can minimize the cost of explicitly declared candidate records with required `validity.from`/`to` intervals, using the selected `coValid` or `orderedByStart` semantics; it exports a separate `typed_path_temporal_counterfactuals.csv`. Candidate and observed intervals must use the same temporal domain. These modes reason over configured validity intervals, not independently observed event times, and carry no causal or historical interpretation.
- Run `npm run benchmark:typed-path` to reproduce a small synthetic scaling check for typed paths. It reports graph and sequence sizes, ASP input size, and median grounding-plus-solving time over three runs while requesting one witness. It does not enumerate all paths.
- Run `npm run benchmark:psychology-path -- 100 3` to compare ASP with independent BFS on a most-distant pair in the psychology graph, using a permissive path bound and three repetitions; append `explain` to measure the opt-in minimality certificate too.
- Run `npm run benchmark:path-scaling` to profile the one-witness shortest-path query on synthetic 34–500 node layered graphs with exponentially many tied routes; each reported path length is checked against BFS. The benchmark reports ASP input bytes, clingo grounding/solver statistics, clingo timing, and peak WASM linear memory as well as wall time.
- Run `npm run benchmark:path-scaling:stress` to probe the clingo-WASM worker on a dense 500-node layered graph. On the tested build, layer width 30 (9,060 edges) succeeds, while width 31 (9,672 edges) traps with `memory access out of bounds`; the same worker then fails a trivial query, while a fresh worker succeeds. This stress command intentionally exits nonzero when that failure is reproduced. The threshold is specific to this encoding, clingo-WASM artifact and runtime; it is not a general graph-size limit. The app now replaces a worker after any solver `ERROR` response.
- Run `npm run benchmark:typed-path-enumeration` for a separate full-enumeration profile on synthetic layered graphs. It verifies the expected model count and `Models.More === "no"` for 16, 64, 256, 1,024 and 4,096 paths, and records clingo total/solve times, grounded atoms/rules, choices and conflicts. A second series holds the answer count at 256 while scaling the candidate domain to 34, 100 and 200 nodes. It tracks both the peak exported WebAssembly linear-memory buffer and the peak resident set size (RSS) of an isolated Node process for each memory profile. In these local runs, RSS ranges from 109.7 MB for 16 paths to 206.5 MB for 4,096; the fixed 256-path profiles range from 149.4 to 150.7 MB across the three graph domains. The RSS run performs one solve without warmup and is separate from timing runs. It includes Node runtime, JavaScript results, WASM and benchmark harness; it is a process-level proxy, not a direct measure of browser Worker memory or JS heap alone. The exported WASM buffer remained at 18,087,936 bytes in these profiles. Node defines `process.resourceUsage().maxRSS` in KiB and notes that RSS includes JavaScript and native/runtime memory; see the [Node.js v22.17.0 process API](https://nodejs.org/download/release/v22.17.0/docs/api/process.html#processresourceusage). The measurement does not change the interactive one-witness task.
- A minimum **dominating set** selects the fewest candidate nodes so every target node is either selected or adjacent to a selected node. The candidate group and target group are independent: for example, nodes in one group can cover targets in another. An empty target-group selection means every visible node is a target; an empty candidate-group selection means every visible node is eligible. Clicking a solution shows which selected node covers each target, distinguishes self-coverage from adjacency, highlights supporting edge records, and offers a separate CSV witness export. Parallel records are preserved; legacy graphs fall back to endpoint pairs. The witness establishes feasibility, while ASP optimization establishes minimum cardinality. The task requires an undirected projection and reports infeasible candidate/target combinations instead of treating them as a complete cover. After an infeasible result, a second ASP query within the same task budget lists each target with no self-or-adjacent candidate. An independent check against the current nodes and links validates the certificate before the UI highlights or exports it as a why-not CSV. One optimum is shown by default; all tied optima are optional and may be numerous.
- With at least two explicitly configured provenance scenarios, the panel can compare all minimum dominating sets separately in each scenario. It reuses the visible projection, candidate and target groups, confidence threshold and timeline, and reports candidate eligibility separately from selection across tied optima. Each scenario must prove and completely enumerate its optima; incomplete, infeasible or timed-out comparisons are discarded as a whole. If infeasibility blocks the comparison, a separate why-not ASP query identifies the uncovered targets in that scenario and validates them against its filtered projection; the aggregate comparison remains discarded. A scenario with no target in the chosen group has the mathematically vacuous empty minimum cover. The CSV records per-scenario optimum sizes/counts and per-node membership; these are deterministic structural counts, not probabilities or measures of importance.
- Run `npm run benchmark:dominating-set` to compare one minimum dominating-set query on the Psychology History Graph and Davis Southern Women fixture. Each dataset runs in an isolated Node process with a 20-second wall timeout; the script checks coverage independently and reports input size, clingo times, ground size and peak WASM linear memory. The task uses clingo's unsatisfiable-core (`usc`) optimization strategy. The latest run proves a 69-node optimum on the Psychology History Graph (335 nodes, 989 edges; 0.51 s wall, 0.446 s clingo time) and a five-node optimum on Davis (32 nodes, 89 edges; 0.32 s wall); both coverage witnesses pass independent validation. Enumeration of all tied optima uses `optN` with the same strategy and is checked against exhaustive results on all 64 simple four-node graphs. The parser ignores `Lower` progress records that have no answer-set `Value`. The command exits nonzero if any optimum is unproven or its witness fails validation.
- A minimum **node separator** finds the fewest eligible intermediate nodes whose hypothetical removal disconnects two chosen terminals by reachability. In schema v2 directed graphs, paths follow the declared arc direction; otherwise the existing undirected semantics apply. The terminals are protected, and an optional group limits which other nodes may be removed. If the terminals were already disconnected in the selected direction or projection, the optimum is the empty set. If no permitted removal can disconnect them (for example, a direct arc joins the protected terminals), the task reports that no solution exists. For each optimum, the panel also shows the nodes still reachable from the start terminal after removal and can highlight that side in 3D. The separate certificate CSV records the removed nodes and reachable side. This is a topological vulnerability scenario, not a recommendation to remove real entities.
- A separate **minimum-cost node separator** minimizes the sum of mapped node-removal costs while protecting both terminals, using the same direction-aware reachability semantics as the cardinality task. Configure `graphMapping.node.removalCostField` with a positive integer for every node. An optional group limits eligible nodes; the costs are separate from descriptive attributes. The summary and CSV include the total cost. Without complete costs the weighted task is disabled, while the cardinality-based node separator remains available.
- Run `npm run benchmark:weighted-node-separator-scaling` to compare the production ASP encoding with an independent weighted vertex-cut reference on cycles from 34 to 1,000 nodes, a 100-node path and star, a 10×10 grid, and the Davis Southern Women topology. Each profile uses three ASP runs and a 20-second clingo limit. Costs are generated deterministically by the benchmark and are not supplied by or interpreted as real domain data. The command verifies that ASP proves the same minimum total cost as the reference; any timeout or unproven optimum exits nonzero.
- A minimum **edge separator** finds the fewest edge records whose hypothetical removal disconnects two chosen terminals. Schema v2 directed graphs follow the declared arc direction; undirected and legacy graphs retain two-way traversal. Parallel records count separately, so every parallel connection may need to be cut. The task operates on the visible projection, highlights and exports the removed source edge IDs (or endpoint labels for legacy data), and reports an empty optimum when terminals are already disconnected. For each optimum, the panel also shows the nodes still reachable from the start terminal and can highlight that side in 3D; the separate certificate CSV records the removed edge IDs and reachable side. It is unweighted: an edge `weight` may describe tie strength and is not treated as a removal cost.
- A separate **minimum-cost edge separator** minimizes the sum of explicitly mapped positive integer removal costs, not the number of edges, using the same direction-aware reachability semantics as the cardinality task. Configure `graphMapping.edge.removalCostField` for every edge; missing, zero, fractional, unsafe, or incomplete costs disable this task. The mapping is separate from `weightField`, because tie strength is not automatically a cost of removal. The result summary and CSV include the total removal cost. Both edge-cut tasks preserve parallel records and IDs.
- Run `npm run benchmark:weighted-edge-separator-scaling` to compare the production ASP encoding with an independent weighted max-flow/min-cut reference on cycles from 34 to 1,000 nodes, a 100-node path and star, a 10×10 grid, and the Davis Southern Women topology. Each profile uses three ASP runs and a 20-second clingo limit. Costs are generated deterministically by the benchmark and are not supplied by or interpreted as real domain data. ASP witnesses are checked for separation and optimum cost; a timeout or unproven optimum exits nonzero.
- **Modularity communities** partitions every node in the selected group to maximize Newman–Girvan modularity. The optional `graphAnalysis.communities.resolution` sets γ to a finite positive decimal; the default is 1 and preserves the existing objective. The application interprets the decimal exactly as a rational `p/q`, reports γ and `p/q`, and uses the integer contribution `4·M·q·L_C − p·D_C²`; the resulting modularity is the total score divided by `4·M²·q`. Larger γ tends to favor finer partitions, but its effect depends on the graph and constraints. By default the graph remains unweighted: every undirected edge record has unit weight, parallel records count separately, and self-loops contribute twice to node volume. Set `graphAnalysis.communities.useEdgeWeights` to `true` to opt in to the mapped `graphMapping.edge.weightField`. Weighted mode accepts complete, finite, non-negative decimal weights when a common exact integer scale keeps the weights and objective within JavaScript's safe-integer range; the UI and certificate CSV report the scale and actual total weight. Zero-weight records are allowed when the total is positive. Negative, incomplete, non-finite, excessively precise, or excessively large weights disable this mode. `M` is the total edge weight (or edge-record count in unweighted mode), `L_C` is internal weight, and `D_C` is weighted volume; the score preserves the modularity ordering without floating-point arithmetic. Optional minimum/maximum community counts and `graphAnalysis.communities.mustLink` / `cannotLink` node-ID pairs constrain the partition. `attributeBounds` adds opt-in per-community minima/maxima for a scalar value of a mapped node attribute. It requires the attribute alias in `graphMapping.node.attributes`; counts use exact JSON scalar type and value, missing values do not count, and the bound applies to every community in the selected visible/group candidate domain. For example, a minimum of one node with `role="clinician"` requires that value in each community; it does not encode a social or normative interpretation. An infeasible bound produces no partition. The UI reports observed counts for every constrained community and includes them in structured CSV witness data. The UI shows one optimum by default and can enumerate tied optima; a projection with no edges or zero total weight has undefined modularity and is rejected. An optional explanation adds internal record count, internal weight, volume, integer contribution, and source edge records. Selecting a community highlights its nodes and supporting records; a separate CSV includes the per-community and total score. The default run does not emit these witness atoms. This is a structural baseline and does not establish historically meaningful groups.

When **Tutti gli ottimi** is enabled and clingo completes `optN`, the result panel can summarize, for a selected node, which other nodes are in its community in every optimum, in some optima, or in none. Counts are exact over the fully enumerated optimal partitions for the current projection, resolution, and constraints; they are not probabilities, evidence about uncertain source records, or causal explanations. A dedicated CSV preserves source IDs, labels, the resolution, and the count. If enumeration does not finish, the app does not expose a stability summary.

After any proven modularity optimum, the panel can also classify one selected pair without enumerating all tied partitions. Two additional exact ASP optimization queries impose must-link and cannot-link in turn; the pair is **always**, **sometimes**, or **never** co-assigned according to whether each constrained optimum preserves the global integer score. Both queries share the configured task timeout and use the same visible/group projection, weights, resolution, and community constraints as the reference optimum. An unproven or inconsistent query produces no classification. The panel and CSV also show each exact scaled objective gap (global optimum minus constrained optimum); an infeasible constraint has no score and no finite gap. This is objective sensitivity on the fixed graph, not a graph-edit proposal. The dedicated CSV records both constrained scores, both gaps, and the source IDs. This is exact membership in the optimum set, not a probability or social explanation.

The community panel also offers an opt-in **Diagnosi minima dei vincoli** when the configured constraints make every partition infeasible. A second ASP query keeps the graph, visible/group projection, and mapped attributes fixed, then minimizes the total configured cost of suspending rules across minimum/maximum community counts, must-link/cannot-link pairs, and per-attribute bounds. This is a minimum-cost relaxation set (a weighted correction set), not an unsat core: it gives a least-cost set whose suspension restores feasibility, but does not identify an individual erroneous rule. Each alternative includes a feasible example partition; enabling **Tutti gli ottimi** enumerates all diagnoses with minimum total cost. `graphAnalysis.communities.diagnosisCosts` optionally sets positive safe-integer costs by category: `minimumCommunityCount`, `maximumCommunityCount`, `mustLink`, `cannotLink`, and `attributeBound`. Unspecified categories cost 1, preserving the previous minimum-cardinality behavior; every rule within a category has the same configured cost. The panel and CSV show both total cost and number of suspended rules. Costs express the user's declared trade-off, not objective importance or evidence about which rule is correct. The output is a non-applied configuration proposal. The secondary query uses the remaining budget of `solver.taskTimeoutMs`; timeout or incomplete enumeration is reported without presenting unproven diagnoses. A CSV preserves the suspended rules, their configured costs, source node IDs, scope, total cost, and witness partition.

Exact modularity optimization can be expensive on larger projections. The task uses `solver.taskTimeoutMs` (20 seconds by default) and reports a timeout without displaying an unproven partition.

For a disconnected projection with no community-count, must-link, cannot-link, or attribute-bound constraints, the app automatically adds an exact ASP pruning rule: positive-volume nodes from different connected components cannot share a community. Merging such communities has no internal cross-edge gain and strictly decreases the modularity objective; zero-volume nodes remain unrestricted so tied optima are preserved. The rule is omitted when those global constraints could require a merge, and it does not change connected projections. `npm run benchmark:modularity-components` compares the baseline and separated encodings on three disjoint K4 components and independently checks that both prove the same optimum. In a controlled run using the app's pairwise encoding, both proved score 864 (294 ms baseline, 223 ms separated). Add `-- --stress` to measure five disjoint K4 components (20 nodes), which exercises the app's aggregate encoding above the 18-node pairwise threshold; in one run the baseline timed out at 20 s while the separated ASP proved score 2880 in 1.56 s. That timeout makes this stress comparison inconclusive; it is not evidence of equal optimal scores. The exhaustive tests verify exactness and preservation of all optima on small disconnected graphs, including zero-volume nodes. These synthetic results test a topology-specific reduction, not general scaling.

For unconstrained projections with more than 18 candidate nodes, the app can also factor the modularity solve by disconnected positive-weight components while keeping the original global total weight and resolution in every ASP subproblem. A request for one optimum may include all zero-volume nodes in a separate neutral subproblem; the recomposed partition is an exact optimum, but it is not an enumeration of all optima. When **Tutti gli ottimi** is requested and neutral nodes exist, the app uses the aggregate encoding instead, because those nodes may join other communities without changing the score and every such tie must remain eligible. A clingo-WASM integration test checks the aggregate and factored optimum against an independent score on the real SocioPatterns InVS projection from 30,000 to 30,300 seconds: 45 participants, 8 contact records, three positive-volume components of sizes 4, 3 and 3, plus 35 zero-volume participants. This validates the exact score on that projection; it is not a browser performance benchmark or an interpretation of workplace contacts as persistent ties.

`grounding-probe` runs the aggregate program with `--opt-mode=ignore` and requests one feasible witness; it measures grounding/feasibility resources but never claims an optimum. This probe is allowed up to 400 nodes, while the other experimental encodings remain capped at 50. The parent timeout defaults to 20,000 ms and can be overridden with a fourth argument such as `--timeout-ms=90000` (allowed range 1 through 600,000); the report includes detailed clingo/WASM errors and memory when available.

Run `npm run benchmark:modularity-datasets -- davis bb` to measure exact modularity on the Davis Southern Women fixture; replace `davis` with `psychology`, `karate` or `all`, and `bb` with `default` or `usc` to compare clingo strategies. Each dataset runs in a separate process with a 20-second wall timeout. An optional third argument selects `aggregate` (default), experimental `pairwise`, `equivalence` or `incremental`, `incumbent` (a verified lower-bound constraint), `seed-heuristic` (a feasible partition as a search preference), or `connected` (positive-volume community connectivity, exact only without global community constraints). These alternatives are benchmark-only and do not change the app's solver; the equivalence encoding chooses pairwise co-membership, enforces an equivalence relation, and derives canonical community representatives. The incremental encoding adds each node's exact discrete change to the degree-volume square and counts an internal edge when its higher-index endpoint is assigned. This introduces node/community aggregate instances and does not guarantee smaller grounding. Non-aggregate modes are rejected above 50 nodes to bound grounding. The benchmark independently checks any returned partition and reports input size, grounding statistics, solver timing and peak WASM linear memory. The `karate` profile uses the checked-in 34-node, 78-edge schema v2 fixture, but does not treat its `club` attribute as a target partition or ground truth. On Karate, controlled runs measured 16,382 bytes for aggregate, 34,855 for pairwise, 35,249 for equivalence and 17,032 for incremental; all four timed out at 20 seconds with the default strategy. Equivalence and incremental also timed out under `usc` and `bb`. On Davis (32 nodes, 89 records), equivalence generates 24,189 bytes and times out with all three strategies; the prior aggregate and pairwise runs also timed out there. The alternative encodings are correct on exhaustive small graphs but show no measured performance benefit on the checked-in datasets; they remain isolated research benchmarks. The greedy lower-bound and seed-guided modes also time out on Karate under `default`, `usc` and `bb`; they remain reproducible negative experiments. These timeouts are performance limits of the measured setup, not evidence that a community partition does not exist.

The additional experimental `connected` encoding constrains the positive-volume members of each community to be connected through positive-weight edges. With positive resolution and no community-count, must-link, cannot-link, or attribute-bound constraints, an optimum cannot contain two disconnected positive-volume pieces in one community: splitting them strictly increases the objective. Zero-volume nodes remain unrestricted, and zero-weight edges do not connect pieces. Exhaustive ASP results preserve every optimum across all 64 simple four-node graphs; a weighted fixture covers loops, parallel records, and zero-weight edges. This encoding is not used by the app: both it and the current aggregate encoding timed out at 20 seconds on Davis (32 nodes, 89 edges; 8,369 vs. 7,725 input bytes) and Karate Club (34 nodes, 78 edges; 17,336 vs. 16,692 bytes). The forced timeout yielded no grounding/solving counters, so no performance improvement was established.

Follow-up benchmark: the incremental encoding generated 8,065 bytes on Davis and also timed out at 20 seconds under `default`, `bb` and `usc`; it did not prove an optimum on this second dataset either.

Run `npm run benchmark:modularity-baselines -- all` to compare the local greedy incumbent, a local multi-start Louvain implementation and the pinned `graphology-communities-louvain@2.0.2` implementation on the Psychology, Davis and Karate graphs. Each Louvain baseline uses 32 seeded restarts; the report includes independently checked modularity scores and pairwise Adjusted Rand Index to show how partitions vary across restarts. Graphology and both Louvain baselines are development-only benchmark tools: their partitions remain heuristic and are never reported as ASP optima.

Run `npm run benchmark:modularity-resolution -- all` for an exploratory Graphology sweep at exact resolutions γ = 1/2, 1, 3/2 and 2. It independently checks the rational objective score and reports both within-resolution restart stability and agreement between the best partitions at different γ. Each γ defines a different objective, so its modularity value is compared only against other partitions at that same resolution; these heuristic runs do not prove ASP optima.

Run `npm run benchmark:modularity-seed-stability` to compare best-of-restarts partitions across 12 master seeds for both Louvain baselines at γ=1 (16 restarts per seed). It reports score and runtime ranges, distinct selected partitions, and pairwise ARI; the internal restart seeds are checked to avoid overlap across master-seed runs. This is an empirical sensitivity measure on the named fixtures, not a statistical confidence interval, an ASP optimality proof, or semantic validation of communities.

Run `npm run benchmark:modularity-seed-resolution` to measure seed sensitivity jointly with γ = 1/2, 1, 3/2, and 2 for both Louvain implementations (12 master seeds, 16 restarts each). The same seed streams are paired across γ and disjoint between master-seed replicates. The report computes ARI across replicates and paired across resolutions; it compares modularity scores only within each γ because those values optimize different objectives. The local baseline uses exact rational move gains and is checked against exhaustive optima on every simple four-node graph. All results remain heuristic and do not validate a social interpretation.

In PowerShell, use `npm.cmd run benchmark:modularity-seed-resolution -- all --replicates=12 --restarts=16` to override the defaults; the `npm.ps1` wrapper can consume long options itself. Other shells can pass those options through `npm run` normally, or invoke the underlying Node script directly.

The experimental `graphology-seed` mode in `npm run benchmark:modularity-datasets -- davis default graphology-seed` adds the best of 16 Graphology restarts as an ASP search heuristic. It does not constrain community assignments or certify an optimum. On the checked-in Davis and Karate fixtures this mode times out at 20 seconds before proving an optimum, so it remains a negative benchmark rather than an application feature.

```json
{
  "graphAnalysis": {
    "communities": {
      "useEdgeWeights": true,
      "resolution": 1.5,
      "minCount": 2,
      "maxCount": 5,
      "mustLink": [["source-node-a", "source-node-b"]],
      "cannotLink": [["source-node-c", "source-node-d"]],
      "attributeBounds": [
        { "attribute": "role", "value": "clinician", "minPerCommunity": 1, "maxPerCommunity": 3 }
      ]
    }
  }
}
```

Here `role` must be a key in `graphMapping.node.attributes`. The positive integer minima and maxima apply independently to each community. Use `0` only as “no bound”; every item must declare at least one positive bound. Duplicate attribute/value rules are rejected.

The pair values can be source node IDs or normalized IDs. A configured pair must be present in the visible projection and selected group; otherwise the run reports the missing constraint endpoint instead of ignoring the constraint.
The configured minimum and maximum initialize the corresponding UI controls; values entered in the panel apply to that run. The must-link and cannot-link pairs remain hard constraints for every run.

- A maximum **s-plex** is a largest node set in which every member is adjacent to at least `|S| - s` other members. Equivalently, each member may lack at most `s - 1` ties inside the set. The app proves its cardinality with ASP feasibility queries and binary search; a safe degree upper bound limits the search interval. By default it returns one maximum-cardinality solution; an explicit option runs a final exact-size ASP query to enumerate all maximum solutions, which can take much longer. Clicking a returned set shows the non-adjacent pairs emitted as an ASP certificate and checks that no node occurs in more than `s - 1` such pairs; a separate CSV exports that explanation. It does not enumerate every smaller or merely maximal s-plex.
- After a maximum k-plex result, the optional **Spiega la membership** query selects a candidate node and uses ASP to maximize the same s-plex measure with that node forced in. The parser independently checks the witness, all missing pairs and each member's `s - 1` bound. It compares the constrained optimum with the proven global maximum: equal sizes prove that the node occurs in at least one global optimum; a positive gap proves that it occurs in none. The witness can be highlighted and exported as `maximum_k_plex_membership_diagnosis.csv`. The extra query has its own configured timeout; on timeout, the already-proven global result remains valid and no membership conclusion is shown. This is structural why-not evidence for the current projection, not a social or historical cause.
- When **Tutti gli ottimi** is enabled, the exact enumeration must report `Models.More === "no"`; otherwise the task publishes no result. Once complete, the membership panel and CSV distinguish a target present in every optimum, some optima, or none. Counts describe enumerated answer sets, not probabilities or source uncertainty.
- The separate **inclusion-maximal s-plex** task returns sets that satisfy the same local condition and cannot be extended by another node in the selected candidate domain. It does not maximize set size: distinct maximal sets can have different cardinalities. The default builds one deterministic greedy candidate using the input order, degree orders, and up to 64 degree-ranked seed orders; clingo then verifies the s-plex and emits the blocker certificate before the UI displays it. This is a heuristic witness, not a maximum-cardinality result, and input order can affect ties. An independent toggle keeps the ASP encoding that enumerates all maximal models without optimization options; this can take much longer. At `s = 1`, this task returns maximal cliques. The group filter limits both members and possible extensions to that group. CSV exports label `maximum_cardinality` and `inclusion_maximal` semantics separately.
- A **k-core** is the unique largest induced subgraph in which every included node has at least `k` distinct neighbors inside the subgraph. On directed graphs, the UI requires an explicit degree semantics: **in** counts predecessors, **out** counts successors, and **mutual** counts a neighbor only when both arcs exist. The selected relation is used consistently for membership, witnesses, peeling, highlighting, and CSV output; the default undirected semantics are unchanged. The Psychology History Graph remains undirected; these directed semantics are validated on synthetic digraphs and are not used to infer direction in the case study. Clicking the result exposes an ASP witness listing each distinct internal adjacency; selecting a member shows its degree inside the core and the source records for those ties. The 3D view highlights the core and all supporting records, including parallel records, and a separate CSV reports the per-node degree witnesses. An optional **Peeling ASP per i nodi esclusi** setting adds deterministic synchronous peeling rounds: each removed candidate node is paired with the distinct neighbors still active in that round, so the degree below `k` can be checked. The panel shows and can highlight these exclusions and their supporting records, and exports a separate peeling CSV even when the resulting core is empty. This explanation is off by default and does not change the normal task's solver input or cost. When enabled, clingo proves the core first, then derives one synchronous exclusion round per ASP query; the application checks that the fixed point matches the proved core and respects the selected candidate group and degree semantics. On a current run of the 335-node, 989-edge Psychology projection, the aligned worker-harness benchmark proves the 302-node `k=2` core in 403.8 ms (14,494 cumulative atoms) and the 230-node `k=3` core in 296.4 ms (17,308 atoms); these are one run per threshold. A controlled comparison on a 700-node path, three isolated runs per mode, uses the exact production round program: repeating the full graph facts took 24.52–26.59 seconds (median 25.74), 1,597,046 cumulative atoms and 12,320,721 input bytes; sending only active-domain facts took 16.73–17.30 seconds (median 16.74), 859,950 atoms and 7,446,928 bytes. On a 700-node cycle-with-tail, active facts lowered cumulative atoms by 22% and input bytes by 19%, but wall-time medians were essentially equal (24.40 versus 24.38 seconds); smaller grounding does not guarantee a faster run on every topology. Both variants return the reference core and every synchronous round matches independent peeling. Use `--round-facts=full` and `--round-facts=active` to reproduce a payload comparison with the same ASP builder. The default `npm run benchmark:kcore-peeling` measures the current active-domain round queries; `npm run benchmark:kcore-peeling:monolithic` measures the single-query encoding. A 700-node cycle-with-tail exceeds the app's default 20-second task timeout; the UI withholds an incomplete certificate. The 700-node star reaches the empty core in two removal rounds (three queries), in 0.68 seconds in the latest isolated run. Timings vary with machine load and are not latency guarantees. Peak WASM was 17.25 MiB in these profiles; benchmark-process RSS includes Node, the harness, graph data and WASM and does not isolate the browser Worker. Earlier iterative-versus-monolithic timing figures used a hand-written benchmark rule and are not comparable to the production ASP builder. These structural certificates explain membership relative to the selected candidate group; they do not establish causal explanations for ties.
- An optional **Core number per ogni nodo** setting computes the full k-core profile of the current visible projection and selected candidate group using standard bucket peeling. It is independent of clingo and is labeled as such; the fixed-`k` ASP query remains the authoritative solver result and its membership can be cross-checked against nodes whose core number is at least `k`. Directed profiles use the explicitly selected in-, out-, or mutual-neighbor semantics. Self-loops are ignored and parallel edge records count as one distinct neighbor, matching the ASP k-core semantics. The UI groups nodes by exact core number, lets each level highlight the corresponding threshold k-core and its induced supporting records in the 3D view, and offers a separate `node_id,core_number,k_core_mode,eligible_group` CSV. For mutual directed cores, only arcs in reciprocal pairs are highlighted. The option is off by default and does not change ASP input. On the full Psychology History projection (335 nodes, 989 edges), it took 2.4–6.0 ms across two browser smoke runs and yielded 33 nodes at core number 1, 72 at 2, 61 at 3, 65 at 4, and 104 at 5; threshold sets matched the ASP and independent peeling at `k=2` (302 nodes) and `k=3` (230 nodes). These figures describe this visible projection, not a causal or temporal interpretation.

The k-core and dominating-set encodings optimize in clingo; the maximum k-plex is proved through a sequence of ASP feasibility queries, and component detection computes a partition directly. Clique, k-plex, ordinary connected components, dominating sets, and modularity require undirected adjacency. K-core supports undirected graphs and directed graphs with an explicit in-, out-, or mutual-neighbor semantics. Separator tasks follow the mapped direction: schema v2 directed graphs respect arc direction, while undirected and legacy graphs allow traversal both ways. Weak and strong components follow their respective direction semantics and require schema v2 directed edges. Results can be highlighted in the 3D view and exported as CSV. Structural solver runs have a configurable total timeout, `solver.taskTimeoutMs` (default `20000`, capped at `300000` ms); after timeout, the worker is restarted and no unproven incumbent is presented as an optimum.

For group-filtered structural tasks, the result summary distinguishes the full visible projection from the number of visible nodes in the selected group.

Run `npm run benchmark:kcore-scaling` to compare the ASP `k=2` result against independent iterative peeling on sparse cycle-with-tail graphs from 34 to 1,000 nodes. It reports one optimum, wall and clingo times, grounding statistics, and peak WASM linear memory; the synthetic graph's 2-core is known in advance to be the cycle.

Run `npm run benchmark:kcore-peeling` to profile the optional ASP exclusion certificate through 600 nodes. It asks clingo for one synchronous removal round per query, then checks every round, supporting neighbor, and final core against independent peeling; output includes query count, cumulative grounding statistics, wall/clingo time, peak WASM linear memory, and benchmark-process RSS. Run `npm run benchmark:kcore-peeling:monolithic` for the single-query encoding, or `npm run benchmark:kcore-peeling:psychology` for both thresholds on the case-study graph. `npm run benchmark:kcore-peeling:700` profiles a 700-node cycle-with-tail and `npm run benchmark:kcore-peeling:700:star` profiles a 700-node star. For custom profiles, run `node --experimental-strip-types scripts/benchmark-kcore-scaling.mjs --explain --iterative --nodes=700 --topology=path`; supported topologies are `cycle-with-tail`, `star`, `path`, and `cycle`. Add `--round-facts=full` to repeat the full graph fact bundle at every round, or leave the default `active` mode to send only the current induced domain. Both modes execute the same production round program and validate their results against independent peeling.

Run `npm run benchmark:node-separator-scaling` to compare the minimum node separator with an independent Dinic max-flow implementation using vertex splitting. It retains cycle profiles from 34 to 1,000 nodes and adds a 100-node path, a 100-node star, a 10×10 grid and the 32-node/89-edge Davis Southern Women fixture. All ASP cut cardinalities match Dinic, including size 3 between `Evelyn Jefferson` and `E14` on Davis. On cycles, ASP medians range from about 3.2 ms at 34 nodes to 314.4 ms at 1,000; on the 10×10 grid they are about 4.6 ms, and on Davis about 5.1 ms. Each profile creates a fresh clingo-WASM runner using the shipped browser worker in a Worker-like VM. Dinic is also checked on a chain, two disjoint paths, a direct terminal edge and already disconnected terminals. These controlled profiles test correctness across varied topologies; they do not establish a general performance ranking or give the cuts a domain interpretation.

Run `npm run benchmark:edge-separator-scaling` for the analogous edge cut, preserving edge-record identity in the ASP facts and comparing cut size against Dinic. It uses the same cycle, path, star, grid and Davis profiles as the node-separator benchmark; every ASP cardinality matches Dinic. On cycles, ASP medians range from about 3.9 ms (34 records) to 416.3 ms (1,000); the 10×10 grid takes about 12.0 ms and Davis about 6.3 ms for the same terminal pair. Each profile creates a fresh clingo-WASM runner using the shipped browser worker in a Worker-like VM. The benchmark checks its reference on a chain, two edge-disjoint paths, and disconnected terminals. It does not evaluate weighted costs, which require explicit trustworthy data.

The full Psychology History Graph reaches its `k=2` and `k=3` cores in under a second and matches independent peeling. On the 335-node, 989-edge projection, `s=1` (maximum clique) is proved to have size 5 by three ASP queries in about 0.64 seconds; `s=2` is proved to have size 6 in three queries in 4.97–5.07 seconds across two benchmark runs. Both match independent branch-and-bound references. For `s=3`, the ASP binary feasibility search proves size 7 in four clingo queries; two ASP-only runs took 3.85–4.07 seconds and established that threshold 8 is UNSAT. The independent branch-and-bound reference now proves the same optimum after a deterministic multi-start greedy procedure supplies a valid incumbent: 2,680 search states in 4.03 seconds in one run, compared with four ASP feasibility queries in 4.48 seconds. The greedy phase only finds a lower bound; branch-and-bound proves that no larger solution exists. Direct clingo optimization and the `usc` strategy also time out for `s=2`. The search interval uses the safe upper bound `min(candidate count, degeneracy + s)`; reproduce comparisons with `npm run benchmark:psychology-kplex -- search 1` or `-- search 2`. Pass `opt` or `usc` to benchmark direct optimization. To measure ASP alone for `s=3`, run `node --experimental-strip-types scripts/benchmark-psychology-kplex.mjs --asp-only search 3`. These measurements are local and do not establish performance on larger graphs.

For `s=4`, the same 335-node Psychology projection has an exact maximum of 8: ASP proves it in four feasibility queries (3.96 seconds in the measured run), while the independent branch-and-bound proves it in 4,718 states (6.55 seconds). The two solvers return different valid witnesses, which establishes tied optimum sets rather than a mismatch; the regression checks both witness conditions. Reproduce with `npm run benchmark:psychology-kplex -- search 4`.

For `s=5`, the exact maximum on Psychology is 9. ASP proves it in four queries (3.72 seconds); branch-and-bound proves the same cardinality in 8,220 states (8.80 seconds). The regression checks `s=4,5,6,7,8,9`, including each witness's non-neighbor limit. Reproduce the `s=5` benchmark with `npm run benchmark:psychology-kplex -- search 5`.

For `s=6`, ASP and the independent exact reference prove a maximum of 10. ASP uses four queries (4.86 seconds); branch-and-bound visits 13,386 states (13.59 seconds) in the measured run. The regression validates both witnesses' maximum size and non-neighbor limit for `s=4,5,6,7,8,9`. Reproduce with `npm run benchmark:psychology-kplex -- search 6`.

For `s=7`, the exact maximum on Psychology is 11. ASP proves it in four queries (6.98 seconds); branch-and-bound visits 21,273 states (21.64 seconds). Both witnesses are validated, although they differ. Reproduce with `npm run benchmark:psychology-kplex -- search 7`.

For `s=8`, ASP and branch-and-bound prove a maximum of 12 on Psychology. ASP uses four queries (5.42 seconds); branch-and-bound visits 32,840 states (26.78 seconds). The two witnesses differ and are each checked against the s-plex condition. Reproduce with `npm run benchmark:psychology-kplex -- search 8`.

For `s=9`, both exact methods prove a maximum of 13 on Psychology. ASP uses four queries (6.37 seconds); branch-and-bound visits 50,291 states (35.21 seconds). This reference needed a larger bound, so the benchmark accepts `--budget-ms=N` for both its reference and each ASP child process; reproduce with `node --experimental-strip-types scripts/benchmark-psychology-kplex.mjs search 9 --budget-ms=60000`. The regression checks both witnesses against the s-plex condition. The budget affects only this benchmark, not the app's solver timeout.

On the independent Zachary Karate Club fixture (schema v2, 34 nodes and 78 undirected edges), both the ASP search and exact branch-and-bound prove an `s=3` maximum of 6. The measured run uses three ASP feasibility queries (398.94 ms) and 320 branch-and-bound states (11.50 ms). Reproduce it with `npm run benchmark:karate-kplex -- search 3`. The `club` attribute is preserved by the mapping but is not used as a target partition.

An additional `s=4` benchmark proves a maximum of 8 on the same fixture with four ASP feasibility queries; the independent branch-and-bound reference proves the same result in 53 explored states in that run. Reproduce it with `npm run benchmark:karate-kplex -- search 4`.

For `s=5`, both exact methods prove a maximum of 9: ASP uses four feasibility queries (328.82 ms), while branch-and-bound visits 51 states (48.21 ms) in the measured run. The regression validates both witnesses for `s=4,5,6,7,8,9`. Reproduce with `npm run benchmark:karate-kplex -- search 5`.

For `s=6`, ASP and branch-and-bound prove a maximum of 10 in four queries and 49 states respectively (332.07 ms and 77 ms in the measured run). Reproduce with `npm run benchmark:karate-kplex -- search 6`.

For `s=7`, both methods again prove a maximum of 10: ASP uses four queries (582.44 ms) and branch-and-bound visits 49 states (124.5 ms). The returned witnesses differ but each satisfies the s-plex condition. The regression now checks s=4–9. Reproduce with `npm run benchmark:karate-kplex -- search 7`; the repeated maximum size does not imply a general trend beyond this fixture. Together, these checks span s=3–9 on the same 34-node graph and do not establish scaling on larger networks.

For `s=8`, both methods prove a maximum of 11: ASP uses four queries (516.65 ms) and branch-and-bound visits 47 states (119.3 ms). The witnesses are checked independently. Reproduce with `npm run benchmark:karate-kplex -- search 8`; the measured maximum on this fixture does not establish scaling on larger networks.

For `s=9`, both methods prove a maximum of 12: ASP uses four queries (493.39 ms) and branch-and-bound visits 45 states (162.22 ms). The regression checks both witness conditions, and the `s=9` result does not establish scaling beyond this fixture.

Direct clingo optimization with `opt` or `usc` times out at 30 seconds for `s=8`, but these are not the app's `search` strategy; binary feasibility search proves both maxima in four queries.

The Sandbox JSON Editor also offers a `Karate Club · 34 nodi, 78 archi` preset backed by the same checked-in dataset and schema v2 mapping used by the tests and benchmarks. `Reset example` still restores the legacy schema v1 sample, so the fixture can be explored in the UI without replacing the default graph.

---

## 🧬 Data-Driven Design

KliqueASP separates graph data from interpretation logic.

The framework works with two resources:

```text
Data JSON          → defines nodes and edges
Configuration JSON → defines how metadata must be interpreted
```

The data JSON describes the graph structure.  
The configuration JSON tells the application where to find temporal fields, semantic groups, visual styles, and interaction parameters.

This makes the framework adaptable to different domains without hard-coding a fixed schema.

---

## 📦 Data JSON

A graph is represented through two main collections:

```json
{
  "nodes": [],
  "edges": []
}
```

Each node must provide at least:

- `label`: a human-readable name;
- `type`: the semantic type of the node.

The optional field `id` is used as the internal identifier. If missing, the identifier is derived from the normalized node label.

Example node:

```json
{
  "id": "alice_rossi",
  "label": "Alice Rossi",
  "type": "actor",
  "data": {
    "active_from": 2018,
    "active_to": 2024,
    "affiliations": [
      { "group": "Network Analysis" }
    ]
  }
}
```

Example edge:

```json
{
  "source": "alice_rossi",
  "target": "bruno_verdi"
}
```

Both explicit identifiers and labels can be used, as long as they normalize to the same internal form.

### Optional semantic mapping (schema version 2)

Existing datasets and configurations remain in the legacy profile when `schemaVersion` is omitted. When present, `schemaVersion` must be a JSON number equal to `1` or `2`; strings, booleans, arrays, and other values are rejected rather than coerced. To pass additional graph meaning to ASP, declare `schemaVersion: 2` and map the fields explicitly. Missing values are not guessed from property names. Unknown keys inside schema v2 `graphMapping`, `graphIntegrity`, and `graphAnalysis` declarations (including their nested rule records) are errors, so misspelled options cannot silently fall back to defaults. Attribute names, role names, and unrelated application config keys remain user-defined and allowed.

```json
{
  "schemaVersion": 2,
  "graphMapping": {
    "node": {
      "idField": "$.id",
      "labelField": "$.label",
      "typeField": "$.type",
      "roleField": "$.role",
      "groupFields": ["$.data.affiliations[*].group"],
      "removalCostField": "$.cut_cost",
      "attributes": {
        "year": "$.data.year",
        "birthYear": "$.birth_year",
        "recordId": "$.record_id",
        "email": "$.email",
        "roleCode": "$.role_code"
      }
    },
    "edge": {
      "idField": "$.id",
      "sourceField": "$.source",
      "targetField": "$.target",
      "typeField": "$.type",
      "direction": "directed",
      "identity": "multigraph",
      "validity": {
        "fromField": "$.valid_from",
        "toField": "$.valid_to"
      },
      "weightField": "$.weight",
      "removalCostField": "$.cut_cost",
      "confidenceField": "$.confidence",
      "confidenceRange": { "min": 0, "max": 100 },
      "provenanceField": "$.source_ref",
      "attributes": {
        "event": "$.event",
        "registryCode": "$.registry_code"
      }
    }
  },
  "graphIntegrity": {
    "allowedNodeTypes": ["person", "institution", "researcher"],
    "allowedEdgeTypes": ["works_at", "collaborates"],
    "edgeTypeDomains": [
      {
        "edgeType": "works_at",
        "sourceNodeTypes": ["person"],
        "targetNodeTypes": ["institution"]
      },
      {
        "edgeType": "collaborates",
        "sourceNodeTypes": ["person"],
        "targetNodeTypes": ["person"]
      }
    ],
    "requiredNodeAttributes": [
      { "nodeType": "person", "attributes": ["birthYear"] }
    ],
    "requiredEdgeAttributes": [
      { "edgeType": "works_at", "attributes": ["event"] }
    ],
    "nodeAttributeDomains": [
      { "nodeType": "person", "attribute": "roleCode", "allowedValues": ["clinician", "researcher"] }
    ],
    "edgeAttributeDomains": [
      { "edgeType": "works_at", "attribute": "registryCode", "allowedValues": ["R-1", "R-2"] }
    ],
    "requiredEdgeIntervals": ["works_at"],
    "uniqueNodeAttributes": [
      { "nodeType": "person", "attribute": "recordId" }
    ],
    "uniqueEdgeAttributes": [
      { "edgeType": "works_at", "attribute": "registryCode" }
    ],
    "cardinalities": [
      { "nodeType": "person", "edgeType": "works_at", "incidence": "any", "max": 5 }
    ],
    "repairSuggestions": {
      "removableEdges": [
        { "edgeId": "source-edge-id", "cost": 3 }
      ],
      "nodeAttributeValues": [
        { "nodeId": "person-source-id", "attribute": "email", "value": "candidate@example.org", "cost": 2 }
      ],
      "edgeAttributeValues": [
        { "edgeId": "another-source-edge-id", "attribute": "event", "value": "CILC", "cost": 1 }
      ],
      "nodeAttributeReplacements": [
        { "nodeId": "person-source-id", "attribute": "email", "expectedValue": "old@example.org", "value": "new@example.org", "cost": 4 }
      ],
      "edgeAttributeReplacements": [
        { "edgeId": "another-source-edge-id", "attribute": "registryCode", "expectedValue": "R-1", "value": "R-2", "cost": 2 }
      ],
      "nodeTypeReplacements": [
        { "nodeId": "person-source-id", "expectedType": "person", "newType": "researcher", "cost": 3 }
      ],
      "edgeTypeReplacements": [
        { "edgeId": "another-source-edge-id", "expectedType": "works_at", "newType": "collaborates", "cost": 2 }
      ],
      "edgeIntervalReplacements": [
        { "edgeId": "reversed-interval-edge-id", "expectedFrom": 1901, "expectedTo": 1899, "from": 1899, "to": 1901, "cost": 4 },
        { "edgeId": "missing-start-edge-id", "expectedTo": 2020, "from": 2018, "to": 2020 }
      ]
    }
  }
}
```

All mappings are optional. Node paths are relative to the node object; edge paths are relative to the edge object. The path subset supports dotted paths and array expansion with `[]` or `[*]`. Existing `nodeTypes.*.group` mappings continue to work and can be combined with `graphMapping.node.groupFields`.

An explicit node `idField`, edge `idField`, `sourceField` or `targetField` must resolve to exactly one scalar identifier: a string, finite number or boolean. Endpoint objects of the form `{ "id": value }` are supported. A path that resolves to multiple identifiers, or an object-valued identifier, is a validation error rather than being reduced to its first value or stringified. A missing edge ID remains allowed and receives a local ID. Legacy nodes with numeric ID `0` retain that ID instead of falling back to the label; other falsey legacy IDs such as `false` retain the label fallback, while schema v2 can map `false` explicitly.

`direction` defaults to `undirected` and can be set to `directed`. Directed links are drawn with arrows. Clique and k-plex currently require undirected adjacency; the UI reports missing prerequisites on directed graphs instead of silently dropping direction. K-core offers explicit in-, out-, and mutual-neighbor semantics on directed graphs; other tasks that need undirected adjacency do not silently reinterpret directed edges. `identity` defaults to `simple`: one edge is kept per endpoint pair (ordered for directed graphs, unordered for undirected graphs). In schema v2, records in a simple graph are collapsed only when their mapped metadata agrees; conflicting metadata is a validation error instead of silently discarding a weight, interval, provenance value, or mapped attribute. Repeated mapped IDs must keep the same endpoints and metadata. Distinct IDs with otherwise identical mapped metadata still collapse with a warning; use `multigraph` to retain parallel records. The schema v1 legacy projection continues to collapse duplicate endpoint pairs as before.

For schema v2 records without a mapped source ID, the normalizer generates a local edge ID and reserves all explicit mapped IDs first. If an explicit ID occupies the generated name, a deterministic suffixed ID is used and a warning is shown; ASP provenance maps that generated ID back to the correct input record.

Mapped node facts are emitted as `node_type/2`, `node_role/2`, `node_group/2` and `node_attribute/3`. In schema version 2, edge records also retain `edge_record/1`, `edge_id/2`, `edge_source/2`, `edge_target/2`, `edge_direction/2`, `edge_type/2`, `edge_valid_from/2`, `edge_valid_to/2`, `edge_weight/2`, `edge_confidence/2` and `edge_provenance/2` where mapped. ASP numeric terms are integers; mapped non-integer decimals are preserved exactly as `decimal(N,D)` rational terms (for example, `0.8` becomes `decimal(4,5)`). Temporal endpoints currently require integer years/numbers or parseable ISO dates; fractional or malformed endpoints are kept as quoted values in `edge_valid_*_raw/2` with an `edge_valid_*_invalid/1` marker, so temporal rules never compare them as dates. The legacy `node/1`, `group/2` and `edge/2` facts remain available for the existing clique encoding. Confidence scores must be finite numeric values inside the configured source range for that capability to be available.

When `graphMapping.edge.confidenceField` maps a valid value on every edge, the Sandbox exposes an optional minimum-score slider and exact numeric threshold field. By default the source range is `[0,1]`; set `graphMapping.edge.confidenceRange` to finite `{ "min": ..., "max": ... }` values with `min < max` when the JSON stores another numeric scale, such as percentages `[0,100]`. The controls and threshold remain in the source data's units, and the number field accepts any finite value inside the declared range, including precision finer than the slider's step. Both controls apply the same inclusive cutoff, and the default at the declared minimum includes every edge. The ASP fact `edge_confidence/2` keeps the original mapped score. Visible nodes remain in the projection when their incident edges are filtered out, so they may become isolated. The count of excluded edges is shown, and every ASP task uses the same filtered projection. In graph-aware timeline mode, low-score links do not bring related context nodes into the view. An absent, incomplete or out-of-range mapping hides the control and leaves the projection unchanged. Changing the threshold or another projection filter clears prior query results; projection controls are disabled while the solver runs. This is an explicit deterministic cutoff over a data-provided score: the application does not infer that the score is a probability, rank sources, or assign meaning to it.

When `graphMapping.edge.provenanceField` maps a scalar source reference or an array of scalar references, edge-based structural, clique, motif, and integrity witnesses display the declared reference(s) and include them in their explanation/certificate CSVs. For arrays, references are trimmed, deduplicated, and sorted for deterministic output; ASP receives one `edge_provenance/2` fact per reference. This is descriptive metadata: the application does not treat the references as alternative edge worlds, rank sources, infer trust, resolve disagreement, or interpret values as probabilities. Integrity repair proposals carry declared references for actions on observed edges. Hypothetical counterfactual additions remain clearly separate and do not inherit the provenance of observed records.

For example, map `provenanceField` to `$.source_refs` when an edge stores `"source_refs": ["archive-17", "catalogue-2"]`. The scalar and list forms use the same configuration field.

Schema v2 can define optional, named source projections with `graphAnalysis.provenanceScenarios`:

```json
{
  "graphAnalysis": {
    "provenanceScenarios": {
      "scenarios": [
        { "id": "archive-a", "label": "Archive A", "sources": ["archive-a"] },
        { "id": "combined", "label": "A or B", "sources": ["archive-a", "archive-b"] }
      ],
      "unattributedEdges": "exclude",
      "referenceMatching": "any"
    }
  }
}
```

This requires `graphMapping.edge.provenanceField`. `sources` is the set of active source references for a scenario. `referenceMatching` controls how an edge's declared references are compared with that set: `any` retains a multi-reference edge when at least one reference is active; `all` retains it only when every declared reference is active. It defaults to `any` to preserve the initial scenario-projection behavior. An edge with no usable reference follows the required `unattributedEdges` policy (`include` or `exclude`), independently of `referenceMatching`. “All sources” is the initial state and keeps the full edge set, including unattributed records. For clique, structural and motif queries, the app first applies the source scenario and then the confidence cutoff; in graph-aware timeline mode, only links surviving both projections can expand the visible node set. After node, timeline and visual filters, the same remaining links feed the 3D view and those ASP queries. Integrity checks and repairs use all imported nodes and the selected scenario's links, independently of confidence, visual filters and the timeline. Changing a projection clears results computed on the prior graph. Without `worldAssumption`, scenarios remain deterministic projections and are not interpreted as possible worlds. Setting `graphAnalysis.provenanceScenarios.worldAssumption` to `finite-exhaustive-worlds` is an explicit analyst claim that the configured finite scenario list exhausts the possible graph states for the question; the validator rejects any other value. Use this only when that claim is justified for the task. It assigns no probability or trust to a source and does not infer source independence, joint support or conflict.

When named provenance scenarios are configured, **Confronta clique massime** runs the exact maximum-clique task separately for every declared scenario and enumerates every tied optimum with clingo. It reports each scenario's maximum size and number of maximum cliques, plus how often each node appears across scenarios and across all optimal answer sets. By default, a node is called *stable* only when it belongs to every maximum clique in every configured scenario; this is a deterministic comparison over the declared projections. With `worldAssumption: "finite-exhaustive-worlds"`, the same complete ASP answer sets receive a conditional finite-world reading: *brave* membership means that the node belongs to a maximum clique in at least one configured world, and *cautious* membership means that it belongs to every maximum clique in every configured world. This aggregation runs separate ASP tasks per world and is valid only under the analyst's exhaustive-list assumption; it is not a probability, confidence score or trust judgment. Nodes absent from every maximum clique are omitted from the positive membership list. Non-cautious membership can result from different worlds or tied optima inside one world. The comparison applies the same active type/group filters, selected clique group, timeline window and confidence threshold to every scenario. In graph-aware timeline mode, it rebuilds the visible node cohort separately from each scenario's source-filtered, confidence-qualified links; in simple mode, the node cohort remains the same across scenarios. Each scenario row reports its own candidate-node and projected-edge counts. If a scenario has no eligible node in the selected clique group, the comparison stops with an explicit error and shows no partial result. Complete enumeration can be expensive when there are many scenarios or tied optima. Results are shown only when clingo confirms complete enumeration for every scenario; an error or incomplete run produces no partial comparison. The output panel can highlight a node in the 3D view and export `clique_scenario_stability.csv`; in finite-world mode the CSV also records the world assumption and brave/cautious status.

The same opt-in interpretation is available for the fixed-`k` **k-core** and maximum **k-plex** scenario comparisons. A k-core has one membership set per scenario, so brave means membership in at least one configured world's core and cautious means membership in every world's core. For a maximum k-plex, the app requires complete enumeration of every tied optimum: brave means membership in at least one maximum k-plex in at least one world; cautious means membership in every maximum k-plex in every world. A candidate with no maximum-witness support is explicitly marked not brave. If the assumption is omitted, the existing deterministic scenario comparison labels and CSV headers are preserved. These task-specific summaries do not turn the source references themselves into uncertain ASP facts.

The **Structural Analysis** panel can also compare the connected component of an explicitly selected reference node across every configured scenario. It supports undirected, weak, and strong components according to the graph's declared direction and available task semantics. Each scenario reuses the configured source matching policy, confidence threshold, timeline window, visible type/group filters, and selected ASP group. The panel reports whether the reference and each other node are eligible in each scenario; a node outside the candidate domain is not treated as disconnected. A complete ASP partition is required for every scenario, and a task-specific CSV exports the comparison. Without the finite-world opt-in, these counts describe only the configured deterministic projections. With `worldAssumption: "finite-exhaustive-worlds"`, brave membership means at least one declared world has a completed partition where both nodes are eligible and share the reference component; cautious membership requires this in every declared world. If the reference is absent or ineligible in a world, the relation is undefined there and is not reported as disconnection; worlds with no jointly eligible nodes are counted separately. The result is conditional on the analyst declaring the world list exhaustive, not a probability or source-trust judgment.

The structural analysis panel also offers **Confronta il k-core su tutti gli scenari** when at least two provenance scenarios are configured and `k-core` is selected. It runs the ASP k-core for each scenario using the same `k`, candidate group and, for directed graphs, the chosen in-degree, out-degree or mutual-neighbor semantics. Each run uses the same active type/group filters, timeline window and confidence threshold as the current view, but rebuilds the visible cohort for that scenario in graph-aware timeline mode. The comparison reports each scenario's candidate nodes, projected edges and core size. Membership rows distinguish nodes eligible in a scenario from nodes that actually belong to its core; “present in every scenario” is the intersection of the unique k-cores. Nodes absent from every core are omitted. Under `worldAssumption: "finite-exhaustive-worlds"`, these unique per-world memberships are labeled brave/cautious, conditional on the analyst's exhaustive-list assumption; with no opt-in they remain a deterministic comparison over declared projections. A shared `solver.taskTimeoutMs` budget covers all scenarios; missing candidates, an unproven solve or any error suppresses partial results. The panel highlights members in 3D and exports `kcore_provenance_scenario_stability.csv` with the scenario, group, confidence threshold and timeline window used; in finite-world mode the CSV includes the assumption and membership status.

When at least two provenance scenarios are configured and `k-plex di cardinalità massima` is selected, **Confronta i k-plex massimi su tutti gli scenari** compares the complete maximum-witness sets. It requires **Tutti gli ottimi** to be checked: for each scenario, ASP first proves the maximum cardinality through feasibility queries, then enumerates every k-plex at that size. The same source, confidence, visible-node and graph-aware timeline projection is rebuilt per scenario. The result reports candidate and projected-node counts, maximum size, number of maximum witnesses, and each candidate's support across scenarios and answer sets. Candidates that belong to no maximum witness remain listed with zero support. By default, “Presente in tutti gli ottimi” means the node occurs in every complete maximum witness of every configured scenario. With `worldAssumption: "finite-exhaustive-worlds"`, brave/cautious status is reported across all maximum witnesses in all configured worlds; zero-support candidates are not brave. This conditional reading does not treat witness counts as probabilities or infer uncertainty from source references. One shared `solver.taskTimeoutMs` budget covers the whole comparison. A timeout, incomplete enumeration or error suppresses all partial results. The panel can highlight members in 3D and exports `kplex_provenance_scenario_stability.csv` with the selected group, confidence threshold and timeline window; finite-world mode appends its assumption and brave/cautious status.
The minimum dominating-set scenario comparison also supports `worldAssumption: "finite-exhaustive-worlds"`: brave means selection in at least one complete minimum cover in at least one declared world, cautious means selection in every minimum cover in every world, and candidates with zero support are not brave. A candidate absent from a world is not selected there. If any world has no feasible cover or complete optimum enumeration, the comparison is suppressed rather than aggregating partial worlds. The interpretation is conditional on the analyst declaring the world list exhaustive.

The **Motivi relazionali** panel also offers **Confronta istanze sui mondi** when the finite-world assumption and provenance scenarios are configured. It runs the configured typed-motif enumeration separately over every scenario, keeping the selected role group, visual filters, confidence threshold and time window. The aggregation is published only if every world returns a complete enumeration; an incomplete run suppresses all worlds. An instance is identified by the ordered assignment of every template role—including context roles—to stable source node IDs. Supporting edge IDs and temporal witnesses are evidence, not part of that identity: the same assignment can therefore be cautious even when different edge records or valid times support it in different worlds. This asks whether that role assignment realizes the template in each world; it does not claim that the same temporal occurrence persists. Positive instances are brave if present in at least one world and cautious if present in every declared world. The result does not enumerate a universe of absent role tuples, so it does not label arbitrary tuples “not brave.” Each row can open a world projection and highlight one ASP witness; the CSV includes world membership and filter lists as JSON arrays, query scope and witness edge IDs. If a completed comparison finds no positive instances, the CSV still exports a summary row with the query scope and each world's node, edge, assignment and solver-time counts. Closed-world absence/induced constraints, when configured, are evaluated independently on each scenario projection. The finite-list reading remains the analyst's assumption, not a probability or a source-trust score.
`graphIntegrity` is optional and requires schema version 2. When present, the toolbar exposes an ASP check over all imported nodes and the selected provenance scenario's edges, even if the 3D view or timeline is filtered. Without a selected scenario this is the complete imported graph. Supported rules cover required node/edge types, closed `allowedNodeTypes`/`allowedEdgeTypes` vocabularies, typed edge endpoint domains, required node/edge attributes, finite allowed-value domains, unique node/edge attribute values, required edge intervals and typed edge cardinalities. Type vocabularies diagnose any mapped node or edge type outside the configured finite list. An attribute domain is an exact finite list of strings, finite numbers or booleans for a declared node/edge type and mapped attribute; it checks present values, while `required*Attributes` handles absence. On undirected graphs, endpoint domains are checked symmetrically and cardinality incidence must be `any`; `source`/`target` are meaningful only for directed graphs. For edge types in `requiredEdgeIntervals`, missing or invalid endpoints are reported with the source edge ID. The shared temporal parser accepts safe integers (including numeric strings), valid ISO dates (`YYYY-MM-DD`, interpreted as midnight UTC), and ISO date-times with seconds, up to millisecond precision, and an explicit `Z` or `±HH:MM` timezone. It rejects impossible Gregorian dates, timezone-free date-times, locale-dependent date strings, invalid clock values, and offsets beyond `±14:00`. Temporal task capability is available only when every mapped edge has an ordered interval (`from <= to`) and all endpoints share one domain (integers or ISO dates). Numeric values are compared as supplied. When using temporal `maximumSpan`, declare their common source unit as `graphMapping.edge.validity.numericUnit`; the parser cannot infer whether `2024` means a year, a count, or an epoch value. Findings are diagnostic witnesses mapped back to source IDs. Unresolved edge endpoints are rejected by graph validation before ASP runs, since those records cannot be represented safely in the current numeric node index.

The optional `repairSuggestions` task minimizes the total cost of a finite set of explicitly authorized actions: `removableEdges` lists source edge IDs; `nodeAttributeValues` and `edgeAttributeValues` supply values for currently missing mapped attributes; `nodeAttributeReplacements` and `edgeAttributeReplacements` state both the expected current value and a proposed replacement; `nodeTypeReplacements` and `edgeTypeReplacements` state the expected current type and a proposed new type; `edgeIntervalReplacements` states the expected current endpoints and a proposed interval. Attribute replacements require the current ASP value to equal `expectedValue`; type replacements require the corresponding `graphMapping.*.typeField`, an exact `expectedType` match and a new type contained in the matching `allowed*Types` vocabulary. Thus the finite type vocabulary also prevents a proposed edge type from evading endpoint rules by changing to an undeclared type. Every proposal is checked again against all configured type, endpoint, attribute, uniqueness, interval and cardinality rules. No value is inferred and no proposed action is applied to the graph.

An interval replacement requires `graphMapping.edge.validity.fromField` and `toField`, a source edge ID, proposed `from`/`to` values, and an exact expected state for each current endpoint. Omit `expectedFrom` or `expectedTo`, or set it to `null`, when the endpoint has no mapped value; the normalizer treats source JSON `null` as missing. Valid expected values are compared after the app's existing normalization; other invalid raw scalar values must match exactly. Proposed endpoints use a closed, inclusive interval and must satisfy `from <= to`. Each endpoint must normalize to a safe integer under the shared temporal parser, or both must be ISO dates (`YYYY-MM-DD`) / ISO timestamps with seconds, optional millisecond precision, and `Z` or an offset no larger than `±14:00`. Numeric endpoints may mix JSON numbers and numeric strings because the graph normalizer compares their normalized integer values. Date-only values are interpreted at UTC midnight; timestamps are normalized to milliseconds. Timezone-free date-times, locale-dependent strings, invalid calendar/clock values and mixed integer/date intervals are rejected to avoid machine-dependent or unit-mixed comparisons. Candidate node/edge IDs refer to source IDs and candidate attribute names must exist in the respective mapping. Values are strings, finite numbers or booleans; types are non-empty strings. Costs are positive safe integers and default to 1, and the maximum possible combined cost must also fit a safe integer. If no authorized combination satisfies every constraint, the panel reports that no feasible repair exists. Example values such as `person`, `institution`, and `works_at` are illustrative and must match the configured dataset.

### Signed triad balance

Schema version 2 can optionally classify all triangles in a signed, undirected graph. Configure an edge attribute alias and its exact JSON scalar values:

```json
{
  "schemaVersion": 2,
  "graphMapping": {
    "edge": {
      "idField": "$.id",
      "sourceField": "$.from",
      "targetField": "$.to",
      "direction": "undirected",
      "identity": "multigraph",
      "attributes": { "polarity": "$.polarity" }
    }
  },
  "graphAnalysis": {
    "signedTriads": {
      "attribute": "polarity",
      "positiveValues": ["+", "positive", 1],
      "negativeValues": ["-", "negative", -1]
    }
  }
}
```

The attribute alias must be declared in `graphMapping.edge.attributes`; positive and negative values must be non-empty, disjoint lists of strings, finite numbers or booleans. Matching preserves JSON scalar types (`1` is distinct from `"1"`). The graph direction must be declared explicitly as `undirected`. By default, every non-loop edge within the selected visible/group projection must have a recognized sign. For a mixed graph, optionally set `graphAnalysis.signedTriads.edgeTypes` to a non-empty list of exact relation labels and map `graphMapping.edge.typeField`; only those relation types enter the signed subgraph, and unrelated edge types are ignored by this task. Within the selected types, missing or unrecognized values disable the query and identify example edge IDs; they are not silently discarded. Omitting `edgeTypes` preserves the original all-types behavior. Self-loops are ignored because a triad uses three distinct nodes.

Parallel records with the same sign represent one dyad and all source IDs remain in its witness. Opposite signs on parallel records make that dyad ambiguous and block the query; the app does not choose a sign or average them. `identity: "multigraph"` preserves distinct source records when they matter. ASP classifies each complete three-node triangle as balanced when its three signs contain an even number of negative dyads, and unbalanced otherwise. The panel also reports the balanced-triangle share, computed as balanced complete triangles divided by all classified complete triangles; it is undefined when there are no complete triangles. This is a local structural summary, not a claim about sentiment, social causation, or balance of every cycle in the whole graph. Clicking a result highlights the three nodes and supporting source records; CSV export includes every result and the signed witness. **Isola testimone in 3D** temporarily hides other nodes and links in the visualization and frames the selected triangle. The graph projection and ASP results remain unchanged; the active witness can be toggled off or the complete view restored from the panel. The query uses the current projection and has cubic worst-case output in dense graphs, so the configured solver timeout still applies.

Run `npm run benchmark:signed-triads` to profile fixed-seed synthetic undirected graphs at increasing densities; `npm run benchmark:signed-triads:stress` adds larger, denser cases. The script checks ASP counts against an independent triangle/parity implementation, serializes the full CSV, checks its row count, and reports normalization, preparation, solver, parser, CSV build, grounding, and WASM linear-memory measurements. CSV timing covers in-memory serialization only, not Blob creation, browser download, or peak JavaScript heap. These local synthetic measurements are not a general scalability guarantee; WASM linear memory also excludes JavaScript heap and process RSS.

The Italian psychology graph does not provide positive/negative relation labels and therefore cannot use this task without new observations. Its existing clique results and untyped analyses remain available unchanged. The independently documented Gahuku-Gama Highland Tribes graph has 16 nodes and 58 undirected ties, with positive alliance (`rova`) and negative enmity (`hina`) labels. ASP agrees triad-by-triad with independent parity enumeration (68 complete triangles: 59 balanced, 9 unbalanced); the 59/68 ratio matches the triangle score documented by signnet. The retained source edge list, hash, and mapping notes are in `tests/fixtures/highland-tribes/`; the app-facing JSON preset is a row-for-row rendering described below. This validates a distinct signed domain without assigning signs to the Psychology graph.

If the graph also declares at least two `provenanceScenarios` and explicitly sets their `worldAssumption` to `finite-exhaustive-worlds`, the panel can compare signed-triad classifications across those worlds. It reruns the signed-triad ASP task on each scenario projection and matches triples by their unordered source node IDs. Results distinguish a stable balanced classification, a stable unbalanced classification, changes in balance, and worlds where no classification was produced. “Not classified” is not “unbalanced”; it means the scenario did not yield that complete triangle in the selected group and projection. Only triples classified in at least one world are listed, and each CSV row preserves the per-world outcomes and edge witnesses, including the configured edge-type subset. The scenario summary reports two balanced-triangle shares: each world's own share (`balancedTriads / classifiedTriads`), and a common-universe share computed over the same source-ID triples classified in every world. Each ratio is `null` when its denominator is empty. The first ratios may describe different sets of triangles; the common-universe ratios are directly comparable over their shared set. CSV headers stay unchanged; these common counts and ratios are included in the JSON summary field. Missing classifications in the observed union remain explicit and are never counted as unbalanced. The comparison is conditional on the analyst's exhaustive-world assumption, not a probability or source-trust score. Missing or conflicting signs within a scenario's selected cohort still block that world's query under the signed-triad prerequisites.

### Context-supported maximum groups

Schema v2 graphs can optionally configure `graphAnalysis.contextualClique` to find a largest set of typed focus nodes where every pair shares at least one typed context node through one of the configured undirected edge types. ASP derives the focus-context incidences from the mapped node and edge facts, then optimizes the focus-set cardinality. Different pairs may be supported by different contexts; the group does not need one context shared by every member. The optional group selector restricts focus nodes only, so context witnesses are not removed by that filter. `minimumSize` defaults to 3.

The task requires explicit node and edge type mappings and `graphMapping.edge.direction: "undirected"`. It runs on the current visible projection. By default clingo returns one proven maximum group; **Enumera tutti i gruppi massimi** requests complete `optN` enumeration and can be more expensive when many ties exist. Results preserve source IDs for each pair's context and both supporting edge records. The 3D view highlights group members, context nodes, and support records, and CSV export records each pair-context witness. This is a structural query over declared types: it does not establish that people collaborated, met, or formed a social community. The historical clique analysis remains available with its existing default semantics.

```json
{
  "graphAnalysis": {
    "contextualClique": {
      "focusNodeTypes": ["person"],
      "contextNodeTypes": ["place"],
      "edgeTypes": ["person-place"],
      "minimumSize": 3
    }
  }
}
```

The Psychology History Graph enables this optional query for people connected to places by `person-place` records. Its output means that each pair in a maximum group has at least one shared mapped place in the active projection; it does not add a collaboration or temporal interpretation.

### Configured typed motifs

Schema version 2 can also declare positive, role-based motif templates under `graphAnalysis.motifs`. A template requires node-type domains for each role and at least one typed edge pattern. The toolbar exposes **Motivi tipizzati ASP** only when at least one template is configured; the panel reports missing node/edge type mappings before a run.

Each returned positive instance is accompanied by a checkable witness: an injective assignment of source nodes to roles and the source edge records that satisfy every required pattern. Temporal templates additionally return either a common valid instant (`coValid`) or one record and mapped validity start per ordered pattern (`orderedByStart`). These witnesses establish the configured structural query, not a causal or historical claim.

For templates with many matches, **Conta istanze** runs an ASP aggregate and returns one exact total instead of enumerating and transferring every witness. Static and `coValid` templates count distinct role assignments; `orderedByStart` also distinguishes the selected edge-record and time tuple for each pattern, matching the regular enumerator's sequence semantics. Count results do not carry node or edge witnesses and therefore cannot be highlighted or exported as individual matches. The selected group, graph projection, direction, edge types, and temporal constraints are applied as in the regular query.

After an empty result, the panel also offers an opt-in why-not diagnosis. The ASP objective first maximizes assigned roles, then maximizes required patterns supported by existing edge records. Static templates report missing and unresolved relations and the records that do exist. Temporal templates add a final temporal objective: `coValid` selects a mapped interval boundary where the largest number of patterns are active together; `orderedByStart` selects valid supporting records with the fewest inversions between consecutive pattern positions. When `maximumSpan` is configured, exceeding it adds a temporal violation that the explanation reports separately. Patterns with no complete valid interval are reported separately from patterns that are inactive at the chosen `coValid` instant or violate the declared order. The panel and a separate CSV show the selected time/records and blockers. Ties yield one optimum. This diagnosis ranks explanations under the declared template; it does not suggest adding/removing edges or imply causal interventions, and it can be expensive on large graphs. The temporal why-not query is available only when temporal edge mappings are configured.

```json
{
  "graphAnalysis": {
    "motifs": [
      {
        "id": "shared-place",
        "label": "Two people connected to the same place",
        "roles": {
          "personA": { "nodeTypes": ["person"] },
          "personB": { "nodeTypes": ["person"] },
          "place": { "nodeTypes": ["institution", "association"] }
        },
        "edges": [
          { "sourceRole": "personA", "targetRole": "place", "edgeType": "affiliated_with" },
          { "sourceRole": "personB", "targetRole": "place", "edgeType": "affiliated_with" }
        ],
        "symmetricRoles": [["personA", "personB"]]
      }
    ]
  }
}
```

The example labels are illustrative: role types and edge types must match the current graph's explicit mappings. `symmetricRoles` is optional; it removes equivalent role permutations only when the roles have the same node-type domains and swapping them preserves the complete typed pattern. The task returns every role assignment, maps nodes and supporting edge records back to source IDs, and can highlight or export those witnesses. Parallel edges are retained as edge witnesses. On undirected graphs, a typed edge pattern can match either stored endpoint order; on directed graphs, its source and target roles must match the declared arrow. The optional group selector restricts every role to nodes in that group. Analysis runs on the currently visible graph projection (including active view filters), and the number of matches can grow quickly; `solver.taskTimeoutMs` limits a run, and a timed-out partial enumeration is not shown as complete. By default templates require only their listed positive edge patterns; they allow additional edges between assigned roles.

The Psychology History Graph configuration now enables one neutral structural template: two people connected to the same `place` through `person-place` records. Its roles are symmetric, so each unordered person pair is counted once per shared place. The query does not claim that the people collaborated, met there at the same time, or formed a social group. The graph's existing clique task remains the default analysis. Ordinary witness enumeration is available, and the aggregate counter returns an exact total without transferring every witness. The benchmark verifies complete enumeration and its supporting records, compares optional batches of eight first-role nodes with the single aggregate query, and checks both totals against an independent count. The measured single query is faster on this graph, so partitioning is left disabled in the Psychology configuration. Run `npm run benchmark:psychology-motif-count` to reproduce the checks on the checked-in case-study dataset.

Positive edge patterns may add an exact `attributes` map. Each key must be an alias in `graphMapping.edge.attributes`, and each value must be a JSON string, finite number, or boolean. For example, `{ "edgeType": "affiliated_with", "attributes": { "status": "confirmed", "verified": true } }` matches only records satisfying both mapped values; missing values do not match, and scalar types remain distinct. Enumeration, aggregate counts, why-not diagnostics, and explicitly configured counterfactual edge additions all use the same conditions. Candidate additions can supply their own mapped `attributes`; these remain hypothetical and are included in the witness/export. Attributes are optional, so existing templates and legacy clique results keep their prior semantics.

Run `npm run benchmark:temporal-motif-count` to reproduce the exact aggregate count and independent witness enumeration on the eight-hour SocioPatterns InVS window `[28800, 57600]` seconds. The command accepts `--from=<integer>` and `--to=<integer>` to profile another inclusive interval. It reports the one-model ASP result, wall and clingo timings, grounding counts, and WASM linear memory; the independent JavaScript enumeration checks role injectivity and strict start order. For large windows, `--skip-independent` omits that potentially expensive second implementation and reports `independentCheckSkipped: true`; the ASP result is then not cross-checked by that command. `--partition-starts=<size>`, `--partition-roles=<size>`, and `--partition-edges=<size>` run disjoint partitions by first-pattern start, first-role node, and first-pattern edge-record index; dimensions can be combined as a Cartesian plan. `--partition-index=<zero-based-index>` runs one selected plan entry and reports it as partial; `--progress` emits each completed partition to stderr. A partial plan selected with `--partition-index` or `--limit-partitions` requires `--skip-independent`; otherwise the command fails rather than imply a graph-wide cross-check. The benchmark sums counts only after every partition returns one complete model. These options are a benchmark aid, not an application timeout workaround: `--limit-partitions=<count>` deliberately reports only `partialCount` with `count: null`. Clingo's `Total − Solve` is only a pre-solve estimate that includes parsing and grounding, not a pure grounding timer. The count avoids large witness output, while its aggregate grounding can still consume substantial memory on dense or long windows.

Run `npm run benchmark:provenance-asp -- --edges=5000` to compare expanded textual provenance facts with compact batched facts and integer source IDs backed by a JavaScript dictionary. The synthetic query counts records associated with one explicitly selected source and verifies that the indexed pairs round-trip to the original source labels. It reports input bytes, clingo atoms/rules, wall time and WASM linear memory; it does not assign reliability or alternative-world semantics to sources and is not part of the app runtime. The edge count can be set from 1 to 10,000.

The complete InVS interval `[28800, 1016460]` seconds has been counted by ASP using disjoint first-edge batches. Reproduce the conservative run with `npm run benchmark:temporal-motif-count -- --from=28800 --to=1016460 --partition-edges=8`. On the recorded machine it returned 215,618,375 chains in 1,199,899 ms wall with 422,707,200 bytes peak WASM memory. Batch sizes 12 and 16 also returned the same independently checked total in 1,132,590 ms / 522,190,848 bytes and 1,044,653 ms / 842,334,208 bytes respectively. These are local measurements of WASM linear memory, not RSS or browser process memory; CLI measurements do not guarantee the same latency or memory profile in a browser.

The application can opt into sequential exact counting by adding `graphAnalysis.motifCount` to a schema v2 configuration:

```json
{
  "graphAnalysis": {
    "motifCount": {
      "partitionSize": 8,
      "maxDurationMs": 1800000
    }
  }
}
```

`partitionSize` must be an integer from 1 to 16 and `maxDurationMs` an integer from 1,000 to 1,800,000; if omitted, the total budget is 30 minutes. Each partition is separately bounded by `solver.taskTimeoutMs`. The partition key follows the count semantics: `orderedByStart` counts selected edge records and start times, so batches use the first pattern edge; static and `coValid` counts collapse supporting records into role assignments, so batches use the node assigned to the first role. The panel reports the active key and index range, completed batches, and lets users cancel. A total is displayed only when every partition returned one complete aggregate model. Cancellation, an incomplete model, a solver error, or an exhausted time budget discards all partial sums. If `graphAnalysis.motifCount` is absent, the existing single-query count path remains in effect. The option is deliberately opt-in: the full-file figures above are CLI measurements and do not establish a browser performance guarantee.

Roles may also require exact scalar values from aliases declared in graphMapping.node.attributes. For example, a role can be configured as { "nodeTypes": ["person"], "attributes": { "status": "verified", "seniority": 2 } }; both values must be present and have the same JSON scalar types and values. Enumeration, aggregate counts, why-not, and edge-addition counterfactuals all apply these node filters consistently. The required values are included in result details and structured CSV witnesses. Roles declared symmetric must have the same node types and node-attribute conditions, and swapping them must preserve the complete typed edge pattern.

A static template can additionally declare exact typed relationships that must be absent:

```json
{
  "id": "open-triad",
  "roles": {
    "source": { "nodeTypes": ["person"] },
    "middle": { "nodeTypes": ["person"] },
    "target": { "nodeTypes": ["person"] }
  },
  "edges": [
    { "sourceRole": "source", "targetRole": "middle", "edgeType": "knows" },
    { "sourceRole": "middle", "targetRole": "target", "edgeType": "knows" }
  ],
  "absentEdges": [
    { "sourceRole": "source", "targetRole": "target", "edgeType": "knows" }
  ],
  "closedWorld": true
}
```

`absentEdges` is rejected unless `closedWorld: true` is explicit. This is a researcher assertion that the current visible projection is complete for the listed typed relations; it is not inferred from missing JSON values. The task is available only when edge types are mapped for every edge record. On undirected graphs either endpoint order violates an absence condition; on directed graphs only the declared orientation does. Any parallel record of the forbidden type violates it. Other edge types remain allowed, so this is an explicit negative-pattern query, not a claim that the template describes the full induced subgraph. The positive result and CSV state the required absences and their scope. Why-not output reports present forbidden relations with their source edge IDs, and absences that cannot be checked because a role is unassigned. Temporal templates with absence conditions are currently rejected because the project has not defined whether absence means “never recorded”, “not valid at the selected instant”, or something else. The assumption applies after active view filters: filtering out an edge can make a relation absent in the analyzed projection, so this option must not be used when that projection is incomplete for the queried relation types.

For a typed induced motif over a finite relation vocabulary, use `inducedEdgeTypes` instead of listing each missing pair by hand:

```json
{
  "id": "induced-open-triad",
  "roles": {
    "left": { "nodeTypes": ["person"] },
    "middle": { "nodeTypes": ["person"] },
    "right": { "nodeTypes": ["person"] }
  },
  "edges": [
    { "sourceRole": "left", "targetRole": "middle", "edgeType": "knows" },
    { "sourceRole": "middle", "targetRole": "right", "edgeType": "knows" }
  ],
  "inducedEdgeTypes": ["knows"],
  "closedWorld": true
}
```

The compiler expands the vocabulary into negative ASP constraints for every role pair and listed type that is not already a required positive pattern. For undirected graphs it checks each unordered pair, including role self-pairs; for directed graphs it checks every ordered pair, including loops. Thus the example describes an open path with respect to `knows`. Types outside `inducedEdgeTypes` are outside this closed-world scope and are allowed unless separately constrained; positive `edges` outside the vocabulary still have to exist. The list is finite and explicit, so this is a typed induced subgraph relative to that vocabulary, not an assumption that every possible relation type is complete. It requires `closedWorld: true`, complete edge-type mapping, a static template, and data complete for those types in the current visible projection. Filters can affect the answer. Match, why-not, counterfactual and CSV output carry the generated absence conditions and the vocabulary.

An additional opt-in completion query is available after a positive motif query returns no instances, if `graphAnalysis.counterfactuals.edgeAdditions` lists hypothetical edges. Every candidate must have a unique ID, existing source and target node IDs, a literal edge type, and a positive safe-integer `cost`. Candidate node IDs refer to the mapped source IDs (or normalized graph IDs). The query considers only candidates whose endpoints are in the current visible projection and selected motif group; excluded candidates are counted in the panel. Unknown/ambiguous node references, duplicate candidate IDs, and IDs colliding with observed edges are errors. For temporal motifs each candidate also needs a complete, valid interval.

The ASP optimization finds a minimum-total-cost subset of those candidates that makes the configured motif true, including all configured closed-world absence conditions. A candidate that would create a forbidden typed relation cannot be selected. It returns an observed-role assignment, observed supporting edge IDs, and the hypothetical candidate IDs with their pattern positions and declared intervals. A separate CSV exports the proposal. The proposed edges are never inserted into the graph or saved, and highlighting shows only the assigned nodes and observed supporting edges. If no permitted candidate combination works, the UI reports that result; an interrupted or unproven optimization is not presented as an optimum. Costs rank scenarios only within the configured candidate set: they are not probabilities, confidence scores, or causal effects. It does not add arbitrary edges, remove observed data, or claim that a candidate relation is historically true.

```json
{
  "graphAnalysis": {
    "counterfactuals": {
      "edgeAdditions": [
        {
          "id": "candidate-affiliation-1",
          "sourceNodeId": "person-2",
          "targetNodeId": "institution-1",
          "edgeType": "affiliated_with",
          "cost": 2,
          "validity": { "from": 2000, "to": 2005 }
        }
      ]
    }
  }
}
```

`validity` is required only if the selected motif is temporal, and its endpoints use the same parser as observed intervals: safe-integer numbers or numeric strings, ISO dates, or explicitly zoned ISO date-times. Invalid dates, timezone-free date-times, locale-dependent strings, and mixed integer/date intervals are rejected. This feature is data-driven: the IDs, type, interval, and cost have meaning only if the graph configuration and researcher-provided candidate set support them. The psychology case remains unchanged unless such candidates are explicitly supplied; the example values above are illustrative.

### Typed-path completion counterfactual

The typed-path panel can also search for a minimum-cost subset of explicitly configured `graphAnalysis.counterfactuals.edgeAdditions` that enables a simple path between the selected terminal nodes, using the exact ordered edge-type sequence and the graph's declared direction. Each selected candidate must have a unique ID, resolve to existing nodes, use a type in the path sequence, and have a positive safe-integer cost. In static mode, candidates omit `validity`; when `coValid` or `orderedByStart` is selected, every candidate must instead provide a valid ordered `validity.from`/`to` interval in the same integer/date domain as observed records. The same solver call returns both the path witness and the selected additions; users can enumerate all minimum-cost addition sets and export the result to CSV.

Only candidates whose endpoints belong to the current visible projection and selected group are eligible. In static mode, candidates already represented by an observed edge with the same type and relevant direction are excluded; other edge types on that pair do not make the candidate redundant. Temporal modes permit a distinct candidate record on an already represented pair because its validity interval may add support at a time when observed records are inactive. A zero-cost proposal is returned when the typed path already exists, including when no configured candidates remain eligible. For static infeasibility, a second ASP query reports exact-sequence reachability after every prefix in the maximal graph containing all observed edges and all eligible declared candidates. An independent checker recomputes the prefix layers before the UI presents or exports them. The diagnosis identifies the first prefix with no reachable node, or distinguishes a completed typed walk from the absence of a simple path when reaching the destination requires revisiting a node. This diagnostic query shares the primary task deadline; if it cannot finish or its certificate fails validation, the app keeps the primary infeasibility result and reports why the details are unavailable. Temporal infeasibility does not currently receive a why-not certificate. Candidate costs rank only the declared scenarios; additions remain hypothetical and do not establish that a relationship exists or caused an outcome. The Psychology dataset is unchanged unless suitable candidates and relation types are explicitly supplied.

### Structural k-plex completion counterfactual

After a maximum k-plex query, select one returned witness and choose a target `t` from 1 through the query's `s`. The app fixes that witness's node set and asks ASP for a minimum-total-cost subset of `graphAnalysis.counterfactuals.edgeAdditions` that makes those nodes a `t`-plex. A target below the original `s` is a stricter requirement; `t = s` can return the unchanged witness at cost zero. A witness already meeting the target also returns an empty, zero-cost proposal.

Only candidates with both endpoints in the selected witness, in the current visible projection, and not already adjacent in that projection are considered. Candidate IDs must be unique and must not collide with observed edge IDs; source and target references must resolve unambiguously. Candidate costs must be positive safe integers, and their configured total must fit the safe-integer range. A candidate's `edgeType` is preserved in the proposal as descriptive metadata; this structural query reasons over undirected adjacency and does not constrain the result by relation type. Candidate `validity` intervals are not interpreted by this static query. Existing visibility, type, group, timeline, and confidence filters define the observed projection supplied to ASP.

The result is a scenario over the declared candidate set, not a prediction that an edge exists or an intervention that should be made. Proposed edges are never inserted into the graph or source JSON. The UI highlights only their endpoint nodes and exports each minimum-cost proposal to CSV. When no candidate combination can meet the target, a second ASP query lists missing cohort pairs with no authorized candidate and every node whose count of such pairs is at least `t`. The UI independently recomputes and checks that certificate against the visible projection before showing, highlighting, or exporting it. The diagnostic query shares the original task-wide solver deadline; if no time remains or verification fails, the panel retains the proven infeasibility result and explains why its detailed certificate is unavailable. Timeout or an unproven search is not shown as an optimum. Costs are ranking values supplied by the dataset author, not probabilities or causal effects.

### Structural k-plex maximum-membership counterfactual

The k-plex panel can also ask for the minimum-cost declared edge additions that make a selected node belong to **at least one maximum s-plex**. This query does not keep a previously selected cohort fixed: each hypothetical graph is evaluated over the full current candidate domain, filtered by visibility and the selected group. Candidate endpoints outside that domain and pairs already adjacent in the visible projection are excluded. Candidate type is retained as descriptive metadata; the structural encoding uses undirected adjacency, and candidate validity intervals do not change this static query.

For each candidate subset, the app runs two clingo optimization queries on the same modified graph: the global maximum s-plex and the maximum s-plex with the target forced in. It accepts a subset only when both optima are proven and their cardinalities are equal. The ASP selector tests subsets in nondecreasing total cost, so the first accepted subset is minimum-cost among the declared candidates. If no candidates remain eligible, it checks whether the target already belongs to a maximum s-plex; otherwise, it reports that no declared subset works. This proves membership in at least one optimum, not membership in every optimum.

The exact search has an explicit cap of eight eligible candidate edges (up to 256 subsets) and shares the configured task-wide timeout across selection and both optimization queries. A timeout or unproven optimum discards the result. The UI lists selected hypothetical edges, highlights the target witness and affected endpoints, and exports the certificate to CSV; it never draws those hypothetical edges into the observed 3D graph. Costs are analyst-supplied ranking values, not probabilities or causal effects. The result is specific to the declared candidate set, current projection, group, and `s` value.

### Structural k-core completion counterfactual

After a k-core query on an undirected graph, select one returned witness and choose a target `k` greater than or equal to the source threshold. The app fixes that node set and asks ASP for a minimum-total-cost subset of the same declared `edgeAdditions` that gives every node at least the target number of distinct neighbors inside the witness. It does not add or remove witness nodes. If the witness already meets the target, ASP returns an empty, zero-cost proposal. If no completion exists, a second ASP query identifies every blocker whose maximum possible internal degree—using all distinct observed and authorized candidate neighbors—remains below `k`. An independent check validates the current and maximum degrees against the visible projection and candidate domain before the UI highlights or exports the certificate. The diagnostic query shares the original task deadline; if the certificate cannot be completed or verified, the proven infeasibility remains visible with a reason, without presenting a partial certificate.

Candidate resolution, projection filtering, cost validation, hypothetical-only results, highlighting, CSV export, and static treatment of `validity` follow the k-plex completion query above. This counterfactual currently uses undirected adjacency only. Directed k-core modes (`in`, `out`, `mutual`) are not silently converted to this semantics and the UI disables the query for directed graphs. The target degree is bounded by the available witness and declared candidates; an unreachable higher target is reported as infeasible.

### Structural k-core membership counterfactual

The k-core panel also supports a target-node query over the current visible/group candidate domain. It asks ASP for the minimum-cost subset of declared `edgeAdditions` that lets the selected node belong to a k-core at the target threshold. ASP chooses a degree-valid witness subset, so nodes outside that witness need not be modified. The witness is a certificate of membership, not a claim that it lists the entire maximal k-core after augmentation. If the target already belongs to the requested core, the minimum-cost answer is the empty addition set. When all optima are requested, projection enumerates distinct optimal addition sets and avoids duplicate outputs caused by alternate witness subsets.

The query preserves the same explicit-candidate, cost, projection, undirected-adjacency, and hypothetical-only semantics described above. Candidate additions are restricted to endpoints in the current group/projection; edge types and `validity` intervals do not affect this static k-core query. A separate CSV column records the target and the ASP-certified witness nodes. If no candidate subset can make the node a member, ASP considers the graph containing every authorized candidate and computes synchronous peeling rounds only through the target's elimination. That prefix proves the target cannot survive under any allowed subset, since deleting candidate edges cannot restore k-core membership; later rounds do not strengthen this target-specific conclusion. An independent verifier recomputes every shown round and active-neighbor witness. The prefix can be highlighted and exported, with its scope recorded in the CSV. All queries share the completion deadline, and an incomplete why-not query does not replace the proven UNSAT result. The app batches up to four synchronous rounds per ASP invocation for deep prefixes; the final batch is capped at the independently computed target round, and the certificate is still checked against the full independent peeling. Early targets keep the existing one-round encoding. Run `npm run benchmark:kcore-membership-why-not`; it profiles a synthetic long-tail graph at 1,000 nodes by default, with the target at the leaf. `npm run benchmark:kcore-membership-why-not:late` uses one-round calls on a 500-node graph with the target at the base of the tail; `npm run benchmark:kcore-membership-why-not:late:batched` compares four-round calls on that same fixture. Pass `--full`, `--batch-size=N` (1–32), or another `--nodes=N` directly to the script to vary the profile. These fixtures are performance probes, not representative claims about every graph.

To require **co-validity**, add `"temporal": { "semantics": "coValid" }` to a template. It requires complete mapped edge intervals. Each returned instance has one earliest mapped instant contained in a closed interval for every required typed edge pattern; the exported/highlightable witnesses are the edge records active at that instant. This is not an event-order or duration-window query, and it carries no causal or historical interpretation by itself. Those semantics depend on data mappings and template configuration, so no psychology-specific type names are built into ASP.

To compare relationship onsets in the declared pattern order, use `"temporal": { "semantics": "orderedByStart" }`; set `"strict": true` to require strictly increasing starts. This mode also requires complete, valid mapped edge intervals. The order is the order of entries in the template's `edges` array, and the compared value for a supporting record is the mapped start of its validity interval (`edge_valid_from`). By default the constraint is non-strict (`start[i] <= start[i + 1]`); strict mode uses `<`. It does not compare interval ends, require intervals to be disjoint, or interpret a validity start as an independently observed event timestamp. The ASP query chooses one supporting edge record for each pattern edge. Different valid combinations of parallel records are returned as distinct temporal witnesses, with each record ID and mapped start shown in the result and CSV. This can increase enumeration substantially; the configured task timeout prevents partial results from being presented as complete. An ordered template's role symmetry is accepted only when swapping roles preserves the declared edge sequence, since sequence position is meaningful. These semantics are a structural query over mapped validity starts, not evidence of causation or a claim about historical events.

An ordered template may also declare `"maximumSpan": { "value": 500, "unit": "seconds" }` inside `temporal`. It bounds the elapsed time from the first pattern's selected start to the last pattern's selected start, inclusively; it does not bound each adjacent gap separately. Use a non-negative integer and one of `milliseconds`, `seconds`, `minutes`, `hours`, or `days`. Each supplied unit value must be a JSON string equal to one of those names; arrays, numbers, and booleans are rejected rather than coerced. ISO dates are converted from UTC milliseconds exactly. Numeric timestamps need an explicit source unit in `graphMapping.edge.validity.numericUnit` (for example, `"seconds"` for the InVS `t` values), set alongside `fromField` and `toField`; values in other units are converted exactly, without rounding. If the domain is mixed, the unit is undeclared for numeric values, the requested unit cannot represent the timestamps exactly, or the resulting ASP metric exceeds clingo's integer range, the task is rejected with an explanation rather than silently comparing ranks or approximating. The same constraint is applied by enumeration, exact aggregate count, temporal why-not, and temporal completion counterfactuals. Omitting `maximumSpan` preserves the existing ordered-start semantics.

Example template fragment:

```json
{
  "temporal": {
    "semantics": "orderedByStart",
    "strict": true,
    "maximumSpan": { "value": 500, "unit": "seconds" }
  },
  "edges": [
    { "sourceRole": "initiator", "targetRole": "context", "edgeType": "initiator-context" },
    { "sourceRole": "recipient", "targetRole": "context", "edgeType": "recipient-context" }
  ]
}
```

The temporal program is tested with the shipped clingo-WASM worker on synthetic intervals and on a small, attributed fixture derived from the public-domain SocioPatterns InVS workplace dataset. Its 20-second observations are mapped to the provider-documented intervals `[t − 20 s, t]`; the mapping declares `numericUnit: "seconds"`. A strictly ordered three-contact chain is found by `orderedByStart`, `coValid` correctly returns no shared instant, and an inclusive 500-second maximum span agrees across enumeration, aggregation, why-not diagnosis, and an edge-addition counterfactual. This validates the configured interval semantics for sensor-recorded proximity, not friendship or persistent social ties. The fixture source rows, archive hash, attribution, and citation are documented in `tests/fixtures/SOCIOPATTERNS.md`. The psychology graph does not map edge dates, and the Davis fixture does not date individual attendance records, so neither is used to claim a domain result for temporal ordering.

The Sandbox JSON editor offers an optional `SocioPatterns InVS · 45 nodi, 134 contatti` preset for the inclusive 100-minute interval `[28800, 34800]` seconds. Selection includes source contact intervals that intersect that window and retains each full `[t − 20, t]` interval. The boundary record `[34800, 34820]` is therefore included intact, and the displayed data extent ends at 34,820 seconds. The preset includes mapped contact intervals, a general strict four-role chain, and a second template filtered to participant IDs 80, 95, 118, and 15. The second template produces a why-not diagnosis for the final pair missing from this window; ASP enumerates five optimal ordered support ties in the exhaustive regression, while the UI displays one optimal witness. This projection does not claim that the pair is absent from the entire dataset. `Reset example` continues to restore the original three-node Sandbox sample. The regression reconstructs the preset from the complete source file, checks the 2,101-chain ASP aggregate, and verifies the five why-not ties against independent enumeration.

The editor also offers `SocioPatterns InVS completo · 92 nodi, 9.827 contatti`. It is loaded on demand, preserves every source row and its documented `[t − 20, t]` interval, and configures exact temporal motif counting in 1,229 disjoint batches of eight first-pattern records with a 30-minute overall budget. Its full-period ASP total is 215,618,375, cross-checked by independent enumeration in the CLI benchmark above; that total counts ordered contact-record chains and does not imply friendship or persistent ties. On the measured production browser, the UI completed all 1,229 batches in 1,235,849 ms and reported 418.13 MiB peak linear WASM memory. This is a local device measurement, excludes JavaScript heap, graph objects, DOM and browser process RSS, and does not guarantee the same latency or memory on other devices. The regression compares every generated participant and contact record with the retained source file and verifies the partition plan. The preset also reduces person icon size to 7 and ring scale to 4.5 for this dense graph. The preset enables display-only aggregation: after timeline and other filters, those records render as 755 lines for the 755 participant pairs. Tooltips retain access to every represented source ID, and ASP highlights match each underlying record; exports and solver facts remain separate. The force layout uses this reduced visual link set, so its node positions may differ. The preset also sets `forces.nodeCollisionRadius` to 7.5; this optional positive radius enables a 3D collision force that separates node centers while preserving the normal layout for configs that omit the option. It applies a minimum separation to node centers in 3D, but cannot remove every overlap in the 2D projection of a dense network.

The same full InVS preset can be analyzed with the static undirected k-core task. Collapsing repeated contacts only for the distinct-neighbor degree gives 755 participant pairs over the full observation period. At the maximum threshold `k = 11`, ASP returns the unique 64-participant core, matching the independent core-number profile. The production UI reports 331.4 ms and 17.25 MiB linear WASM memory for this run. This means each returned participant has at least 11 distinct observed contacts with other members somewhere in the full period; it does not mean those contacts occurred simultaneously or that the core is a friendship community. The source records and temporal motif query remain unchanged.

Run `npm run benchmark:temporal-motifs` to reproduce a synthetic positive-query enumeration check. For temporal why-not queries, `npm run benchmark:temporal-motif-why-not` creates equally optimal near-matches, repeats the UI-style `opt` selection three times, and checks that the chosen witness is stable. The `:stress` variant scales disjoint chains to 256 results and also tests a complete four-layer directed graph through 8 candidates per role (32 nodes, 192 edges, and 4,096 tied role assignments); `optN` must enumerate every optimum completely in both shapes. The parser collapses duplicate semantic diagnostics while retaining distinct role, edge, and temporal evidence; the benchmark reports raw solver records separately from distinct models and near-matches. Both benchmarks report wall/solver timings, grounding counts, and WASM linear-memory separately. Clingo does not expose a dedicated grounding timer here: `Total − Solve` includes parsing, grounding, and setup and is only a pre-solve estimate. The harness cannot attribute the browser Worker's JavaScript heap or total resident memory. The dates and ties are synthetic; these runs are scaling diagnostics, not evidence about the psychology graph or a historical domain.

Run `npm run benchmark:invs-temporal-motif-why-not` for one domain-backed why-not query over all 92 participants and 9,827 InVS contact records. It selects four anonymous participant IDs whose requested three-contact chain lacks its final pair; ASP and an independent record-pair enumeration agree on 100 optimal, strictly ordered support combinations. Three `opt` runs return the same selected witness, and `optN` proves and enumerates all 100 distinct near-matches (101 raw witness records, with the parser collapsing one duplicate diagnostic). On the recorded local run, the compact program is 570,741 bytes, `opt` takes 175 ms median, `optN` 195 ms, and peak linear WASM memory is 21,757,952 bytes. These are Node harness measurements using the shipped clingo-WASM worker, not browser latency or total process memory. The intervals come from the provider's documented `[t − 20 s, t]` observations; the query describes those records and does not infer friendship, influence, persistence, or causality.

---

## 🧪 Minimal Graph Example

```json
{
  "nodes": [
    {
      "id": "alice_rossi",
      "label": "Alice Rossi",
      "type": "actor",
      "data": {
        "active_from": 2018,
        "active_to": 2024,
        "affiliations": [
          { "group": "Network Analysis" }
        ]
      }
    },
    {
      "id": "bruno_verdi",
      "label": "Bruno Verdi",
      "type": "actor",
      "data": {
        "active_from": 2019,
        "active_to": 2023,
        "affiliations": [
          { "group": "Network Analysis" },
          { "group": "Cybersecurity" }
        ]
      }
    },
    {
      "id": "carla_bianchi",
      "label": "Carla Bianchi",
      "type": "actor",
      "data": {
        "active_from": 2020,
        "active_to": 2025,
        "affiliations": [
          { "group": "Social Analysis" },
          { "group": "Network Analysis" }
        ]
      }
    }
  ],
  "edges": [
    { "source": "alice_rossi", "target": "bruno_verdi" },
    { "source": "alice_rossi", "target": "carla_bianchi" },
    { "source": "bruno_verdi", "target": "carla_bianchi" }
  ]
}
```

This graph contains three actor nodes and three edges. Since all actors are pairwise connected, the structural graph forms a triangle.

---

## ⚙️ Configuration JSON

The configuration defines how each node type is interpreted.

Example:

```json
{
  "nodeTypes": {
    "actor": {
      "timeline": {
        "startField": "$.data.active_from",
        "endField": "$.data.active_to"
      },
      "group": "$.data.affiliations[*].group"
    }
  }
}
```

The legacy keys `macroAreaField` (node types), `filters.macroAreas` and `solver.features.macroFilter` are still accepted as aliases of `group`, `filters.groups` and `solver.features.groupFilter`.

This configuration means that:

- temporal information is extracted from `$.data.active_from` and `$.data.active_to`;
- semantic group values are extracted from `$.data.affiliations[*].group`;
- extracted groups can be used to populate filters and generate ASP facts.

The timeline slider is opt-in through `features.timeline: true`. It is hidden by default, so a graph without mapped temporal fields does not inherit a synthetic date range from the application.

For schema v2 edge-time projection, declare the edge interval fields explicitly:

```json
{
  "schemaVersion": 2,
  "features": { "timeline": true },
  "graphMapping": {
    "node": { "idField": "$.id", "typeField": "$.type" },
    "edge": {
      "sourceField": "$.source",
      "targetField": "$.target",
      "direction": "undirected",
      "identity": "multigraph",
      "validity": {
        "fromField": "$.validFrom",
        "toField": "$.validTo"
      }
    }
  }
}
```

The interval uses one comparable time domain (for example, integer years or supported ISO dates). The mapping must be valid for every edge before the edge-time slider becomes available. The selected window is inclusive at both ends. Node timeline mappings and edge validity mappings can be combined; each affects its corresponding part of the graph projection. Semantic fields such as `group`, `timeline`, and `alwaysVisible` must be declared in the graph configuration. Application defaults may supply presentation styles and icons, but do not implicitly map those semantics onto a generic graph that happens to use a built-in type name such as `person` or `place`.

The synthetic four-node example in [`temporal-edge-projection.json`](src/lib/kliqueasp/data/examples/temporal-edge-projection.json) and [`temporal-edge-projection.config.json`](src/lib/kliqueasp/data/examples/temporal-edge-projection.config.json) demonstrates edge intervals across three windows and optional `colors.edgeTypes` styles keyed by the exact mapped relation labels. Its dates and relation labels are test values, not annotations for a real network.

The Sandbox JSON Editor offers optional presets for Davis Southern Women, Zachary Karate Club, the Gahuku-Gama signed network, and the synthetic temporal-edge graph. Each preset loads its dataset and graph mapping together; **Reset example** restores the original three-node legacy sample. The Gahuku-Gama preset preserves all 58 source ties as separate records, maps the source sign (`+1`/`-1`) explicitly to positive/negative polarity, and filters the signed-triad task to its declared `rova`/`hina` edge types. It is a distinct historical dataset, not an extension or annotation of the Psychology graph; attribution, source hash, and license references are documented in [`tests/fixtures/highland-tribes/README.md`](tests/fixtures/highland-tribes/README.md).

---

## 🧭 JSONPath-Like Metadata Mapping

KliqueASP supports a lightweight JSONPath-like syntax for extracting nested values.

Supported examples include:

```text
roles[].macro_area
roles[*].macro_area
data.roles[].macro_area
$.data.roles[*].macro_area
```

When a path does not start with `$` or `data.`, it is interpreted as relative to `node.data`.

For example:

```text
roles[].macro_area
```

is interpreted as:

```text
$.data.roles[*].macro_area
```

---

## 🧩 ASP Reasoning Workflow

KliqueASP translates the current visible graph into ASP facts.

Visible nodes become `node/1` facts:

```prolog
node(1).
node(2).
node(3).
```

Visible edges become symmetric `edge/2` facts:

```prolog
edge(1,2).
edge(2,1).
edge(1,3).
edge(3,1).
```

Semantic groups extracted through the `group` mapping become `group/2` facts, with the group value as an ASP string:

```prolog
group(1,"Psicologia").
group(3,"Psicologia").
```

The default encoding (`cliqueMode: "maximal"`) enumerates maximal cliques:

```prolog
{ in(V) : node(V) }.

:- in(U), in(V), U < V, not edge(U,V).

out(W) :- node(W), in(V), V != W, not edge(W,V).
:- node(W), not in(W), not out(W).

#show in/1.
```

With `cliqueMode: "all"` or `"maximum"` the maximality rules are replaced by the optimization statement, and the solver is run with `--opt-mode=enum` or `--opt-mode=optN` respectively:

```prolog
{ in(V) : node(V) }.

:- in(U), in(V), U < V, not edge(U,V).

#maximize { 1,V : in(V) }.

#show in/1.
```

When a semantic group is selected in the solver panel, the search space is restricted to the nodes of that group (here with the maximal encoding):

```prolog
valid(V) :- node(V), group(V, "Psicologia").

{ in(V) : valid(V) }.

:- in(U), in(V), U < V, not edge(U,V).

out(W) :- valid(W), in(V), V != W, not edge(W,V).
:- valid(W), not in(W), not out(W).

#show in/1.
```

This `edge/2` example shows the legacy undirected profile: duplicated `A–B` / `B–A` entries are merged when the graph is loaded. In schema v2, mapped directed graphs retain arc direction and edge-record identity in the ASP facts; each task checks that its required projection is available instead of silently changing the graph's meaning.

The answer sets are mapped back to graph node identifiers and highlighted in the 3D visualization.

---

## 🖥️ Interface Highlights

The interface includes:
- Display-only neighborhood isolation around the selected node (1–3 hops); directed graphs can traverse weakly, outgoing, or incoming edges. It renders the induced subgraph to reduce visual clutter while ASP analyses, results, source data, and exports continue to use the full filtered projection. The panel reports the displayed record/line counts and can restore the full projection; selecting an analysis witness restores the full view before highlighting it.
- Optional aggregation of parallel links in the 3D view (`features.aggregateParallelEdgesForDisplay: true`); a status badge reports visible records versus drawn lines, and each line's tooltip reports its represented record count and source IDs. ASP, source links, and exports retain individual records; only the renderer and its force layout use the reduced visual link set.
- Optional relation coloring via `colors.edgeTypes`, an object mapping exact edge type values to CSS colors. Only configured types present in the current projection appear in the legend; hovering an edge shows its type, endpoints, direction and source ID. Omitting the mapping preserves the default link style, and the colors affect only the 3D view.

The Psychology case study maps its literal edge categories `person-person` and `person-place` to separate 3D colors. These labels describe the categories present in the source data; the color mapping adds no interpretation of the underlying relations.
- Optional 3D node collision in the force layout via a positive `forces.nodeCollisionRadius`; configs that omit it preserve the default layout.
- `graph.linkOpacity` and `graph.linkWidth` configure rendered lines without changing edge records or ASP facts; the full InVS preset lowers line opacity while retaining the default width.
- Optional `Adatta rete` camera fit via `features.fitGraphToView: true`; it is enabled on the dense InVS preset, refits again when the force layout stops, and is absent on other configs.

- 🔍 node search with autocomplete;
- 🧭 neighborhood navigation;
- 🏷️ optional show/hide control for node labels on dense graphs (`features.labelVisibilityToggle: true`); labels are visible by default, and a graph can set `features.nodeLabelsVisibleByDefault: false` to start with labels hidden;
- 🧱 type filters;
- 🏷️ semantic filters;
- ⏳ timeline slider;
- 📌 selected-node information panel;
- 🧵 navigation history;
- 🧠 ASP solver panel;
- 💡 clique highlighting;
- 📊 clique statistics and histogram;
- 🔄 reset and clear-highlight controls.

---

## 🛠️ Run Locally

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Build the production version:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

To preview the static build using its GitHub Pages base path (`/KliqueASP`) locally, run:

```bash
npm run preview:base
```

---

## 🧠 Why ASP?

ASP is useful when graph analysis requires more than simple structural filtering.

With ASP, constraints can be expressed declaratively and inspected directly.

In KliqueASP, the graph and its metadata are translated into logical facts, while the reasoning task is encoded as a compact logic program.

This makes the framework suitable for exploratory scenarios where users need to test structural, semantic, and temporal hypotheses over heterogeneous graphs.

---

## 🎯 Current Focus

KliqueASP preserves maximum clique detection as the original case study while extending the same data-driven pipeline to additional graph structures and constraints:

```text
Graph projection → ASP fact generation → Client-side solving → Visual feedback
```

The project does not claim a new clique-detection algorithm. Its focus is the integration of optional graph mappings, explicit ASP encodings, witness inspection, and visual projections while keeping the original Psychology History Graph analysis reproducible.

---

## Automated verification

Run the project checks with:

```sh
npm test
npm run check
npm run build
```

The test suite runs the shipped clingo-WASM worker and compares ASP results with independent small-graph references. A full SocioPatterns InVS 2013 import regression maps 92 participant IDs and 9,827 observed contact records, checks ID/type/interval preservation and adjacency counts in ASP, and keeps the compact data plus summary query below the worker's measured input boundary. In a 100-minute temporal projection with 45 participants and 134 contact records, the ASP query returns 2,101 strict four-role chains; every role, edge ID, and start time matches independent enumeration. A separate three-record fixture checks `orderedByStart` and `coValid` semantics against the dataset's documented 20-second contact intervals; these tests do not claim to enumerate motifs across the whole workplace network. The suite also maps the checked-in Zachary Karate Club fixture (34 nodes, 78 undirected edges) through schema v2 and compares its ASP k=3 core (22 nodes) with iterative peeling. The source `club` labels are retained only as mapped node attributes; the fixture does not invent edge types, dates, or weights, and the labels are not treated as ground-truth communities. The independent branch-and-bound s-plex reference is checked against exhaustive search for s=1,2 on all 64 simple four-node graphs; the ASP binary feasibility search is checked against exhaustive maxima for s=1,2,3 on the same graphs. Psychology regressions prove s=3 size 7, s=4 size 8, s=5 size 9, s=6 size 10, s=7 size 11, s=8 size 12 and s=9 size 13 with independent branch-and-bound references and validate each ASP witness. Karate Club regressions prove s=3 size 6, s=4 size 8, s=5 size 9, s=6,7 size 10, s=8 size 11 and s=9 size 12 against the same exact reference. The Davis Southern Women fixture also maps the bipartite woman-event incidences as typed attendance edges and checks 322 ASP shared-event motifs against an independent incidence enumeration; its records have no mapped event dates, so temporal motifs remain unavailable. A typed one-edge path from Evelyn Jefferson to E1 also returns the original attendance edge ID. Sources: [NetworkX documentation](https://networkx.org/documentation/networkx-3.7/reference/generated/networkx.generators.social.davis_southern_women_graph.html), [NetworkX source](https://networkx.org/documentation/networkx-3.7/_modules/networkx/generators/social.html), and [statnet.data documentation](https://rdrr.io/github/statnet/statnet.data/man/davis.html).

## 🗺️ Roadmap

The detailed implementation status and evidence are tracked in [`IDEA1.MD`](IDEA1.MD). Remaining work includes measuring exact modularity on larger projections without presenting an unproven partition as optimal, completing the visual audit across remaining views and responsive states, and validating temporal or multi-source interpretations only when suitable domain data is available. The Psychology History Graph currently has no mapped edge dates or provenance, so it remains the preserved structural case study rather than evidence for those interpretations.

---

## 📄 Academic Context

KliqueASP was developed as part of a research work on declarative reasoning over heterogeneous Knowledge Graphs.

The associated paper presents the framework as a browser-based, data-driven system for interactive 3D Knowledge Graph exploration and ASP-based clique detection.

The system demonstrates how structural, temporal, and semantic constraints can be combined in an interactive reasoning workflow.

---

## 📚 Citation

If you use KliqueASP in academic work, please cite the associated paper:

```bibtex
@inproceedings{kliqueasp2026,
  title     = {A Declarative Framework for Constrained Clique Detection in Heterogeneous Knowledge Graphs via ASP},
  author    = {Alviano, Mario and Sestito, Pierpaolo and Bilotta, Eleonora},
  booktitle = {CILC'26: The 41st Italian Conference on Computational Logic},
  year      = {2026},
  address   = {Ferrara, Italy}
}
```

---

## 📜 License

This repository is released under the license specified in the project.

---

## 🌐 GitHub Pages Demo

These are the canonical URLs generated by the current static build. In a read-only check on 2026-10-21, GitHub Pages still served an older build: `/Sandbox/` and `/PsychologyHistoryGraph/` returned 404, and its JavaScript asset hashes did not match this checkout. The current build now emits directory `index.html` files for both routes. Recheck these URLs after publishing the updated `build/` output.

The workflow in `.github/workflows/pages.yml` runs the Svelte check, full test suite, and static build on pull requests and pushes to `main`. Pushes to `main` and manual runs from `main` also deploy the verified `build/` artifact to the `github-pages` environment. The workflow must be present on GitHub and Pages must use the Actions publishing source before a remote deployment can be verified.

The site has three entry points:

- **Home / Easter Egg**  
  https://pierpaolosestito-dev.github.io/KliqueASP/

  Shows the KliqueASP landing graph. If no dataset is loaded, the framework displays the built-in KliqueASP easter egg graph.

- **KliqueASP Sandbox**  
  https://pierpaolosestito-dev.github.io/KliqueASP/Sandbox/

  Provides an interactive sandbox where users can edit both the graph configuration JSON and the dataset JSON directly from the browser, then reload the visualization.

- **Psychology History Graph**  
  https://pierpaolosestito-dev.github.io/KliqueASP/PsychologyHistoryGraph/

  Loads the static case-study dataset and configuration for the Italian Psychology History Knowledge Graph.

### Optional modularity topology counterfactual

`graphAnalysis.communities.topologyCounterfactuals.edgeEdits` optionally declares the finite edge edits considered by a pair co-assignment counterfactual. An `add` candidate has an `id`, `sourceNodeId`, `targetNodeId`, and positive integer `cost`; when weighted modularity is enabled it must also specify a positive `weight`. A `remove` candidate has an `id`, a stable source-record `edgeId`, and positive integer `cost`. Up to eight candidates are accepted.

For the selected pair and target relation (`always`, `sometimes`, or `never`), clingo proves minimum-cost edit subsets in cost order. Each modified graph is classified with two exact modularity optimization queries, one imposing must-link and the other cannot-link. Candidate selection and both queries share `solver.taskTimeoutMs`; timeout or an unproven/incomplete result yields no minimum claim. Candidates outside the current visible/group projection are excluded. Proposed edits never mutate the imported graph, and edit cost is separate from the modularity objective. If several minimum-cost subsets work, the result returns one of them.

```json
{
  "graphAnalysis": {
    "communities": {
      "topologyCounterfactuals": {
        "edgeEdits": [
          { "id": "add-a-c", "action": "add", "sourceNodeId": "a", "targetNodeId": "c", "cost": 2 },
          { "id": "remove-e7", "action": "remove", "edgeId": "e7", "cost": 1 }
        ]
      }
    }
  }
}
```

This feature is absent by default. Its output is conditional on the declared candidate list and costs; it is not a social recommendation, probability, or causal claim.
