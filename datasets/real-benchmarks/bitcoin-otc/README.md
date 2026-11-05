# Bitcoin OTC example in KliqueASP

## Source and citation

The input is SNAP's **Bitcoin OTC trust weighted signed network**, a directed network of user ratings. Each source row is `SOURCE,TARGET,RATING,TIME`: the source is the rater, the target is the ratee, ratings range from −10 to +10 in steps of 1, and time is Unix seconds. SNAP reports 5,881 nodes and 35,592 edges and asks users to cite:

S. Kumar, F. Spezzano, V. S. Subrahmanian, and C. Faloutsos. “Edge Weight Prediction in Weighted Signed Networks.” *2016 IEEE 16th International Conference on Data Mining (ICDM)*, pp. 221–230, 2016.

Dataset page: <https://snap.stanford.edu/data/soc-sign-bitcoinotc.html>.

The SNAP page does not state a dataset-specific license. This repository preserves the locally supplied source files and includes the derived example with source attribution; it does not infer a license from availability.

## Included app example

### Solver input scope

The UI's clingo client rejects programs over 1,000,000 UTF-8 bytes before sending them to the worker. A direct harness call over all 35,592 records bypassed that guard and returned a WebAssembly memory-access error. In the app, an oversized query recommends narrowing the time window or applying filters, while preserving the technical detail for inspection. Full-period queries remain outside the verified solver scope; this conservative input-size limit does not change the ASP query semantics.

The generated example is split for progressive loading. `static/examples/bitcoin-otc-bootstrap.json` contains all 5,881 user nodes and the 2,698 rating records in the initial 30-day window. `src/lib/kliqueasp/data/examples/bitcoin-otc.manifest.json` lists six edge shards for the remaining 32,894 records. The app shows and enables analysis of the complete initial window as soon as the 978,441-byte bootstrap is ready, then downloads the other shards with a progress bar. It unlocks the full timeline only after every shard has loaded; a failed shard can be retried. The original full graph is reconstructed in timestamp order for project export.

The node directory contains only the label, type, and `rater`/`ratee` roles derived from observed endpoint positions. Each rating record receives a stable KliqueASP ID based on its 1-based row position; that ID is generated during conversion and is not supplied by SNAP.

The data and `src/lib/kliqueasp/data/examples/bitcoin-otc.config.json` preserve:

- directed orientation (`rater → ratee`);
- the exact signed integer in `rating` and the mapped edge weight;
- sign in `polarity` (`-1` or `1`) and the derived edge type (`negative-rating` or `positive-rating`);
- the original timestamp text in `sourceTimeSeconds`;
- a point-event interval in integer Unix milliseconds for the app timeline.

The interval uses `Math.round(seconds × 1000)` because the graph-time contract accepts safe integer milliseconds. The source timestamp text is retained unchanged as an attribute. In this file all 35,592 timestamps are distinct and chronological order remains strict after conversion; no records collide at millisecond precision. Equal start/end values mean “rating recorded at this instant,” not a period during which trust remains active. The compact timeline shows UTC calendar dates and its full timestamp remains available on each endpoint label.

Exact local counts: 32,029 positive ratings and 3,563 negative ratings, no zero ratings or self-loops, 5,881 distinct users, and 28,200 directed records that have a reciprocal record in the other direction. The observed date range is 2010-11-08 through 2016-01-25 UTC.

To keep the initial 3D view and ASP projection responsive while exposing signed and reciprocal patterns, `timeline.initialWindow` opens on the busiest 30-day interval: 2011-05-16 through 2011-06-15 UTC. This initial window contains 2,698 rating records across 823 incident users. All three configured queries (negative ratings, opposed reciprocal ratings, and strictly ordered two-edge negative-rating chains) run to completion on that projection and match independent source-data counts: 45, 12, and 1 respectively. In the local harness they took 412 ms, 233 ms, and 232 ms; compact facts occupy 515,284 bytes and the measured WASM linear memory was 18,087,936 bytes. These are local measurements, not browser performance guarantees. A direct clingo/WASM count over all 35,592 records returned a WebAssembly memory-access error in the shipped worker; therefore the example does not claim full-period solver readiness. Wider selections can be explored, but their solver capacity has not been established.

The previous monolithic JSON was 7,668,415 bytes; the bootstrap is 12.8% of that size. In a local Node benchmark, parsing and normalizing the bootstrap took about 211 ms, while normalizing the full graph took about 1,090 ms. For a full-range 2D overview, the UI shows a deterministic sample capped at 2,400 nodes and 10,000 rating records (2,400 and 7,374 in the shipped graph); it labels this as a sample and does not enable SVG/PNG download from the reduced view. The original graph remains intact for analyses, timeline filtering, and project export. These timings are Node measurements, not browser guarantees.

The mapping intentionally does not invent groups, confidence values, per-edge provenance, removal costs, or transaction data. The source page describes ratings in a web-of-trust context; they should not be presented as Bitcoin transfers or as independently verified claims about a person's conduct. Signed edge weights also mean this profile does not claim readiness for the app's nonnegative weighted-modularity mode; communities remain available without using those signed weights.

Regenerate the derived graph and config from the supplied CSV with:

```sh
node scripts/generate-bitcoin-otc-example.mjs
```

The script checks row shape, rating domain, source time ordering, millisecond ordering, and the published node/edge totals before writing the bootstrap, manifest, six remaining-rating shards, and config.
