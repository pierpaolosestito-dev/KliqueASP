import type { parseWitnessCliqueResults } from "./graphModel.ts";
import type { parseCommunityConstraintDiagnosisResult } from "./communityConstraintDiagnosis.ts";
import type { CliqueMaximumMembershipDiagnosis } from "./cliqueMembershipDiagnosis.ts";
import type { KPlexMaximumMembershipDiagnosis } from "./kplexMembershipDiagnosis.ts";
import type { CommunityPairOptimumMembership } from "./communityOptimumStability.ts";
import type { parseCommunityEditSelectionWitnesses } from "./communityTopologyCounterfactual.ts";
import type { parseIntegrityRepairProposal, parseIntegrityViolations } from "./integrityTask.ts";
import type {
  parseTypedMotifCount,
  parseTypedMotifCompletionCounterfactuals,
  parseTypedMotifMatches,
  parseTypedMotifNearMatches
} from "./motifTask.ts";
import type { parseSignedTriadResults } from "./signedTriadTask.ts";
import type { ContextualCliqueResult } from "./contextualCliqueTask.ts";
import type {
  parseBoundedPathNoRouteCertificate,
  parseWitnessDominatingSetExplanations,
  parseWitnessKCoreExplanations,
  parseWitnessKPlexExplanations,
  parseWitnessMaximalKPlexExplanations,
  parseWitnessMinimumHopPathWitness,
  parseWitnessModularityPartitions,
  parseWitnessRemovedEdgeSetExplanations,
  parseWitnessRemovedNodeSetExplanations,
  parseWitnessComponents,
  parseWitnessStrongComponents,
  StructuralTask,
  parseWitnessTemporalTypedPath,
  parseWitnessTypedPath,
  TypedPathTemporalSemantics,
  parseWitnessWeakComponents,
  KCoreCompletionWhyNot,
  KCoreMembershipCompletionProposal,
  KCoreMembershipCompletionWhyNot,
  KPlexCompletionProposal,
  TypedPathCounterfactualProposal,
  TypedPathStaticCounterfactualWhyNot,
  TypedPathTemporalNoRouteCertificate,
  TypedPathTemporalCounterfactualWhyNot
} from "./structuralTasks.ts";

export type GraphTaskContractId = StructuralTask |
  "clique" | "contextualClique" | "connectedComponents" | "boundedPath" | "typedMotif" | "temporalMotif" | "motifCount" |
  "typedMotifNearMatch" | "motifCompletionCounterfactual" | "graphIntegrity" | "minimumIntegrityRepair" | "signedTriads";

export type GraphCliqueMode = "maximal" | "all" | "maximum";
export const GRAPH_CAPABILITY_IDS = [
  "undirectedAdjacency", "directedEdges", "nodeTypes", "nodeRoles", "nodeGroups",
  "nodeAttributes", "nodeRemovalCosts", "edgeTypes", "edgeAttributes", "edgeIntervals",
  "edgeWeights", "modularityWeights", "edgeRemovalCosts", "edgeConfidence",
  "edgeProvenance", "edgeIdentity"
] as const;
export type GraphCapabilityId = (typeof GRAPH_CAPABILITY_IDS)[number];
export const GRAPH_CAPABILITY_LABELS: Readonly<Record<GraphCapabilityId, string>> = Object.freeze({
  undirectedAdjacency: "Proiezione non orientata",
  directedEdges: "Direzione degli archi",
  nodeTypes: "Tipi di nodo",
  nodeRoles: "Ruoli dei nodi",
  nodeGroups: "Gruppi",
  nodeAttributes: "Attributi dei nodi",
  nodeRemovalCosts: "Costi di rimozione dei nodi",
  edgeTypes: "Tipi di arco",
  edgeAttributes: "Attributi degli archi",
  edgeIntervals: "Intervalli temporali degli archi",
  edgeWeights: "Pesi degli archi",
  modularityWeights: "Pesi validi per la modularità",
  edgeRemovalCosts: "Costi di rimozione degli archi",
  edgeConfidence: "Confidenza degli archi",
  edgeProvenance: "Provenienza degli archi",
  edgeIdentity: "Identità persistente degli archi"
});
export type GraphTaskEnumerationId =
  | GraphCliqueMode
  | "one-maximum" | "all-maximum" | "certified-one-maximal" | "all-maximal"
  | "unique-core" | "complete-deterministic-partition"
  | "one-shortest-path" | "one-complete-no-route-certificate" | "one-route-witness"
  | "one-complete-blocker-certificate"
  | "one-complete-peeling-certificate"
  | "one-proven-temporal-prefix-optimum"
  | "all-distinct-role-assignments" | "one-proven-lexicographic-optimum"
  | "one-proven-minimum-cost-completion" | "single-query-aggregate"
  | "complete-disjoint-partition-sum" | "all-violations-complete"
  | "one-proven-minimum-cost-proposal" | "all-complete-signed-triads"
  | "one-minimum" | "all-minimum" | "one-minimum-cost" | "all-minimum-cost"
  | "one-optimum" | "all-optima";

export type GraphTaskResultKind =
  | "nodeSet"
  | "componentPartition"
  | "nodeSequence"
  | "certificate"
  | "roleAssignments"
  | "exactCount"
  | "violationList"
  | "integrityRepair"
  | "triadClassification"
  | "nearMatch"
  | "counterfactual"
  | "membershipDiagnosis"
  | "optimumMembership"
  | "constraintDiagnosis"
  | "separator"
  | "communityPartition";

export type GraphTaskSupportingQueryId =
  | "cliqueMaximumMembershipDiagnosis"
  | "kPlexMaximumMembershipDiagnosis"
  | "kPlexMaximumMembershipCounterfactual"
  | "communityPairOptimalMembership"
  | "communityTopologyEditSelection"
  | "kPlexCompletionCounterfactual"
  | "kPlexCompletionWhyNot"
  | "kCoreCompletionCounterfactual"
  | "kCoreMembershipCompletionCounterfactual"
  | "kCoreCompletionWhyNot"
  | "kCoreMembershipCompletionWhyNot"
  | "typedPathCompletionCounterfactual"
  | "typedPathCompletionWhyNot"
  | "typedPathTemporalNoRoute"
  | "typedPathTemporalCompletionWhyNot"
  | "communityConstraintDiagnosis";

type ParsedCommunityConstraintDiagnoses = ReturnType<typeof parseCommunityConstraintDiagnosisResult>;
type GraphTaskSupportingQueryResultFieldsById = {
  cliqueMaximumMembershipDiagnosis: keyof CliqueMaximumMembershipDiagnosis;
  kPlexMaximumMembershipDiagnosis: Exclude<keyof KPlexMaximumMembershipDiagnosis, "optimalMembershipSummary">;
  kPlexMaximumMembershipCounterfactual: keyof import("./kplexMembershipCounterfactual.ts").KPlexMaximumMembershipCounterfactualResult;
  communityPairOptimalMembership: keyof CommunityPairOptimumMembership;
  communityTopologyEditSelection: keyof ReturnType<typeof parseCommunityEditSelectionWitnesses>;
  kPlexCompletionCounterfactual: keyof import("./structuralTasks.ts").KPlexCompletionProposal;
  kPlexCompletionWhyNot: keyof import("./structuralTasks.ts").KPlexCompletionWhyNot;
  kCoreCompletionCounterfactual: keyof KPlexCompletionProposal;
  kCoreMembershipCompletionCounterfactual: keyof KCoreMembershipCompletionProposal;
  kCoreCompletionWhyNot: keyof KCoreCompletionWhyNot;
  kCoreMembershipCompletionWhyNot: keyof KCoreMembershipCompletionWhyNot;
  typedPathCompletionCounterfactual: keyof TypedPathCounterfactualProposal;
  typedPathCompletionWhyNot: keyof TypedPathStaticCounterfactualWhyNot;
  typedPathTemporalNoRoute: keyof TypedPathTemporalNoRouteCertificate;
  typedPathTemporalCompletionWhyNot: keyof TypedPathTemporalCounterfactualWhyNot;
  communityConstraintDiagnosis: ParsedObjectFields<ParsedCommunityConstraintDiagnoses>;
};

export interface GraphTaskSupportingQueryContract {
  id: GraphTaskSupportingQueryId;
  aspEncoding: string;
  encodingVersion: number;
  querySemantics: string;
  parameters: readonly string[];
  /** Input facts consumed by this additional query, including task-local facts. */
  inputPredicates: readonly string[];
  resultKind: GraphTaskResultKind;
  parser: string;
  /** Predicates exposed by #show and interpreted by the supporting query parser. */
  witnessPredicates: readonly string[];
  resultFields: readonly GraphTaskSupportingQueryResultFieldsById[GraphTaskSupportingQueryId][];
  supportedEnumeration: readonly GraphTaskEnumerationId[];
  visualization: string;
  requiredCapabilities: readonly GraphCapabilityId[];
}

export interface GraphTaskContractContext {
  direction?: "directed" | "undirected";
  temporalSemantics?: "static" | TypedPathTemporalSemantics;
  useEdgeWeights?: boolean;
}

export interface GraphTaskEnumerationContext {
  cliqueMode?: GraphCliqueMode;
  minimumCliqueSize?: number;
  enumerateAllOptima?: boolean;
  enumerateAllMaximalKPlex?: boolean;
  partitionedCount?: boolean;
}

