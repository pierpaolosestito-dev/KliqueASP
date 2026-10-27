# SocioPatterns InVS workplace temporal fixture

The compact JSON fixture `sociopatterns-invs13-temporal-chain.json` is derived from three rows of the official InVS 2013 workplace contact dataset. The complete source data file is also retained as `sociopatterns-invs13-tij.dat` for import and ASP serialization checks:

- Dataset page: <https://sociopatterns.org/datasets/contacts-in-a-workplace/> (dated 2016-06-23).
- Source archive: <https://sociopatterns.org/assets/data/workplace_InVS_tij.dat.zip>
- SHA-256 of the downloaded source archive: `bf818f7e819864e134c90ed82f2cda6ca9d9548d43fe4d05002ac068c91258c0`
- SHA-256 of the included `tij_InVS.dat`: `ba0c81bd10830e688abb3711647e5dc6cecb3aa18e962039ed7ca9242603fd37`
- The complete file has 9,827 contact records over 92 observed participant IDs. The full-data test checks mapped record IDs, types, intervals, and the distinct adjacency relation through clingo-WASM. A 100-minute projection (seconds 28,800–34,800) is used to compare 2,101 strict four-role temporal chains from clingo with independent enumeration; all-period motif enumeration is not claimed.
- Extracted one-based rows from `tij_InVS.dat`: 6 (`30020 21 150`), 7 (`30060 21 205`), and 49 (`30520 153 205`).

The provider defines each row as a contact active over `[t - 20 s, t]` and distributes this dataset under a public-domain dedication. The fixture maps those endpoints directly to `validFrom` and `validTo`; it does not invent timestamps. The three-row chain is a temporal semantics check, not a representative sample. The full-data checks validate mapping and one filtered motif projection; they are not a new analysis of the workplace. A sensor-recorded face-to-face contact is not interpreted as friendship, a persistent social tie, influence, or causation.

When using this dataset in research or visualization, cite Mathieu Génois, Christian L. Vestergaard, Julie Fournet, André Panisson, Isabelle Bonmarin, and Alain Barrat, “Data on face-to-face contacts in an office building suggest a low-cost vaccination strategy based on community linkers,” *Network Science* 3(3), 326–347 (2015), and acknowledge the SocioPatterns collaboration with a link to <https://www.sociopatterns.org/>.
