# Real benchmark datasets

These are the original public datasets downloaded for KliqueASP benchmark exploration. The `.gz` files are preserved as distributed; adjacent plain-text files are only gzip-extracted copies and have not been converted or edited.

## SocioPatterns — High school contact and friendship networks

Directory: `sociopatterns-high-school/`

Files:

- `HighSchool2013_proximity_net.csv.gz` and `.csv` — temporal proximity events; rows contain `t i j Ci Cj`, with 20-second intervals.
- `HighSchool2013_contactdiaries_network.csv.gz` and `.csv` — directed, weighted contact-diary reports; rows contain `i j w`.
- `HighSchool2013_friendship_network.csv.gz` and `.csv` — directed friendship reports; rows contain `i j`.
- `HighSchool2013_facebook_known_pairs.csv.gz` and `.csv` — known Facebook pair status; rows contain `i j w`.
- `HighSchool2013_metadata.txt` — student ID, class, and gender (`i Ci Gi`).

Dataset page and terms: <https://sociopatterns.org/datasets/high-school-contact-and-friendship-networks/>. The page states CC BY-NC-SA and requests citation of R. Mastrandrea et al., *PLOS ONE* 10(9), e0136497 (2015): <https://doi.org/10.1371/journal.pone.0136497>.

## SNAP — Bitcoin OTC trust network

Directory: `bitcoin-otc/`

Files:

- `soc-sign-bitcoinotc.csv.gz` — original compressed SNAP file.
- `soc-sign-bitcoinotc.csv` — extracted text copy; each row is `SOURCE,TARGET,RATING,TIME` (no header). Ratings range from -10 to +10 and timestamps are Unix seconds.

Dataset page: <https://snap.stanford.edu/data/soc-sign-bitcoinotc.html>. SNAP reports 5,881 nodes and 35,592 ratings, and requests citation of S. Kumar, F. Spezzano, V. S. Subrahmanian, and C. Faloutsos, “Edge Weight Prediction in Weighted Signed Networks,” IEEE ICDM 2016. The dataset page does not specify a dataset-specific license.

## Integrity

`SHA256SUMS.txt` contains SHA-256 hashes for every downloaded and extracted data file in this directory.

The complete SNAP source is exposed in the example catalog as **Bitcoin OTC · SNAP**. Its conversion and timestamp precision, source citation, absent license statement, preserved signs/direction, and unsupported metadata are documented in [`bitcoin-otc/README.md`](bitcoin-otc/README.md). The derived JSON is regenerated from the unchanged CSV with `node scripts/generate-bitcoin-otc-example.mjs`.

## Synthetic app example

The generated multi-feature sample is documented in [`../synthetic-graph/README.md`](../synthetic-graph/README.md) and regenerated with `node scripts/generate-synthetic-graph.mjs`. It is test data, separate from the real benchmark sources above.