export interface GraphTaskContract {
  id: GraphTaskContractId;
  aspEncoding: string;
  encodingVersion: number;
  querySemantics: string;
  parameters: readonly string[];
  /** Input facts read by the encoding, including task-local facts and conditional modes. */
  inputPredicates: readonly string[];
  resultKind: GraphTaskResultKind;
  parser: string;
  /** Predicates exposed through #show and interpreted by the parser. */
  witnessPredicates: readonly string[];
  /** Stable semantic fields exposed by witness parsing; array/scalar results may use a named semantic container field. */
  resultFields: readonly string[];
  /** Fields copied from task configuration into parser results as contextual metadata, not ASP semantics. */
  resultContextFields?: readonly string[];
  /** Stable fields derived by application algorithms outside the ASP witness. */
  applicationDerivedFields?: readonly string[];
  /** Separate ASP queries that explain, diagnose, or extend this task's primary result. */
  supportingQueries?: readonly GraphTaskSupportingQueryContract[];
  supportedEnumeration: readonly GraphTaskEnumerationId[];
  visualization: string;
  requiredCapabilities: readonly GraphCapabilityId[];
}

type ComponentPartitionView = { components: ReturnType<typeof parseWitnessComponents> };
type WeakComponentPartitionView = { components: ReturnType<typeof parseWitnessWeakComponents> };
type StrongComponentPartitionView = { components: ReturnType<typeof parseWitnessStrongComponents> };
type MotifCountView = { count: NonNullable<ReturnType<typeof parseTypedMotifCount>> };
type ParsedTypedMotifMatch = NonNullable<ReturnType<typeof parseTypedMotifMatches>>[number];
type TypedMotifSemanticView = Pick<ParsedTypedMotifMatch,
  "roles" | "nodeIds" | "timeValue" | "supportingEdges" | "absenceConditions" | "inducedEdgeTypes">;
type TemporalMotifSemanticView = Pick<ParsedTypedMotifMatch,
  "roles" | "nodeIds" | "timeValue" | "maximumSpan" | "supportingEdges">;
type ParsedTypedMotifNearMatch = NonNullable<ReturnType<typeof parseTypedMotifNearMatches>>[number];
type TypedMotifNearMatchSemanticView = Pick<ParsedTypedMotifNearMatch,
  "roles" | "missingRoles" | "missingPatterns" | "unresolvedPatterns" | "violatedAbsencePatterns" |
  "unresolvedAbsencePatterns" | "supportingEdges" | "temporalEvidence">;
type ParsedMotifCompletionCounterfactual = NonNullable<ReturnType<typeof parseTypedMotifCompletionCounterfactuals>>[number];
type MotifCompletionCounterfactualSemanticView = Pick<ParsedMotifCompletionCounterfactual,
  "totalCost" | "match" | "addedEdges">;

type ParsedObjectFields<Result> = Result extends null | undefined ? never
  : Result extends readonly (infer Item)[]
    ? Item extends readonly unknown[] ? never : Item extends object ? keyof Item : never
    : Result extends object ? keyof Result : never;

type GraphTaskResultKindById = {
  clique: "nodeSet";
  kPlex: "nodeSet";
  maximalKPlex: "nodeSet";
  kCore: "nodeSet";
  components: "componentPartition";
  connectedComponents: "componentPartition";
  weakComponents: "componentPartition";
  strongComponents: "componentPartition";
  path: "nodeSequence";
  boundedPath: "certificate";
  typedPath: "nodeSequence";
  typedMotif: "roleAssignments";
  temporalMotif: "roleAssignments";
  typedMotifNearMatch: "nearMatch";
  motifCompletionCounterfactual: "counterfactual";
  motifCount: "exactCount";
  graphIntegrity: "violationList";
  minimumIntegrityRepair: "integrityRepair";
  signedTriads: "triadClassification";
  contextualClique: "nodeSet";
  dominatingSet: "nodeSet";
  minimumNodeSeparator: "separator";
  minimumCostNodeSeparator: "separator";
  minimumEdgeSeparator: "separator";
  minimumCostEdgeSeparator: "separator";
  communities: "communityPartition";
};

type GraphTaskResultFieldsById = {
  clique: ParsedObjectFields<ReturnType<typeof parseWitnessCliqueResults>>;
  kPlex: ParsedObjectFields<ReturnType<typeof parseWitnessKPlexExplanations>>;
  maximalKPlex: ParsedObjectFields<ReturnType<typeof parseWitnessMaximalKPlexExplanations>>;
  kCore: ParsedObjectFields<ReturnType<typeof parseWitnessKCoreExplanations>>;
  components: keyof ComponentPartitionView;
  connectedComponents: keyof ComponentPartitionView;
  weakComponents: keyof WeakComponentPartitionView;
  strongComponents: keyof StrongComponentPartitionView;
  path: ParsedObjectFields<ReturnType<typeof parseWitnessMinimumHopPathWitness>>;
  boundedPath: ParsedObjectFields<ReturnType<typeof parseBoundedPathNoRouteCertificate>>;
  typedPath: ParsedObjectFields<ReturnType<typeof parseWitnessTypedPath>>
    | ParsedObjectFields<ReturnType<typeof parseWitnessTemporalTypedPath>>;
  typedMotif: keyof TypedMotifSemanticView;
  temporalMotif: keyof TemporalMotifSemanticView;
  typedMotifNearMatch: keyof TypedMotifNearMatchSemanticView;
  motifCompletionCounterfactual: keyof MotifCompletionCounterfactualSemanticView;
  motifCount: keyof MotifCountView;
  graphIntegrity: ParsedObjectFields<ReturnType<typeof parseIntegrityViolations>>;
  minimumIntegrityRepair: ParsedObjectFields<ReturnType<typeof parseIntegrityRepairProposal>>;
  signedTriads: ParsedObjectFields<ReturnType<typeof parseSignedTriadResults>>;
  contextualClique: keyof ContextualCliqueResult;
  dominatingSet: ParsedObjectFields<ReturnType<typeof parseWitnessDominatingSetExplanations>>;
  minimumNodeSeparator: ParsedObjectFields<ReturnType<typeof parseWitnessRemovedNodeSetExplanations>>;
  minimumCostNodeSeparator: ParsedObjectFields<ReturnType<typeof parseWitnessRemovedNodeSetExplanations>>;
  minimumEdgeSeparator: ParsedObjectFields<ReturnType<typeof parseWitnessRemovedEdgeSetExplanations>>;
  minimumCostEdgeSeparator: ParsedObjectFields<ReturnType<typeof parseWitnessRemovedEdgeSetExplanations>>;
  communities: ParsedObjectFields<ReturnType<typeof parseWitnessModularityPartitions>>;
};

type GraphTaskApplicationFieldsById = {
  [Task in GraphTaskContractId]: Task extends "kCore" ? "coreNumbers"
    : Task extends "motifCount" ? "partitionCount"
      : Task extends "minimumCostNodeSeparator" ? "minimumNodeRemovalCost"
        : Task extends "minimumCostEdgeSeparator" ? "minimumCutCost"
          : Task extends "communities" ? "attributeBoundCounts"
            : never;
};

type GraphTaskResultContextFieldsById = {
  [Task in GraphTaskContractId]: Task extends
    "typedMotif" | "temporalMotif" | "typedMotifNearMatch" | "motifCompletionCounterfactual"
      ? "templateId" | "label"
      : never;
};

type GraphTaskContractDefinition<Id extends GraphTaskContractId> = Omit<
  GraphTaskContract,
  "id" | "resultKind" | "resultFields" | "resultContextFields" | "applicationDerivedFields" | "requiredCapabilities"
> & {
  id: Id;
  resultKind: GraphTaskResultKindById[Id];
  resultFields: readonly GraphTaskResultFieldsById[Id][];
  resultContextFields?: readonly GraphTaskResultContextFieldsById[Id][];
  applicationDerivedFields?: readonly GraphTaskApplicationFieldsById[Id][];
  requiredCapabilities: readonly GraphCapabilityId[];
};

type GraphTaskContractRegistry = {
  [Id in GraphTaskContractId]: GraphTaskContractDefinition<Id>;
};

/**
 * Source of truth for implemented ASP task contracts. inputPredicates is the
 * union of graph and data-projection facts consumed across supported modes;
 * some entries are conditional (for example group filters or temporal modes).
 * Bump encodingVersion when answer-set meaning or witness vocabulary changes.
 */
