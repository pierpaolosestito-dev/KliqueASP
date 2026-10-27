# Highland Tribes signed-network fixture

This test fixture is the `ucidata-gama.edges` edge list from the Network Data Repository archive at https://nrvis.com/download/data/misc/ucidata-gama.zip. The retained source file has SHA-256 `6D783A3B70BD432B9DC5ADB300A38B3B8A1ECF93767D027864812C2863C15A32`.

The archive identifies the graph as undirected and signed. Its 16 numeric vertex identifiers are retained as strings in the test's JSON input; each of the 58 rows becomes one JSON edge record with a generated test ID and the original numeric sign. No symmetrization, aggregation, filtering, or sign inference is performed. The source has 29 positive and 29 negative records. Positive ties encode alliance (`rova`); negative ties encode enmity (`hina`).

The domain description and signs are cross-checked against the `tribes` data documentation for the signnet R package, which cites Kenneth E. Read (1954), “Cultures of the Central Highlands, New Guinea,” and describes an undirected network of 16 Gahuku-Gama sub-tribes, with positive alliance and negative enmity ties. The package data documentation states that the source is UCINET's `gama.dat`; the statnet dataset catalog documents CC BY 4.0 for this dataset. The independent triangle enumerator finds 68 complete triangles, of which 59 are balanced and 9 unbalanced; the balance ratio (59/68) agrees with signnet's documented triangle score of 0.8676471. The retained edge list remains the regression source; the application preset in `src/lib/kliqueasp/data/examples/gahuku-gama-signed.json` is a row-for-row JSON rendering with explicit `rova`/`hina` relation labels and the original numeric signs. Neither artifact is the Psychology case study.

References:

- Network Data Repository, `ucidata-gama`: https://networkrepository.com/ucidata-gama.php
- signnet `tribes` data documentation: https://schochastics.r-universe.dev/signnet/doc/manual.html#tribes
- statnet `tribes` data documentation and license: https://rdrr.io/github/statnet/statnet.data/man/tribes.html
- Read, K. E. (1954). “Cultures of the central highlands, New Guinea.” *Southwestern Journal of Anthropology*, 10, 1–43.
