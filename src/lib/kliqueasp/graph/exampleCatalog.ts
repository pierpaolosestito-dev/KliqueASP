export type WorkspaceExampleId =
  | "karate-club"
  | "davis-southern-women"
  | "gahuku-gama-signed"
  | "temporal-edge-projection"
  | "sociopatterns-invs-100-minute"
  | "sociopatterns-invs-full"
  | "synthetic-graph"
  | "synthetic-graph-directed"
  | "bitcoin-otc";

export type GraphExampleCatalogEntry = {
  id: WorkspaceExampleId | "psychology-case-study";
  title: string;
  description: string;
  href: string;
  opensWorkspaceExample: boolean;
};

/** Shared catalogue for the home page and the workspace's isolated example tabs. */
export function getGraphExampleCatalog(base = ""): GraphExampleCatalogEntry[] {
  const workspaceHref = `${base}/Sandbox/`;
  return [
    {
      id: "karate-club",
      title: "Karate Club",
      description: "34 nodi · rete sociale classica",
      href: `${workspaceHref}?start=example&example=karate-club`,
      opensWorkspaceExample: true
    },
    {
      id: "davis-southern-women",
      title: "Davis Southern Women",
      description: "32 nodi · rete bipartita eventi-persone",
      href: `${workspaceHref}?start=example&example=davis-southern-women`,
      opensWorkspaceExample: true
    },
    {
      id: "gahuku-gama-signed",
      title: "Gahuku-Gama",
      description: "Relazioni con segno e triadi firmate",
      href: `${workspaceHref}?start=example&example=gahuku-gama-signed`,
      opensWorkspaceExample: true
    },
    {
      id: "temporal-edge-projection",
      title: "Rete temporale",
      description: "4 nodi · intervalli di validità sugli archi",
      href: `${workspaceHref}?start=example&example=temporal-edge-projection`,
      opensWorkspaceExample: true
    },
    {
      id: "sociopatterns-invs-100-minute",
      title: "SocioPatterns InVS · 100 minuti",
      description: "45 nodi · contatti in una finestra temporale",
      href: `${workspaceHref}?start=example&example=sociopatterns-invs-100-minute`,
      opensWorkspaceExample: true
    },
    {
      id: "sociopatterns-invs-full",
      title: "SocioPatterns InVS · completo",
      description: "92 nodi · tutti i contatti disponibili",
      href: `${workspaceHref}?start=example&example=sociopatterns-invs-full`,
      opensWorkspaceExample: true
    },
    {
      id: "synthetic-graph",
      title: "Synthetic Graph",
      description: "162 nodi · relazioni, attributi e integrità",
      href: `${workspaceHref}?start=example&example=synthetic-graph`,
      opensWorkspaceExample: true
    },
    {
      id: "synthetic-graph-directed",
      title: "Synthetic Graph · orientato",
      description: "Stessi dati · verso originale dei record",
      href: `${workspaceHref}?start=example&example=synthetic-graph-directed`,
      opensWorkspaceExample: true
    },
    {
      id: "bitcoin-otc",
      title: "Bitcoin OTC · SNAP",
      description: "35.592 rating · finestra iniziale più attiva di 30 giorni",
      href: `${workspaceHref}?start=example&example=bitcoin-otc`,
      opensWorkspaceExample: true
    },
    {
      id: "psychology-case-study",
      title: "Psicologi italiani",
      description: "Caso studio storico già incluso nel progetto",
      href: `${base}/PsychologyHistoryGraph/`,
      opensWorkspaceExample: false
    }
  ];
}

export function parseWorkspaceExampleId(value: string | null | undefined): WorkspaceExampleId {
  switch (value) {
    case "davis-southern-women":
    case "gahuku-gama-signed":
    case "temporal-edge-projection":
    case "sociopatterns-invs-100-minute":
    case "sociopatterns-invs-full":
    case "synthetic-graph":
    case "synthetic-graph-directed":
    case "bitcoin-otc":
      return value;
    case "karate-club":
    default:
      return "karate-club";
  }
}