export const GRAPH_TASK_CONTRACTS: Readonly<GraphTaskContractRegistry> = Object.freeze({
  contextualClique: {
    id: "contextualClique",
    aspEncoding: "maximum-pairwise-context-supported-group",
    encodingVersion: 1,
    querySemantics: "Massimizza il numero di nodi focali tipizzati imponendo che ogni coppia condivida almeno un nodo di contesto tramite un tipo d'arco configurato. Coppie diverse possono usare contesti diversi; non è richiesta una singola istituzione comune all'intero gruppo.",
    parameters: ["focusNodeTypes", "contextNodeTypes", "edgeTypes", "minimumSize", "group", "enumerateAllOptima"],
    inputPredicates: ["node_type/2", "contextual_focus_type/1", "contextual_context_type/1", "contextual_edge_type/1", "contextual_selected_group/1", "group/2", "edge_record/1", "edge_source/2", "edge_target/2", "edge_type/2"],
    resultKind: "nodeSet",
    parser: "parseContextualCliqueResults",
    witnessPredicates: ["in/1", "contextual_pair_context/3"],
    resultFields: ["nodeIds", "sourceNodeIds", "pairWitnesses"],
    supportedEnumeration: ["one-maximum", "all-maximum"],
    visualization: "Evidenzia i membri, i contesti scelti per ogni coppia e i record che sostengono le incidenze.",
    requiredCapabilities: ["undirectedAdjacency", "nodeTypes", "edgeTypes"]
  },
  clique: {
    id: "clique",
    aspEncoding: "clique-selection",
    encodingVersion: 1,
    querySemantics: "Seleziona nodi a coppie adiacenti e, secondo la modalita, enumera clique massimali, tutte le clique sopra una soglia minima o tutte le clique di cardinalita massima.",
    parameters: ["mode", "minimumSize", "group"],
    inputPredicates: ["node/1", "edge/2", "group/2", "edge_record/1", "edge_source/2", "edge_target/2"],
    resultKind: "nodeSet",
    parser: "parseWitnessCliques / parseWitnessCliqueResults",
    witnessPredicates: ["in/1", "clique_edge_support/2", "clique_edge_support/3"],
    resultFields: ["nodeIds", "supportingEdges"],
    supportedEnumeration: ["maximal", "all", "maximum"],
    visualization: "Evidenzia i membri e i record d'arco che sostengono le coppie.",
    requiredCapabilities: ["undirectedAdjacency"],
    supportingQueries: [{
      id: "cliqueMaximumMembershipDiagnosis",
      aspEncoding: "maximum-clique-with-required-node",
      encodingVersion: 1,
      querySemantics: "Massimizza la clique imponendo l'appartenenza di un nodo scelto; il confronto con la taglia massima globale stabilisce se il nodo può appartenere a un ottimo.",
      parameters: ["group", "targetNode", "globalMaximumSize"],
      inputPredicates: ["node/1", "edge/2", "group/2"],
      resultKind: "membershipDiagnosis",
      parser: "parseCliqueMaximumMembershipDiagnosis",
      witnessPredicates: ["in/1"],
      resultFields: ["targetNodeId", "globalMaximumSize", "maximumContainingSize", "sizeGap", "outcome", "witnessNodeIds", "supportingEdges"],
      supportedEnumeration: ["one-optimum"],
      visualization: "Evidenzia la clique ottima più grande che contiene il nodo richiesto e i suoi archi di supporto.",
      requiredCapabilities: ["undirectedAdjacency"]
    }]
  },
  kPlex: {
    id: "kPlex",
    aspEncoding: "maximum-s-plex-search",
    encodingVersion: 1,
    querySemantics: "Massimizza la cardinalità di un s-plex: ogni membro ha al massimo s−1 non-vicini distinti nel gruppo.",
    parameters: ["s", "group", "enumerateAllOptima"],
    inputPredicates: ["node/1", "edge/2", "group/2"],
    resultKind: "nodeSet",
    parser: "parseWitnessKPlexExplanations",
    witnessPredicates: ["in/1", "missing_tie/2"],
    resultFields: ["nodeIds", "missingTiePairs"],
    supportedEnumeration: ["one-maximum", "all-maximum"],
    visualization: "Evidenzia membri, coppie mancanti ammesse e record di supporto.",
    requiredCapabilities: ["undirectedAdjacency"],
    supportingQueries: [{
      id: "kPlexMaximumMembershipDiagnosis",
      aspEncoding: "maximum-s-plex-with-required-node",
      encodingVersion: 1,
      querySemantics: "Massimizza un s-plex imponendo l'appartenenza del nodo scelto; il confronto con la taglia massima globale misura il gap di membership.",
      parameters: ["s", "group", "targetNode", "globalMaximumSize"],
      inputPredicates: ["node/1", "edge/2", "group/2"],
      resultKind: "membershipDiagnosis",
      parser: "parseKPlexMaximumMembershipDiagnosis",
      witnessPredicates: ["in/1", "missing_tie/2"],
      resultFields: ["targetNodeId", "s", "globalMaximumSize", "maximumContainingSize", "sizeGap", "outcome", "witnessNodeIds", "missingPairs"],
      supportedEnumeration: ["one-maximum"],
      visualization: "Evidenzia il k-plex di taglia massima che contiene il nodo, comprese le coppie mancanti ammesse.",
      requiredCapabilities: ["undirectedAdjacency"]
    }, {
      id: "kPlexMaximumMembershipCounterfactual",
      aspEncoding: "minimum-cost-s-plex-maximum-membership-counterfactual",
      encodingVersion: 1,
      querySemantics: "Ordina per costo non decrescente i sottoinsiemi degli archi aggiuntivi esplicitamente dichiarati. Per ogni grafo ipotetico richiede una prova dell'ottimo s-plex globale e una dell'ottimo con il target forzato; accetta il primo sottoinsieme per cui le due cardinalitÃ  coincidono. La ricerca Ã¨ limitata a otto candidati eleggibili e non modifica i dati osservati.",
      parameters: ["s", "group", "targetNode", "edgeAdditions", "candidateLimit"],
      inputPredicates: ["node/1", "edge/2", "group/2", "cf_kpmc_candidate/1", "cf_kpmc_candidate_cost/2"],
      resultKind: "counterfactual",
      parser: "searchMinimumCostKPlexMaximumMembershipCounterfactual (paired parseKPlex maximum queries)",
      witnessPredicates: ["cf_kpmc_add_edge/1", "in/1", "missing_tie/2"],
      resultFields: ["targetNodeId", "s", "globalMaximumSize", "maximumContainingSize", "sizeGap", "outcome", "witnessNodeIds", "missingPairs", "selectedEdges", "candidateCount", "totalCost", "testedCandidateSets"],
      supportedEnumeration: ["one-proven-minimum-cost-proposal"],
      visualization: "Mostra il k-plex massimo con il target sul grafo ipotetico e le sole aggiunte candidate selezionate; dati osservati e archi non selezionati restano invariati.",
      requiredCapabilities: ["undirectedAdjacency"]
    }, {
      id: "kPlexCompletionCounterfactual",
      aspEncoding: "minimum-cost-s-plex-edge-completion",
      encodingVersion: 1,
      querySemantics: "Mantiene fisso il cohort scelto e seleziona solo aggiunte di arco esplicitamente candidate, minimizzando il loro costo finché ogni nodo ha al massimo s−1 non-vicini nel cohort. Le aggiunte sono ipotetiche e non cambiano il grafo osservato; il tipo dell'arco è metadato dell'edit, non una condizione di eleggibilità ASP.",
      parameters: ["s", "cohort", "edgeAdditions", "enumerateAllOptima"],
      inputPredicates: ["edge/2", "cf_plex_cohort/1", "cf_plex_candidate/5"],
      resultKind: "counterfactual",
      parser: "parseKPlexCompletionCounterfactuals",
      witnessPredicates: ["cf_add_edge/1"],
      resultFields: ["totalCost", "addedEdges"],
      supportedEnumeration: ["one-proven-minimum-cost-proposal", "all-minimum-cost"],
      visualization: "Mostra le sole aggiunte candidate selezionate e il costo totale del completamento minimo.",
      requiredCapabilities: ["undirectedAdjacency"]
    }, {
      id: "kPlexCompletionWhyNot",
      aspEncoding: "s-plex-candidate-capacity-certificate",
      encodingVersion: 1,
      querySemantics: "Per un cohort fisso classifica le coppie mancanti non coperte né dagli archi osservati né da alcun candidato; segnala i nodi con almeno s vicini mancanti non completabili. È una spiegazione relativa all'intero insieme di candidati dichiarato, non una ricerca di un nuovo cohort né una valutazione probabilistica.",
      parameters: ["s", "cohort", "edgeAdditions"],
      inputPredicates: ["edge/2", "cf_plex_diag_cohort/1", "cf_plex_diag_candidate/3"],
      resultKind: "certificate",
      parser: "parseKPlexCompletionWhyNot",
      witnessPredicates: ["cf_plex_diag_unfillable_pair/2", "cf_plex_diag_blocker/1"],
      resultFields: ["targetS", "cohortNodeIds", "candidateEdgeIds", "unfillableMissingPairs", "blockers"],
      supportedEnumeration: ["one-complete-blocker-certificate"],
      visualization: "Evidenzia coppie che nessun candidato può colmare e nodi che superano la soglia di non-vicinanza ammessa.",
      requiredCapabilities: ["undirectedAdjacency"]
    }]
  },
  maximalKPlex: {
    id: "maximalKPlex",
    aspEncoding: "maximal-s-plex-certificate",
    encodingVersion: 1,
    querySemantics: "Restituisce un s-plex massimale per inclusione; massimale non significa di cardinalità massima.",
    parameters: ["s", "group", "enumerateAllMaximalKPlex"],
    inputPredicates: ["node/1", "edge/2", "group/2"],
    resultKind: "nodeSet",
    parser: "parseWitnessMaximalKPlexExplanations",
    witnessPredicates: ["in/1", "missing_tie/2", "maximal_candidate/1", "maximal_blocked_by_degree/2", "maximal_blocked_by_member/3"],
    resultFields: ["nodeIds", "missingTiePairs", "candidateNodeIds", "blockers"],
    supportedEnumeration: ["certified-one-maximal", "all-maximal"],
    visualization: "Evidenzia membri, legami mancanti e certificato che impedisce ogni estensione.",
    requiredCapabilities: ["undirectedAdjacency"]
  },
  kCore: {
    id: "kCore",
    aspEncoding: "k-core-membership-and-peeling",
    encodingVersion: 1,
    querySemantics: "Calcola il k-core indotto massimale alla soglia k secondo il grado non orientato o la modalità entrante, uscente o mutuale dichiarata. Il profilo completo dei core number opzionale è calcolato dall'applicazione con peeling a bucket e non è un output ASP.",
    parameters: ["k", "directionMode", "group", "includeKCoreNumbers", "explainKCoreExclusions"],
    inputPredicates: ["node/1", "edge/2", "group/2"],
    resultKind: "nodeSet",
    parser: "parseWitnessKCoreExplanations / parseWitnessKCorePeelingRound",
    witnessPredicates: ["in/1", "core_support/2", "peeled_at/2", "peel_support/3", "peeled/1", "peel_support/2"],
    resultFields: ["nodeIds", "supportPairs", "peeling"],
    applicationDerivedFields: ["coreNumbers"],
    supportedEnumeration: ["unique-core"],
    visualization: "Evidenzia il core, i vicini che attestano la soglia e, su richiesta, i round di peeling.",
    requiredCapabilities: [],
    supportingQueries: [{
      id: "kCoreCompletionCounterfactual",
      aspEncoding: "minimum-cost-fixed-cohort-k-core-completion",
      encodingVersion: 1,
      querySemantics: "Mantiene fisso il cohort e minimizza il costo delle sole aggiunte candidate necessarie affinché ogni nodo del cohort abbia grado interno almeno k. È un completamento di grado del cohort, non una query di membership con scelta di un sottoinsieme k-core.",
      parameters: ["k", "cohort", "edgeAdditions", "enumerateAllOptima"],
      inputPredicates: ["edge/2", "cf_core_cohort/1", "cf_core_candidate/5"],
      resultKind: "counterfactual",
      parser: "parseKCoreCompletionCounterfactuals",
      witnessPredicates: ["cf_core_add_edge/1"],
      resultFields: ["totalCost", "addedEdges"],
      supportedEnumeration: ["one-proven-minimum-cost-proposal", "all-minimum-cost"],
      visualization: "Evidenzia le aggiunte ipotetiche minime che portano ogni nodo del cohort alla soglia k.",
      requiredCapabilities: ["undirectedAdjacency"]
    }, {
      id: "kCoreMembershipCompletionCounterfactual",
      aspEncoding: "minimum-cost-target-k-core-membership-completion",
      encodingVersion: 1,
      querySemantics: "Sceglie un sottoinsieme del dominio candidato che contiene il target e minimizza le aggiunte candidate necessarie affinché tale sottoinsieme abbia grado interno almeno k; il witness include il sottoinsieme che certifica la membership. L'enumerazione proietta sui soli insiemi di archi aggiunti per non duplicare lo stesso completamento con core witness differenti.",
      parameters: ["k", "targetNode", "candidateNodes", "edgeAdditions", "enumerateAllOptima"],
      inputPredicates: ["edge/2", "cf_core_pool/1", "cf_core_membership_candidate/4"],
      resultKind: "counterfactual",
      parser: "parseKCoreMembershipCompletionCounterfactuals",
      witnessPredicates: ["cf_core_membership_add_edge/1", "cf_core_member/1"],
      resultFields: ["totalCost", "addedEdges", "coreWitnessNodeIds"],
      supportedEnumeration: ["one-proven-minimum-cost-proposal", "all-minimum-cost"],
      visualization: "Mostra gli archi aggiunti e un sottoinsieme k-core verificato che contiene il target.",
      requiredCapabilities: ["undirectedAdjacency"]
    }, {
      id: "kCoreCompletionWhyNot",
      aspEncoding: "fixed-cohort-k-core-capacity-certificate",
      encodingVersion: 1,
      querySemantics: "Confronta per ogni nodo del cohort il grado osservato con il grado massimo ottenibile usando tutti i candidati dichiarati; un blocker ha grado massimo inferiore a k. Il certificato riguarda questo cohort e questo universo chiuso di aggiunte.",
      parameters: ["k", "cohort", "edgeAdditions"],
      inputPredicates: ["edge/2", "cf_core_diag_cohort/1", "cf_core_diag_candidate/3"],
      resultKind: "certificate",
      parser: "parseKCoreCompletionWhyNot",
      witnessPredicates: ["cf_core_diag_current_degree/2", "cf_core_diag_maximum_degree/2", "cf_core_diag_blocker/1"],
      resultFields: ["targetK", "cohortNodeIds", "candidateEdgeIds", "blockers"],
      supportedEnumeration: ["one-complete-blocker-certificate"],
      visualization: "Mostra gradi attuali, gradi massimi raggiungibili e nodi che impediscono il completamento del cohort.",
      requiredCapabilities: ["undirectedAdjacency"]
    }, {
      id: "kCoreMembershipCompletionWhyNot",
      aspEncoding: "target-k-core-membership-peeling-certificate",
      encodingVersion: 1,
      querySemantics: "Aggiunge tutti i candidati dichiarati al grafo e certifica l'esclusione del target tramite peeling sincrono del dominio candidato. Può restituire il peeling completo o il prefisso esatto fino alla rimozione del target; su domini grandi il runtime suddivide i round in batch ASP.",
      parameters: ["k", "targetNode", "candidateNodes", "edgeAdditions", "stopAfterTargetRemoval"],
      inputPredicates: ["edge/2", "cf_kcm_diag_node/1", "cf_kcm_diag_target/1", "cf_kcm_diag_candidate/3"],
      resultKind: "certificate",
      parser: "parseKCoreMembershipCompletionWhyNot",
      witnessPredicates: ["cf_kcm_diag_peeled_at/2", "cf_kcm_diag_peel_support/3"],
      resultFields: ["targetK", "targetNodeId", "candidateNodeIds", "candidateEdgeIds", "peelingScope", "peeling"],
      supportedEnumeration: ["one-complete-peeling-certificate"],
      visualization: "Mostra il round di eliminazione del target e i vicini ancora attivi che giustificano ciascun passo.",
      requiredCapabilities: ["undirectedAdjacency"]
    }]
  },
  components: {
    id: "components",
    aspEncoding: "connected-components",
    encodingVersion: 1,
    querySemantics: "Partiziona tutti i nodi eleggibili nelle componenti connesse della proiezione non orientata.",
    parameters: ["group"],
    inputPredicates: ["node/1", "edge/2", "group/2"],
    resultKind: "componentPartition",
    parser: "parseWitnessComponents",
    witnessPredicates: ["component/2"],
    resultFields: ["components"],
    supportedEnumeration: ["complete-deterministic-partition"],
    visualization: "Colora ed evidenzia ogni componente della partizione completa.",
    requiredCapabilities: ["undirectedAdjacency"]
  },
  connectedComponents: {
    id: "connectedComponents",
    aspEncoding: "connected-components",
    encodingVersion: 1,
    querySemantics: "Partiziona tutti i nodi eleggibili nelle componenti connesse della proiezione non orientata.",
    parameters: ["group"],
    inputPredicates: ["node/1", "edge/2", "group/2"],
    resultKind: "componentPartition",
    parser: "parseWitnessComponents",
    witnessPredicates: ["component/2"],
    resultFields: ["components"],
    supportedEnumeration: ["complete-deterministic-partition"],
    visualization: "Colora ed evidenzia ogni componente della partizione completa.",
    requiredCapabilities: ["undirectedAdjacency"]
  },
  weakComponents: {
    id: "weakComponents",
    aspEncoding: "weakly-connected-components",
    encodingVersion: 1,
    querySemantics: "Partiziona i nodi in componenti deboli ignorando l'orientamento solo per la connettività.",
    parameters: ["group"],
    inputPredicates: ["node/1", "edge/2", "group/2"],
    resultKind: "componentPartition",
    parser: "parseWitnessWeakComponents",
    witnessPredicates: ["weak_component/2"],
    resultFields: ["components"],
    supportedEnumeration: ["complete-deterministic-partition"],
    visualization: "Evidenzia ciascuna componente debole conservando le frecce originali.",
    requiredCapabilities: ["directedEdges"]
  },
  strongComponents: {
    id: "strongComponents",
    aspEncoding: "strongly-connected-components",
    encodingVersion: 1,
    querySemantics: "Partiziona i nodi secondo la raggiungibilità reciproca rispettando la direzione degli archi.",
    parameters: ["group"],
    inputPredicates: ["node/1", "edge/2", "group/2"],
    resultKind: "componentPartition",
    parser: "parseWitnessStrongComponents",
    witnessPredicates: ["strong_component/2"],
    resultFields: ["components"],
    supportedEnumeration: ["complete-deterministic-partition"],
    visualization: "Evidenzia ciascuna componente forte rispettando le frecce originali.",
    requiredCapabilities: ["directedEdges"]
  },
  path: {
    id: "path",
    aspEncoding: "minimum-hop-path-with-bound",
    encodingVersion: 1,
    querySemantics: "Trova un cammino semplice di numero minimo di archi entro il limite configurato fra due nodi.",
    parameters: ["startNodeId", "goalNodeId", "maximumHops", "group"],
    inputPredicates: ["node/1", "group/2", "path_edge_record/1", "path_edge_source/2", "path_edge_target/2"],
    resultKind: "nodeSequence",
    parser: "parseWitnessMinimumHopPathWitness",
    witnessPredicates: ["path_length/1", "at/2", "path_edge_support/2", "path_minimality_certificate/1", "path_shorter_reachable/2"],
    resultFields: ["nodeIds", "edgeIdsByStep", "minimalityCertificate"],
    supportedEnumeration: ["one-shortest-path"],
    visualization: "Evidenzia la sequenza ordinata e tutti i record d'arco che la sostengono.",
    requiredCapabilities: []
  },
  boundedPath: {
    id: "boundedPath",
    aspEncoding: "bounded-path-no-route-certificate",
    encodingVersion: 1,
    querySemantics: "Quando non esiste un cammino entro il limite richiesto, restituisce un certificato di raggiungibilità per profondità.",
    parameters: ["startNodeId", "goalNodeId", "maximumHops", "group"],
    inputPredicates: ["node/1", "group/2", "path_edge_record/1", "path_edge_source/2", "path_edge_target/2"],
    resultKind: "certificate",
    parser: "parseBoundedPathNoRouteCertificate",
    witnessPredicates: ["path_no_route_certificate/1", "path_no_route_reachable/2"],
    resultFields: ["maximumLength", "reachableByDepth"],
    supportedEnumeration: ["one-complete-no-route-certificate"],
    visualization: "Evidenzia i nodi raggiungibili a ogni profondità entro il limite.",
    requiredCapabilities: []
  },
  typedPath: {
    id: "typedPath",
    aspEncoding: "typed-simple-path",
    encodingVersion: 1,
    querySemantics: "Trova un cammino semplice che rispetta esattamente la sequenza ordinata di tipi; la modalità temporale è dichiarata separatamente.",
    parameters: ["startNodeId", "goalNodeId", "edgeTypeSequence", "group", "temporalSemantics", "strictTemporalOrder"],
    inputPredicates: ["node/1", "group/2", "edge_record/1", "edge_source/2", "edge_target/2", "edge_type/2", "edge_valid_from/2", "edge_valid_to/2"],
    resultKind: "nodeSequence",
    parser: "parseWitnessTypedPath / parseWitnessTemporalTypedPath",
    witnessPredicates: ["typed_path_node/2", "typed_path_edge/2", "typed_path_time/1", "typed_path_ordered_support/3", "typed_path_edge_support/2"],
    resultFields: ["nodeIds", "edgeIdsByStep", "temporalSemantics", "commonTimeValue", "startTimeValuesByStep"],
    supportedEnumeration: ["one-route-witness"],
    visualization: "Evidenzia il cammino, la sequenza di tipi, i record sorgente e i supporti temporali.",
    requiredCapabilities: ["edgeTypes"],
    supportingQueries: [{
      id: "typedPathCompletionCounterfactual",
      aspEncoding: "minimum-cost-typed-path-edge-completion",
      encodingVersion: 1,
      querySemantics: "Mantiene fissi estremi, direzione, dominio e sequenza esatta dei tipi, minimizzando il costo delle sole aggiunte dichiarate. Supporta statico, co-validità e ordine di inizio; per le varianti temporali ogni candidato deve dichiarare intervalli compatibili con la codifica del grafo.",
      parameters: ["startNode", "goalNode", "edgeTypeSequence", "group", "direction", "temporalSemantics", "strictTemporalOrder", "edgeAdditions", "enumerateAllOptima"],
      inputPredicates: ["node/1", "group/2", "edge_record/1", "edge_source/2", "edge_target/2", "edge_type/2", "edge_valid_from/2", "edge_valid_to/2", "cf_typed_path_candidate/5", "cf_typed_path_candidate/7"],
      resultKind: "counterfactual",
      parser: "parseTypedPathCompletionCounterfactuals",
      witnessPredicates: ["typed_path_node/2", "typed_path_edge/2", "typed_path_time/1", "typed_path_ordered_support/3", "typed_path_edge_support/2", "cf_typed_path_add_edge/1"],
      resultFields: ["totalCost", "path", "addedEdges"],
      supportedEnumeration: ["one-proven-minimum-cost-proposal", "all-minimum-cost"],
      visualization: "Evidenzia il cammino verificato, i record candidati aggiunti e, quando presente, la prova temporale.",
      requiredCapabilities: ["edgeTypes"]
    }, {
      id: "typedPathCompletionWhyNot",
      aspEncoding: "typed-path-candidate-supergraph-reachability-certificate",
      encodingVersion: 1,
      querySemantics: "Costruisce la chiusura di raggiungibilità per prefissi della sequenza tipizzata nel supergrafo che contiene tutte le aggiunte candidate; il certificato spiega dove si interrompe il percorso oppure se il target è raggiungibile solo come walk con rivisite, non come cammino semplice.",
      parameters: ["startNode", "goalNode", "edgeTypeSequence", "group", "direction", "edgeAdditions"],
      inputPredicates: ["node/1", "group/2", "edge_record/1", "edge_source/2", "edge_target/2", "edge_type/2", "cf_typed_path_why_not_candidate/1"],
      resultKind: "certificate",
      parser: "parseTypedPathCompletionWhyNotCertificate",
      witnessPredicates: ["typed_path_no_route_step/1", "typed_path_no_route_node/2", "typed_path_no_route_goal_reachable/0", "cf_typed_path_why_not_candidate/1"],
      resultFields: ["edgeTypeSequence", "reachableByStep", "goalReachableAsWalk", "firstEmptyStep", "candidateEdgeIds"],
      supportedEnumeration: ["one-complete-no-route-certificate"],
      visualization: "Mostra gli strati raggiungibili, il primo prefisso vuoto oppure la walk completa che viola la semplicità.",
      requiredCapabilities: ["edgeTypes"]
    }, {
      id: "typedPathTemporalNoRoute",
      aspEncoding: "maximum-temporal-typed-walk-prefix",
      encodingVersion: 1,
      querySemantics: "Dopo l'assenza di un cammino temporale semplice, massimizza la lunghezza del prefisso di walk tipizzata ammissibile e distingue se il target è raggiunto con eventuali rivisite; co-validità prova un istante comune minimo, orderedByStart riporta gli inizi temporali per passo. Non trasforma una walk con rivisite in un cammino semplice.",
      parameters: ["startNode", "goalNode", "edgeTypeSequence", "group", "direction", "temporalSemantics", "strictTemporalOrder"],
      inputPredicates: ["node/1", "group/2", "edge_record/1", "edge_source/2", "edge_target/2", "edge_type/2", "edge_valid_from/2", "edge_valid_to/2"],
      resultKind: "certificate",
      parser: "parseTypedPathTemporalNoRouteCertificate",
      witnessPredicates: ["temporal_typed_path_depth/1", "temporal_typed_path_node/2", "temporal_typed_path_edge/2", "temporal_typed_path_goal_reachable/0", "temporal_typed_path_common_start/1", "temporal_typed_path_ordered_start/3"],
      resultFields: ["edgeTypeSequence", "temporalSemantics", "walk", "maximumPrefixLength", "goalReachableAsWalk", "firstBlockedStep", "repeatedNodeIds", "commonTimeValue", "startTimeValuesByStep"],
      supportedEnumeration: ["one-proven-temporal-prefix-optimum"],
      visualization: "Evidenzia la massima walk temporale osservata e il vincolo che impedisce il passo successivo o un cammino semplice completo.",
      requiredCapabilities: ["edgeTypes", "edgeIntervals"]
    }, {
      id: "typedPathTemporalCompletionWhyNot",
      aspEncoding: "temporal-typed-path-candidate-supergraph-prefix-certificate",
      encodingVersion: 1,
      querySemantics: "Calcola il massimo prefisso temporale nel supergrafo formato da tutti gli archi osservati e tutti i candidati dichiarati, usando co-validità o ordine degli inizi. Riporta l'eventuale walk completa con rivisite e verifica indipendentemente i record, gli intervalli e il dominio; non converte una walk in un cammino semplice.",
      parameters: ["startNode", "goalNode", "edgeTypeSequence", "group", "direction", "temporalSemantics", "strictTemporalOrder", "edgeAdditions"],
      inputPredicates: ["node/1", "group/2", "edge_record/1", "edge_source/2", "edge_target/2", "edge_type/2", "edge_valid_from/2", "edge_valid_to/2", "cf_typed_path_temporal_why_not_candidate/1"],
      resultKind: "certificate",
      parser: "parseTypedPathTemporalCompletionWhyNotCertificate",
      witnessPredicates: ["temporal_typed_path_depth/1", "temporal_typed_path_node/2", "temporal_typed_path_edge/2", "temporal_typed_path_goal_reachable/0", "temporal_typed_path_common_start/1", "temporal_typed_path_ordered_start/3", "cf_typed_path_temporal_why_not_candidate/1"],
      resultFields: ["edgeTypeSequence", "temporalSemantics", "walk", "maximumPrefixLength", "goalReachableAsWalk", "firstBlockedStep", "repeatedNodeIds", "commonTimeValue", "startTimeValuesByStep", "candidateEdgeIds"],
      supportedEnumeration: ["one-proven-temporal-prefix-optimum"],
      visualization: "Evidenzia il massimo prefisso temporale, i candidati inclusi, i nodi rivisitati e la prova di co-validità o di ordine temporale.",
      requiredCapabilities: ["edgeTypes", "edgeIntervals"]
    }]
  },
  typedMotif: {
    id: "typedMotif",
    aspEncoding: "configured-typed-motif",
    encodingVersion: 1,
    querySemantics: "Istanzia ruoli di nodo e relazioni richieste dal template configurato, mantenendo la direzione dichiarata.",
    parameters: ["template", "group", "roleFilters", "enumeration", "countPartitionSize"],
    inputPredicates: ["node/1", "group/2", "node_type/2", "node_attribute/3", "edge_source/2", "edge_target/2", "edge_type/2", "edge_attribute/3"],
    resultKind: "roleAssignments",
    parser: "parseTypedMotifMatches",
    witnessPredicates: ["motif_match/2", "motif_edge_support/2", "motif_ordered_support/3"],
    resultFields: ["roles", "nodeIds", "timeValue", "supportingEdges", "absenceConditions", "inducedEdgeTypes"],
    resultContextFields: ["templateId", "label"],
    supportedEnumeration: ["all-distinct-role-assignments"],
    visualization: "Evidenzia ogni ruolo e i record che testimoniano ciascun pattern richiesto.",
    requiredCapabilities: ["nodeTypes", "edgeTypes"]
  },
  temporalMotif: {
    id: "temporalMotif",
    aspEncoding: "configured-temporal-motif",
    encodingVersion: 1,
    querySemantics: "Istanzia il template tipizzato rispettando co-validità o ordine temporale sugli intervalli degli archi mappati.",
    parameters: ["template", "group", "roleFilters", "temporalSemantics", "maximumSpan", "countPartitionSize"],
    inputPredicates: ["node/1", "group/2", "node_type/2", "node_attribute/3", "edge_source/2", "edge_target/2", "edge_type/2", "edge_attribute/3", "edge_valid_from/2", "edge_valid_to/2"],
    resultKind: "roleAssignments",
    parser: "parseTypedMotifMatches",
    witnessPredicates: ["motif_match/2", "motif_time/1", "motif_edge_support/2", "motif_ordered_support/3"],
    resultFields: ["roles", "nodeIds", "timeValue", "maximumSpan", "supportingEdges"],
    resultContextFields: ["templateId", "label"],
    supportedEnumeration: ["all-distinct-role-assignments"],
    visualization: "Evidenzia i ruoli e i record/tempi che testimoniano la realizzazione temporale.",
    requiredCapabilities: ["nodeTypes", "edgeTypes", "edgeIntervals"]
  },
  typedMotifNearMatch: {
    id: "typedMotifNearMatch",
    aspEncoding: "lexicographic-typed-motif-near-match",
    encodingVersion: 1,
    querySemantics: "Trova un assegnamento parziale ottimo: prima minimizza i ruoli senza candidato, poi relazioni richieste mancanti e relazioni vietate presenti; nella variante temporale minimizza inoltre gli impedimenti temporali secondo la priorità dichiarata nell'encoding. Intervalli assenti o invalidi sono diagnostica del task, non una condizione che lo disabilita; maximumSpan richiede comunque una metrica rappresentabile.",
    parameters: ["template", "group", "roleFilters", "temporalSemantics", "maximumSpan"],
    inputPredicates: [
      "node/1", "group/2", "node_type/2", "node_attribute/3", "edge_source/2", "edge_target/2",
      "edge_type/2", "edge_attribute/3", "edge_valid_from/2", "edge_valid_to/2", "asp_time_metric/3"
    ],
    resultKind: "nearMatch",
    parser: "parseTypedMotifNearMatches",
    witnessPredicates: [
      "motif_match/2", "motif_role_unassigned/1", "motif_edge_missing/1", "motif_edge_unresolved/1",
      "motif_absent_edge_violated/1", "motif_absent_edge_unresolved/1", "motif_absent_edge_violation_witness/2",
      "motif_edge_witness/2", "motif_diagnostic_time/1", "motif_diagnostic_active/2",
      "motif_temporal_unavailable/1", "motif_temporal_inactive/1", "motif_diagnostic_support/3",
      "motif_order_violation/2", "motif_temporal_span_violation/0"
    ],
    resultFields: [
      "roles", "missingRoles", "missingPatterns", "unresolvedPatterns", "violatedAbsencePatterns",
      "unresolvedAbsencePatterns", "supportingEdges", "temporalEvidence"
    ],
    resultContextFields: ["templateId", "label"],
    supportedEnumeration: ["one-proven-lexicographic-optimum"],
    visualization: "Evidenzia ruoli assegnati, relazioni mancanti o vietate e i testimoni temporali disponibili.",
    requiredCapabilities: ["nodeTypes", "edgeTypes"]
  },
  motifCompletionCounterfactual: {
    id: "motifCompletionCounterfactual",
    aspEncoding: "authorized-motif-completion-additions",
    encodingVersion: 1,
    querySemantics: "Minimizza il costo degli archi ipotetici scelti dal dominio edgeAdditions configurato e richiede che il template completo abbia un witness nel grafo esteso; ruoli, attributi, relazioni vietate e semantica temporale restano vincoli ASP. Nessun arco ipotetico viene inserito nel grafo osservato.",
    parameters: ["template", "group", "edgeAdditions", "candidateCosts", "temporalSemantics", "maximumSpan"],
    inputPredicates: [
      "node/1", "group/2", "node_type/2", "node_attribute/3", "edge_source/2", "edge_target/2",
      "edge_type/2", "edge_attribute/3", "edge_valid_from/2", "edge_valid_to/2", "asp_time_metric/3",
      "cf_candidate_edge/5", "cf_candidate_attribute/3", "cf_candidate_interval/3"
    ],
    resultKind: "counterfactual",
    parser: "parseTypedMotifCompletionCounterfactuals",
    witnessPredicates: ["cf_add_edge/1", "motif_match/2", "motif_edge_support/2", "motif_ordered_support/3", "motif_time/1"],
    resultFields: ["totalCost", "match", "addedEdges"],
    resultContextFields: ["templateId", "label"],
    supportedEnumeration: ["one-proven-minimum-cost-completion"],
    visualization: "Mostra separatamente archi osservati e aggiunte candidate, con costo e pattern supportati.",
    requiredCapabilities: ["nodeTypes", "edgeTypes"]
  },
  motifCount: {
    id: "motifCount",
    aspEncoding: "configured-motif-count",
    encodingVersion: 1,
    querySemantics: "Conta esattamente gli assegnamenti distinti dei ruoli nei template statici/co-validi; con orderedByStart conta sequenze temporali distinte, includendo record di arco e istanti di inizio. Non emette un answer set per istanza; somma partizioni disgiunte solo se tutte complete.",
    parameters: ["template", "group", "temporalSemantics", "maximumSpan", "partitionSize", "maxDurationMs"],
    inputPredicates: ["node/1", "group/2", "node_type/2", "node_attribute/3", "edge_source/2", "edge_target/2", "edge_type/2", "edge_attribute/3", "edge_valid_from/2", "edge_valid_to/2", "asp_time_metric/3"],
    resultKind: "exactCount",
    parser: "parseTypedMotifCount",
    witnessPredicates: ["motif_count/1"],
    resultFields: ["count"],
    applicationDerivedFields: ["partitionCount"],
    supportedEnumeration: ["single-query-aggregate", "complete-disjoint-partition-sum"],
    visualization: "Mostra il totale esatto e, per il piano partizionato, il numero di partizioni completate.",
    requiredCapabilities: ["nodeTypes", "edgeTypes"]
  },
  graphIntegrity: {
    id: "graphIntegrity",
    aspEncoding: "configured-graph-integrity-diagnosis",
    encodingVersion: 1,
    querySemantics: "Enumera tutte le violazioni dei vincoli dichiarati sul grafo schema v2 completo, dopo l'eventuale proiezione di provenienza scelta; i filtri visivi e temporali non restringono la diagnosi.",
    parameters: ["schemaVersion", "direction", "graphIntegrity", "provenanceScenario"],
    inputPredicates: [
      "node/1", "edge_record/1", "edge_source/2", "edge_target/2", "node_type/2", "edge_type/2",
      "node_attribute/3", "edge_attribute/3", "edge_valid_from/2", "edge_valid_to/2",
      "edge_valid_from_invalid/1", "edge_valid_to_invalid/1", "edge_valid_from_raw/2", "edge_valid_to_raw/2",
      "require_node_types/0", "require_edge_types/0", "allowed_node_type/1", "allowed_edge_type/1",
      "enforce_node_type_domain/0", "enforce_edge_type_domain/0", "integrity_edge_type/1",
      "allowed_endpoint_type/3", "required_node_attribute/2", "required_edge_attribute/2",
      "node_attribute_domain/2", "allowed_node_attribute/3", "edge_attribute_domain/2",
      "allowed_edge_attribute/3", "required_edge_interval/1", "unique_node_attribute/2",
      "unique_edge_attribute/2", "min_cardinality/4", "max_cardinality/4"
    ],
    resultKind: "violationList",
    parser: "parseIntegrityViolations",
    witnessPredicates: ["violation/5"],
    resultFields: ["kind", "subjectId", "nodeIds", "edgeIds", "edgeType", "attribute", "value", "expected", "expectedDescription", "actual"],
    supportedEnumeration: ["all-violations-complete"],
    visualization: "Raggruppa ogni violazione per gli ID sorgente dei nodi e degli archi coinvolti, senza modificare i dati.",
    requiredCapabilities: []
  },
  minimumIntegrityRepair: {
    id: "minimumIntegrityRepair",
    aspEncoding: "authorized-minimum-cost-integrity-repair",
    encodingVersion: 1,
    querySemantics: "Minimizza il costo totale tra le sole azioni di riparazione esplicitamente candidate e restituisce una proposta che elimina tutte le violazioni configurate; la proposta non viene applicata ai dati.",
    parameters: ["schemaVersion", "direction", "graphIntegrity", "repairSuggestions", "provenanceScenario"],
    inputPredicates: [
      "node/1", "edge_record/1", "edge_source/2", "edge_target/2", "node_type/2", "edge_type/2",
      "node_attribute/3", "edge_attribute/3", "edge_valid_from/2", "edge_valid_to/2",
      "edge_valid_from_invalid/1", "edge_valid_to_invalid/1", "edge_valid_from_raw/2", "edge_valid_to_raw/2",
      "edge_valid_from_raw_exact/2", "edge_valid_to_raw_exact/2",
      "require_node_types/0", "require_edge_types/0", "allowed_node_type/1", "allowed_edge_type/1",
      "enforce_node_type_domain/0", "enforce_edge_type_domain/0", "integrity_edge_type/1",
      "allowed_endpoint_type/3", "required_node_attribute/2", "required_edge_attribute/2",
      "node_attribute_domain/2", "allowed_node_attribute/3", "edge_attribute_domain/2",
      "allowed_edge_attribute/3", "required_edge_interval/1", "unique_node_attribute/2",
      "unique_edge_attribute/2", "min_cardinality/4", "max_cardinality/4",
      "repair_candidate/2", "repair_node_attribute/5", "repair_edge_attribute/5",
      "repair_node_attribute_replacement/6", "repair_edge_attribute_replacement/6",
      "repair_node_type_replacement/5", "repair_edge_type_replacement/5", "repair_edge_interval_replacement/5",
      "repair_edge_interval_expected_from_valid/2", "repair_edge_interval_expected_from_missing/1",
      "repair_edge_interval_expected_from_invalid/2", "repair_edge_interval_expected_to_valid/2",
      "repair_edge_interval_expected_to_missing/1", "repair_edge_interval_expected_to_invalid/2"
    ],
    resultKind: "integrityRepair",
    parser: "parseIntegrityRepairProposal",
    witnessPredicates: [
      "remove_edge/1", "fill_node_attribute/1", "fill_edge_attribute/1", "replace_node_attribute/1",
      "replace_edge_attribute/1", "replace_node_type/1", "replace_edge_type/1", "replace_edge_interval/1"
    ],
    resultFields: [
      "edgeIds", "edgeCosts", "nodeAttributes", "edgeAttributes", "nodeAttributeReplacements",
      "edgeAttributeReplacements", "nodeTypeReplacements", "edgeTypeReplacements", "edgeIntervalReplacements", "cost"
    ],
    supportedEnumeration: ["one-proven-minimum-cost-proposal"],
    visualization: "Mostra azioni candidate, valori attesi e proposti e costo; il grafo originale rimane invariato.",
    requiredCapabilities: []
  },
  signedTriads: {
    id: "signedTriads",
    aspEncoding: "structural-balance-signed-triads",
    encodingVersion: 1,
    querySemantics: "Classifica ogni triangolo completo della coorte come bilanciato se ha un numero pari di dyadi negative; richiede polarità univoche per dyade, una configurazione positiva/negativa disgiunta e un grafo non orientato schema v2. Un sottoinsieme di edgeTypes opzionale limita la relazione firmata; se omesso, tutti i tipi di arco restano nel dominio.",
    parameters: ["attribute", "positiveValues", "negativeValues", "edgeTypes", "group"],
    inputPredicates: ["signed_candidate/1", "signed_pair/4"],
    resultKind: "triadClassification",
    parser: "parseSignedTriadResults",
    witnessPredicates: ["signed_triad/7"],
    resultFields: ["nodeIds", "balanced", "negativeDyadCount", "dyads"],
    supportedEnumeration: ["all-complete-signed-triads"],
    visualization: "Evidenzia i tre nodi e i record sorgente che sostengono ciascuna delle tre dyadi.",
    requiredCapabilities: []
  },
  dominatingSet: {
    id: "dominatingSet",
    aspEncoding: "minimum-dominating-set",
    encodingVersion: 1,
    querySemantics: "Sceglie un insieme minimo dal dominio candidato che copre ogni nodo obiettivo con sé stesso o un arco adiacente.",
    parameters: ["candidateGroup", "targetGroup", "enumerateAllOptima"],
    inputPredicates: ["node/1", "group/2", "edge/2"],
    resultKind: "nodeSet",
    parser: "parseWitnessDominatingSetExplanations",
    witnessPredicates: ["in/1", "dominated_by/2"],
    resultFields: ["nodeIds", "coveragePairs"],
    supportedEnumeration: ["one-minimum", "all-minimum"],
    visualization: "Evidenzia i candidati selezionati, i nodi coperti e il relativo supporto.",
    requiredCapabilities: ["undirectedAdjacency"]
  },
  minimumNodeSeparator: {
    id: "minimumNodeSeparator",
    aspEncoding: "minimum-node-separator",
    encodingVersion: 1,
    querySemantics: "Rimuove il minor numero di nodi ammessi, proteggendo i terminali e separando la sorgente dalla meta.",
    parameters: ["startNodeId", "goalNodeId", "removableGroup", "enumerateAllOptima"],
    inputPredicates: ["node/1", "group/2", "edge/2"],
    resultKind: "separator",
    parser: "parseWitnessRemovedNodeSetExplanations",
    witnessPredicates: ["removed/1", "reachable/1"],
    resultFields: ["removedIds", "reachableNodeIds"],
    supportedEnumeration: ["one-minimum", "all-minimum"],
    visualization: "Evidenzia nodi rimossi, lato raggiungibile e certificato di separazione.",
    requiredCapabilities: []
  },
  minimumCostNodeSeparator: {
    id: "minimumCostNodeSeparator",
    aspEncoding: "minimum-cost-node-separator",
    encodingVersion: 1,
    querySemantics: "Minimizza il costo intero positivo configurato dei nodi rimovibili, proteggendo i terminali.",
    parameters: ["startNodeId", "goalNodeId", "removableGroup", "removalCost", "enumerateAllOptima"],
    inputPredicates: ["node/1", "group/2", "edge/2", "node_removal_cost/2"],
    resultKind: "separator",
    parser: "parseWitnessRemovedNodeSetExplanations",
    witnessPredicates: ["removed/1", "reachable/1"],
    resultFields: ["removedIds", "reachableNodeIds"],
    applicationDerivedFields: ["minimumNodeRemovalCost"],
    supportedEnumeration: ["one-minimum-cost", "all-minimum-cost"],
    visualization: "Evidenzia nodi rimossi, costi, totale e lato raggiungibile.",
    requiredCapabilities: ["nodeRemovalCosts"]
  },
  minimumEdgeSeparator: {
    id: "minimumEdgeSeparator",
    aspEncoding: "minimum-edge-separator",
    encodingVersion: 1,
    querySemantics: "Rimuove il minor numero di record d'arco, mantenendo distinti gli archi paralleli, per separare due terminali.",
    parameters: ["startNodeId", "goalNodeId", "group", "enumerateAllOptima"],
    inputPredicates: ["cut_edge_record/1", "cut_edge_source/2", "cut_edge_target/2"],
    resultKind: "separator",
    parser: "parseWitnessRemovedEdgeSetExplanations",
    witnessPredicates: ["removed_edge/1", "reachable/1"],
    resultFields: ["removedIds", "reachableNodeIds"],
    supportedEnumeration: ["one-minimum", "all-minimum"],
    visualization: "Evidenzia i record rimossi e il lato sorgente dopo la rimozione.",
    requiredCapabilities: []
  },
  minimumCostEdgeSeparator: {
    id: "minimumCostEdgeSeparator",
    aspEncoding: "minimum-cost-edge-separator",
    encodingVersion: 1,
    querySemantics: "Minimizza il costo intero positivo configurato dei record d'arco rimossi per separare due terminali.",
    parameters: ["startNodeId", "goalNodeId", "group", "removalCost", "enumerateAllOptima"],
    inputPredicates: ["cut_edge_record/1", "cut_edge_source/2", "cut_edge_target/2", "cut_edge_removal_cost/2"],
    resultKind: "separator",
    parser: "parseWitnessRemovedEdgeSetExplanations",
    witnessPredicates: ["removed_edge/1", "reachable/1"],
    resultFields: ["removedIds", "reachableNodeIds"],
    applicationDerivedFields: ["minimumCutCost"],
    supportedEnumeration: ["one-minimum-cost", "all-minimum-cost"],
    visualization: "Evidenzia i record rimossi, i costi, il totale e il lato sorgente.",
    requiredCapabilities: ["edgeRemovalCosts"]
  },
  communities: {
    id: "communities",
    aspEncoding: "exact-modularity-partition",
    encodingVersion: 1,
    querySemantics: "Partiziona il dominio selezionato massimizzando la modularità esatta con risoluzione e vincoli dichiarati.",
    parameters: ["group", "resolution", "communityConstraints", "useEdgeWeights", "enumerateAllOptima"],
    inputPredicates: ["modularity_candidate/1", "modularity_edge/3", "modularity_degree/2", "modularity_m/1", "modularity_resolution/2", "modularity_edge_weight/2", "must_link/2", "cannot_link/2", "minimum_community_count/1", "maximum_community_count/1", "community_attribute_min/2", "community_attribute_max/2", "community_attribute_member/2", "modularity_component/2", "modularity_pair_score/3", "modularity_pairwise_offset/1"],
    resultKind: "communityPartition",
    parser: "parseWitnessModularityPartitions",
    witnessPredicates: ["community/2", "internal_edge/2", "community_edge_count/2", "community_internal_weight/2", "community_volume/2", "community_score/2"],
    resultFields: ["communities", "scaledScore", "communityContributions"],
    applicationDerivedFields: ["attributeBoundCounts"],
    supportedEnumeration: ["one-optimum", "all-optima"],
    visualization: "Colora ogni comunità ed evidenzia i nodi e gli archi di supporto.",
    requiredCapabilities: ["undirectedAdjacency"],
    supportingQueries: [{
      id: "communityConstraintDiagnosis",
      aspEncoding: "minimum-community-constraint-relaxation",
      encodingVersion: 1,
      querySemantics: "Trova il sottoinsieme a costo minimo di vincoli dichiarati da sospendere affinché esista una partizione valida; fatti e topologia del grafo restano fissi.",
      parameters: ["communityConstraints", "relaxationCosts", "enumerateAllOptima"],
      inputPredicates: [
        "modularity_candidate/1", "community_constraint/1", "community_constraint_relaxation_cost/2",
        "community_constraint_min_count/2", "community_constraint_max_count/2",
        "community_constraint_must_link/3", "community_constraint_cannot_link/3",
        "community_constraint_attribute_bound/4", "community_attribute_member/2"
      ],
      resultKind: "constraintDiagnosis",
      parser: "parseCommunityConstraintDiagnosisResult",
      witnessPredicates: ["community/2", "relax_constraint/1", "relaxation_cost/1", "partition_score/1"],
      resultFields: ["relaxationCost", "relaxedConstraintCount", "relaxedConstraints", "partition"],
      supportedEnumeration: ["one-optimum", "all-optima"],
      visualization: "Mostra i vincoli sospesi, i relativi costi e una partizione che soddisfa i vincoli residui.",
      requiredCapabilities: ["undirectedAdjacency"]
    }, {
      id: "communityPairOptimalMembership",
      aspEncoding: "pairwise-constrained-modularity-optima",
      encodingVersion: 1,
      querySemantics: "Confronta due ottimi ASP: uno vincolato a tenere insieme la coppia e uno a separarla. I punteggi interi sono confrontati con l'ottimo globale già provato per classificare la relazione come always, sometimes o never senza enumerare tutti i pareggi.",
      parameters: ["nodePair", "globalOptimum", "resolution", "communityConstraints", "useEdgeWeights"],
      inputPredicates: [
        "modularity_candidate/1", "modularity_edge/3", "modularity_degree/2", "modularity_m/1",
        "modularity_resolution/2", "modularity_edge_weight/2", "must_link/2", "cannot_link/2",
        "minimum_community_count/1", "maximum_community_count/1", "community_attribute_min/2",
        "community_attribute_max/2", "community_attribute_member/2",
        "modularity_pair_score/3", "modularity_pairwise_offset/1"
      ],
      resultKind: "optimumMembership",
      parser: "parseWitnessModularityPartitions / classifyCommunityPairOptimumMembership",
      witnessPredicates: ["community/2"],
      resultFields: ["nodeIds", "relation", "globalScaledScore", "togetherScaledScore", "separateScaledScore"],
      supportedEnumeration: ["one-optimum"],
      visualization: "Classifica la co-appartenenza ottima della coppia e permette di evidenziare entrambi i nodi nella partizione corrente.",
      requiredCapabilities: ["undirectedAdjacency"]
    }, {
      id: "communityTopologyEditSelection",
      aspEncoding: "minimum-cost-community-topology-edit-selector",
      encodingVersion: 1,
      querySemantics: "Seleziona in ordine di costo non decrescente un sottoinsieme dei soli edit topologici dichiarati, escludendo quelli già verificati. Ogni grafo modificato deve poi superare le query ASP separate per i punteggi di co-appartenenza; il selettore da solo non prova la relazione comunitaria né la causalità dell'edit.",
      parameters: ["edgeEdits", "excludedEditSets"],
      inputPredicates: ["community_edit_candidate/1", "community_edit_cost/2"],
      resultKind: "counterfactual",
      parser: "parseCommunityEditSelectionWitnesses",
      witnessPredicates: ["community_selected_edit/1"],
      resultFields: ["indexes", "totalCost"],
      supportedEnumeration: ["one-minimum-cost"],
      visualization: "Gli indici selezionati vengono mappati agli edit candidati; il risultato complessivo è accettato solo dopo aver provato gli ottimi di modularità del grafo modificato.",
      requiredCapabilities: ["undirectedAdjacency"]
    }]
  }
});

export interface GraphTaskContractRequestContext extends GraphTaskContractContext {
  direction?: "directed" | "undirected";
}

export function getGraphTaskContract(
  task: string,
  context: GraphTaskContractRequestContext = {}
): GraphTaskContract | null {
  if (!Object.prototype.hasOwnProperty.call(GRAPH_TASK_CONTRACTS, task)) return null;
  const definition = GRAPH_TASK_CONTRACTS[task as GraphTaskContractId];
  const requiredCapabilities = [...definition.requiredCapabilities];

  if (task === "kCore" && context.direction) {
    requiredCapabilities.push(context.direction === "directed" ? "directedEdges" : "undirectedAdjacency");
  }
  if ((task === "path" || task === "boundedPath" || task === "typedPath" ||
    task === "minimumNodeSeparator" || task === "minimumCostNodeSeparator" ||
    task === "minimumEdgeSeparator" || task === "minimumCostEdgeSeparator" ||
    task === "typedMotif" || task === "temporalMotif" || task === "typedMotifNearMatch" ||
    task === "motifCompletionCounterfactual" || task === "motifCount") && context.direction === "directed") {
    requiredCapabilities.push("directedEdges");
  }
  if (task === "typedPath" && context.temporalSemantics && context.temporalSemantics !== "static") {
    requiredCapabilities.push("edgeIntervals");
  }
  if ((task === "motifCount" || task === "motifCompletionCounterfactual") &&
    context.temporalSemantics && context.temporalSemantics !== "static") {
    requiredCapabilities.push("edgeIntervals");
  }
  if (task === "communities" && context.useEdgeWeights) {
    requiredCapabilities.push("modularityWeights");
  }

  return {
    ...definition,
    requiredCapabilities: [...new Set(requiredCapabilities)]
  };
}

export function getGraphTaskRequirements(
  task: string,
  context: GraphTaskContractRequestContext = {}
): GraphCapabilityId[] | null {
  return getGraphTaskContract(task, context)?.requiredCapabilities.slice() ?? null;
}

const ENUMERATES_ALL_OPTIMA_TASKS: ReadonlySet<string> = new Set([
  "dominatingSet",
  "minimumNodeSeparator",
  "minimumCostNodeSeparator",
  "minimumEdgeSeparator",
  "minimumCostEdgeSeparator",
  "communities"
]);

/** Resolves the selected solver enumeration protocol and validates it against the task contract. */
export function resolveTaskEnumeration(
  task: string,
  context: GraphTaskEnumerationContext = {}
): GraphTaskEnumerationId | null {
  const contract = getGraphTaskContract(task);
  if (!contract) return null;

  let enumeration: GraphTaskEnumerationId | undefined;
  if (task === "clique") {
    enumeration = resolveCliqueMode(context.cliqueMode);
  } else if (task === "kPlex" || task === "contextualClique") {
    enumeration = context.enumerateAllOptima ? "all-maximum" : "one-maximum";
  } else if (task === "maximalKPlex") {
    enumeration = context.enumerateAllMaximalKPlex ? "all-maximal" : "certified-one-maximal";
  } else if (task === "kCore") {
    enumeration = "unique-core";
  } else if (task === "motifCount") {
    enumeration = context.partitionedCount ? "complete-disjoint-partition-sum" : "single-query-aggregate";
  } else if (ENUMERATES_ALL_OPTIMA_TASKS.has(task)) {
    enumeration = context.enumerateAllOptima
      ? task === "communities" ? "all-optima"
        : task === "minimumCostNodeSeparator" || task === "minimumCostEdgeSeparator" ? "all-minimum-cost"
          : "all-minimum"
      : task === "communities" ? "one-optimum"
        : task === "minimumCostNodeSeparator" || task === "minimumCostEdgeSeparator" ? "one-minimum-cost"
          : "one-minimum";
  } else if (contract.supportedEnumeration.length === 1) {
    enumeration = contract.supportedEnumeration[0];
  }

  return enumeration && contract.supportedEnumeration.includes(enumeration)
    ? enumeration
    : null;
}

export function getTaskEnumerationDescription(
  task: string,
  context: GraphTaskEnumerationContext = {}
): string {
  const enumeration = resolveTaskEnumeration(task, context);
  if (!enumeration) return "modalita di enumerazione non dichiarata dal contratto";

  if (enumeration === "maximal") {
    const minimumSize = Number.isSafeInteger(context.minimumCliqueSize) && context.minimumCliqueSize! >= 0
      ? `di cardinalit\u00e0 almeno ${context.minimumCliqueSize}`
      : "rispettando la soglia minima selezionata";
    return `tutte le clique massimali per inclusione ${minimumSize}`;
  }
  if (enumeration === "all") {
    const minimumSize = Number.isSafeInteger(context.minimumCliqueSize) && context.minimumCliqueSize! >= 0
      ? `di cardinalit\u00e0 almeno ${context.minimumCliqueSize}`
      : "rispettando la soglia minima selezionata";
    return `tutte le clique ${minimumSize}, incluse le sotto-clique`;
  }
  if (enumeration === "maximum") {
    const minimumSize = Number.isSafeInteger(context.minimumCliqueSize) && context.minimumCliqueSize! >= 0
      ? `di cardinalit\u00e0 almeno ${context.minimumCliqueSize}`
      : "rispettando la soglia minima selezionata";
    return `tutte le clique di cardinalit\u00e0 massima ${minimumSize}`;
  }

  const descriptions: Readonly<Record<Exclude<GraphTaskEnumerationId, GraphCliqueMode>, string>> = {
    "one-maximum": "un solo ottimo",
    "all-maximum": "enumerazione di tutti gli ottimi",
    "certified-one-maximal": "un k-plex massimale certificato",
    "all-maximal": "enumerazione di tutti i k-plex massimali",
    "unique-core": "unico k-core alla soglia scelta",
    "complete-deterministic-partition": "partizione completa deterministica",
    "one-shortest-path": "un cammino semplice di lunghezza minima entro il limite configurato",
    "one-complete-no-route-certificate": "un certificato completo di mancato raggiungimento entro il limite",
    "one-complete-blocker-certificate": "un certificato completo con coppie non completabili e nodi bloccanti",
    "one-complete-peeling-certificate": "un certificato completo o limitato al prefisso di peeling fino al nodo obiettivo",
    "one-proven-temporal-prefix-optimum": "un prefisso temporale ottimo con obiettivo provato",
    "one-route-witness": "un cammino testimone per la sequenza tipizzata richiesta",
    "all-distinct-role-assignments": "enumerazione completa degli assegnamenti distinti del template",
    "one-proven-lexicographic-optimum": "un near-match ottimo secondo le priorit\u00e0 lessicografiche ASP",
    "one-proven-minimum-cost-completion": "una proposta di costo minimo provata sui candidati configurati",
    "single-query-aggregate": "conteggio aggregato esatto da una query ASP completa",
    "complete-disjoint-partition-sum": "somma esatta solo dopo il completamento di tutte le partizioni disgiunte",
    "all-violations-complete": "enumerazione completa di tutte le violazioni dichiarate",
    "one-proven-minimum-cost-proposal": "una proposta minima con ottimalit\u00e0 provata",
    "all-complete-signed-triads": "enumerazione completa dei triangoli con tre dyadi firmate coerenti",
    "one-minimum": "un solo ottimo",
    "all-minimum": "enumerazione di tutti gli ottimi",
    "one-minimum-cost": "un solo ottimo",
    "all-minimum-cost": "enumerazione di tutti gli ottimi",
    "one-optimum": "un solo ottimo",
    "all-optima": "enumerazione di tutti gli ottimi"
  };
  return descriptions[enumeration];
}

/** Resolves the configured clique mode against the modes declared by its ASP contract. */
export function resolveCliqueMode(configuredMode: unknown): GraphCliqueMode {
  const supportedModes = GRAPH_TASK_CONTRACTS.clique.supportedEnumeration;
  const fallback: GraphCliqueMode = "maximal";
  if (!supportedModes.includes(fallback)) {
    throw new Error("Il contratto ASP della clique deve dichiarare la modalit\u00e0 maximal.");
  }
  return typeof configuredMode === "string" && (supportedModes as readonly string[]).includes(configuredMode)
    ? configuredMode as GraphCliqueMode
    : fallback;
}
