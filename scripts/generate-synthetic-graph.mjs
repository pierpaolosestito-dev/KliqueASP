import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const examplesDirectory = path.join(root, "src/lib/kliqueasp/data/examples");
const cohortCount = 12;
const peoplePerCohort = 12;
const projectCount = 6;
const nodes = [];
const edges = [];
let edgeSequence = 0;

const pad = (value, width = 3) => String(value).padStart(width, "0");
const personId = (cohortIndex, memberIndex) => `person-${pad(cohortIndex * peoplePerCohort + memberIndex + 1)}`;
const unitId = (cohortIndex) => `unit-${pad(cohortIndex + 1, 2)}`;
const projectId = (projectIndex) => `project-${pad(projectIndex + 1, 2)}`;
const stableSocialPolarity = (left, right) => {
  const first = Math.min(left, right);
  const second = Math.max(left, right);
  return (first * 3 + second * 5) % 7 === 0 ? -1 : 1;
};

for (let cohortIndex = 0; cohortIndex < cohortCount; cohortIndex += 1) {
  const cohort = `cohort-${pad(cohortIndex + 1, 2)}`;
  const project = projectId(cohortIndex % projectCount);
  const discipline = ["logica", "sociologia", "informatica", "statistica"][cohortIndex % 4];

  nodes.push({
    id: unitId(cohortIndex),
    label: `Unità di ricerca ${pad(cohortIndex + 1, 2)}`,
    type: "unit",
    roles: ["context", "research-unit"],
    groups: [cohort],
    discipline,
    careerStage: "not-applicable",
    qualityStatus: "verified",
    registryCode: `U-${pad(cohortIndex + 1, 2)}`,
    removalCost: 4 + cohortIndex % 3
  });

  for (let memberIndex = 0; memberIndex < peoplePerCohort; memberIndex += 1) {
    const globalIndex = cohortIndex * peoplePerCohort + memberIndex;
    const careerStage = memberIndex < 3 ? "senior" : memberIndex < 7 ? "mid" : "early";
    const roles = ["researcher", careerStage];
    if (memberIndex < 3) roles.push("mentor");
    if (memberIndex >= 7) roles.push("mentee");
    nodes.push({
      id: personId(cohortIndex, memberIndex),
      label: `Ricercatore ${pad(globalIndex + 1)}`,
      type: "person",
      roles,
      groups: [cohort, project],
      discipline,
      careerStage,
      qualityStatus: globalIndex === 0 ? "unverified" : "verified",
      registryCode: `R-${pad(globalIndex + 1)}`,
      removalCost: 1 + globalIndex % 5
    });
  }
}

for (let projectIndex = 0; projectIndex < projectCount; projectIndex += 1) {
  nodes.push({
    id: projectId(projectIndex),
    label: `Progetto collaborativo ${pad(projectIndex + 1, 2)}`,
    type: "project",
    roles: ["context", "research-project"],
    groups: [`project-${pad(projectIndex + 1, 2)}`],
    discipline: ["logica", "sociologia", "informatica", "statistica"][projectIndex % 4],
    careerStage: "not-applicable",
    qualityStatus: "verified",
    registryCode: `P-${pad(projectIndex + 1, 2)}`,
    removalCost: 5 + projectIndex % 2
  });
}

function addEdge({
  id,
  source,
  target,
  type,
  polarity,
  weight,
  year,
  duration = 1,
  channel,
  provenance
}) {
  edgeSequence += 1;
  edges.push({
    id: id ?? `synthetic-edge-${pad(edgeSequence, 5)}`,
    source,
    target,
    type,
    polarity,
    channel,
    eventRef: `event-${pad(edgeSequence, 5)}`,
    weight,
    cutCost: 1 + edgeSequence % 4,
    confidence: Number((0.64 + (edgeSequence % 34) / 100).toFixed(2)),
    validFrom: year,
    validTo: year + duration,
    provenance
  });
}

function provenanceFor(index) {
  const sources = [
    "synthetic-fieldwork-2024",
    "synthetic-project-log-2025",
    "synthetic-interviews-2026"
  ];
  const first = sources[index % sources.length];
  return index % 5 === 0 ? [first, sources[(index + 1) % sources.length]] : [first];
}

// Within each unit, a ring with two chords per node creates overlapping
// cliques, k-plexes and cores without turning each cohort into one trivial clique.
for (let cohortIndex = 0; cohortIndex < cohortCount; cohortIndex += 1) {
  for (let memberIndex = 0; memberIndex < peoplePerCohort; memberIndex += 1) {
    const globalIndex = cohortIndex * peoplePerCohort + memberIndex;
    for (const distance of [1, 2]) {
      const targetIndex = (memberIndex + distance) % peoplePerCohort;
      const polarity = stableSocialPolarity(globalIndex, cohortIndex * peoplePerCohort + targetIndex);
      const year = 2021 + (cohortIndex + memberIndex + distance) % 5;
      addEdge({
        source: personId(cohortIndex, memberIndex),
        target: personId(cohortIndex, targetIndex),
        type: "social-tie",
        polarity,
        weight: 1 + (cohortIndex + memberIndex * 2 + distance) % 5,
        year,
        duration: 1 + (memberIndex + distance) % 2,
        channel: ["survey", "field-note", "workshop"][(cohortIndex + memberIndex) % 3],
        provenance: provenanceFor(edgeSequence)
      });
    }

    if (memberIndex % 2 === 0) {
      const targetIndex = (memberIndex + 3) % peoplePerCohort;
      addEdge({
        source: personId(cohortIndex, memberIndex),
        target: personId(cohortIndex, targetIndex),
        type: "social-tie",
        polarity: stableSocialPolarity(globalIndex, cohortIndex * peoplePerCohort + targetIndex),
        weight: 2 + (cohortIndex + memberIndex) % 4,
        year: 2022 + (cohortIndex + memberIndex) % 4,
        duration: 2,
        channel: "project-log",
        provenance: provenanceFor(edgeSequence)
      });
    }

    // Repeated event records preserve a real multigraph use case.
    if (memberIndex % 4 === 0) {
      addEdge({
        source: personId(cohortIndex, memberIndex),
        target: personId(cohortIndex, (memberIndex + 1) % peoplePerCohort),
        type: "social-tie",
        polarity: stableSocialPolarity(globalIndex, cohortIndex * peoplePerCohort + (memberIndex + 1) % peoplePerCohort),
        weight: 1 + (cohortIndex + memberIndex) % 5,
        year: 2025 + (cohortIndex + memberIndex) % 2,
        duration: 1,
        channel: "follow-up",
        provenance: provenanceFor(edgeSequence)
      });
    }
  }

  for (let mentorIndex = 0; mentorIndex < 3; mentorIndex += 1) {
    addEdge({
      source: personId(cohortIndex, mentorIndex),
      target: personId(cohortIndex, 7 + mentorIndex),
      type: "mentoring",
      polarity: 1,
      weight: 2 + (cohortIndex + mentorIndex) % 4,
      year: 2022 + (cohortIndex + mentorIndex) % 4,
      duration: 2,
      channel: "mentoring-program",
      provenance: provenanceFor(edgeSequence)
    });
  }
}

// Bridges make the whole network navigable while retaining its cohort structure.
for (let cohortIndex = 0; cohortIndex < cohortCount; cohortIndex += 1) {
  const nextCohort = (cohortIndex + 1) % cohortCount;
  addEdge({
    source: personId(cohortIndex, 0),
    target: personId(nextCohort, 0),
    type: "collaboration",
    polarity: 1,
    weight: 2 + cohortIndex % 4,
    year: 2023 + cohortIndex % 3,
    duration: 2,
    channel: "cross-unit-project",
    provenance: provenanceFor(edgeSequence)
  });
  addEdge({
    source: personId(cohortIndex, 4),
    target: personId(nextCohort, 9),
    type: "social-tie",
    polarity: stableSocialPolarity(
      cohortIndex * peoplePerCohort + 4,
      nextCohort * peoplePerCohort + 9
    ),
    weight: 1 + cohortIndex % 5,
    year: 2024 + cohortIndex % 2,
    duration: 1,
    channel: "cross-unit-workshop",
    provenance: provenanceFor(edgeSequence)
  });
}

// Context incidences support group filters, shared-context cliques and motifs.
for (let cohortIndex = 0; cohortIndex < cohortCount; cohortIndex += 1) {
  for (let memberIndex = 0; memberIndex < peoplePerCohort; memberIndex += 1) {
    const source = personId(cohortIndex, memberIndex);
    addEdge({
      source,
      target: unitId(cohortIndex),
      type: "member-of",
      polarity: 0,
      weight: 1,
      year: 2021 + (cohortIndex + memberIndex) % 5,
      duration: 3,
      channel: "registry",
      provenance: provenanceFor(edgeSequence)
    });
    addEdge({
      source,
      target: projectId(cohortIndex % projectCount),
      type: "participates-in",
      polarity: 0,
      weight: 1 + memberIndex % 3,
      year: 2022 + (cohortIndex + memberIndex) % 4,
      duration: 2,
      channel: "project-log",
      provenance: provenanceFor(edgeSequence)
    });
  }
}

// One intentionally misclassified record makes integrity diagnosis and repair
// demonstrable without invalidating the graph mapping or other task inputs.
addEdge({
  id: "synthetic-membership-mismatch",
  source: personId(0, 0),
  target: projectId(0),
  type: "member-of",
  polarity: 0,
  weight: 1,
  year: 2025,
  duration: 1,
  channel: "registry",
  provenance: ["synthetic-project-log-2025"]
});

const edgeTypes = ["social-tie", "mentoring", "collaboration", "member-of", "participates-in"];
const graphAnalysis = {
  motifs: [
    {
      id: "mentoring-pair",
      label: "Mentoring tra un ricercatore senior e uno early-career",
      roles: {
        mentor: { nodeTypes: ["person"], attributes: { careerStage: "senior" } },
        mentee: { nodeTypes: ["person"], attributes: { careerStage: "early" } }
      },
      edges: [{ sourceRole: "mentor", targetRole: "mentee", edgeType: "mentoring", attributes: { polarity: 1 } }]
    },
    {
      id: "ordered-research-chain",
      label: "Due collaborazioni in ordine temporale",
      roles: {
        first: { nodeTypes: ["person"] },
        middle: { nodeTypes: ["person"] },
        last: { nodeTypes: ["person"] }
      },
      edges: [
        { sourceRole: "first", targetRole: "middle", edgeType: "social-tie" },
        { sourceRole: "middle", targetRole: "last", edgeType: "social-tie" }
      ],
      temporal: { semantics: "orderedByStart", strict: true }
    }
  ],
  motifCount: { partitionSize: 8, maxDurationMs: 300_000 },
  communities: {
    useEdgeWeights: true,
    resolution: 1,
    mustLink: [[personId(0, 0), personId(0, 1)]],
    cannotLink: [[personId(0, 0), personId(6, 0)]],
    attributeBounds: [{ attribute: "careerStage", value: "early", minPerCommunity: 1 }],
    topologyCounterfactuals: {
      edgeEdits: [
        { id: "join-research-units", action: "add", sourceNodeId: personId(0, 0), targetNodeId: personId(6, 0), cost: 2, weight: 2 },
        { id: "remove-first-social-record", action: "remove", edgeId: edges[0].id, cost: 1 }
      ]
    }
  },
  provenanceScenarios: {
    scenarios: [
      { id: "fieldwork", label: "Rilievi sul campo", sources: ["synthetic-fieldwork-2024"] },
      { id: "project-log", label: "Registri di progetto", sources: ["synthetic-project-log-2025"] },
      { id: "all-sources", label: "Tutte le fonti sintetiche", sources: [
        "synthetic-fieldwork-2024", "synthetic-project-log-2025", "synthetic-interviews-2026"
      ] }
    ],
    unattributedEdges: "exclude",
    worldAssumption: "finite-exhaustive-worlds"
  },
  counterfactuals: {
    edgeAdditions: [{
      id: "candidate-cross-unit-social-tie",
      sourceNodeId: personId(0, 0),
      targetNodeId: personId(6, 0),
      edgeType: "social-tie",
      cost: 2,
      attributes: { polarity: 1, channel: "counterfactual" },
      validity: { from: 2026, to: 2027 }
    }]
  }
};

const baseConfig = {
  schemaVersion: 2,
  features: {
    filters: true,
    timeline: true,
    labelVisibilityToggle: true,
    nodeLabelsVisibleByDefault: false
  },
  timeline: { start: 2021, end: 2027, debounceMs: 140 },
  nodeTypes: {
    person: { color: "#38bdf8" },
    unit: { color: "#f59e0b" },
    project: { color: "#c084fc" }
  },
  colors: {
    edgeTypes: {
      "social-tie": "#38bdf8",
      mentoring: "#f59e0b",
      collaboration: "#22c55e",
      "member-of": "#a78bfa",
      "participates-in": "#ec4899"
    }
  },
  graphMapping: {
    node: {
      idField: "$.id",
      labelField: "$.label",
      typeField: "$.type",
      roleField: "$.roles[*]",
      groupFields: ["$.groups[*]"],
      removalCostField: "$.removalCost",
      attributes: {
        discipline: "$.discipline",
        careerStage: "$.careerStage",
        qualityStatus: "$.qualityStatus",
        registryCode: "$.registryCode"
      }
    },
    edge: {
      idField: "$.id",
      sourceField: "$.source",
      targetField: "$.target",
      typeField: "$.type",
      direction: "undirected",
      identity: "multigraph",
      validity: { fromField: "$.validFrom", toField: "$.validTo" },
      weightField: "$.weight",
      removalCostField: "$.cutCost",
      confidenceField: "$.confidence",
      confidenceRange: { min: 0, max: 1 },
      provenanceField: "$.provenance",
      attributes: {
        polarity: "$.polarity",
        channel: "$.channel",
        eventRef: "$.eventRef"
      }
    }
  },
  graphIntegrity: {
    requireNodeTypes: true,
    requireEdgeTypes: true,
    allowedNodeTypes: ["person", "unit", "project"],
    allowedEdgeTypes: edgeTypes,
    requiredEdgeIntervals: edgeTypes,
    edgeTypeDomains: [
      { edgeType: "mentoring", sourceNodeTypes: ["person"], targetNodeTypes: ["person"] },
      { edgeType: "member-of", sourceNodeTypes: ["person"], targetNodeTypes: ["unit"] },
      { edgeType: "participates-in", sourceNodeTypes: ["person"], targetNodeTypes: ["project"] }
    ],
    requiredNodeAttributes: [{ nodeType: "person", attributes: ["discipline", "careerStage", "qualityStatus", "registryCode"] }],
    requiredEdgeAttributes: [{ edgeType: "social-tie", attributes: ["polarity", "channel", "eventRef"] }],
    nodeAttributeDomains: [
      { nodeType: "person", attribute: "careerStage", allowedValues: ["early", "mid", "senior"] },
      { nodeType: "person", attribute: "qualityStatus", allowedValues: ["verified", "reviewed"] }
    ],
    edgeAttributeDomains: [{ edgeType: "social-tie", attribute: "polarity", allowedValues: [-1, 1] }],
    uniqueNodeAttributes: [{ nodeType: "person", attribute: "registryCode" }],
    uniqueEdgeAttributes: [{ edgeType: "social-tie", attribute: "eventRef" }],
    cardinalities: [{ nodeType: "person", edgeType: "member-of", incidence: "any", min: 1, max: 2 }],
    repairSuggestions: {
      nodeAttributeReplacements: [{
        nodeId: personId(0, 0),
        attribute: "qualityStatus",
        expectedValue: "unverified",
        value: "verified",
        cost: 1
      }],
      edgeTypeReplacements: [{
        edgeId: "synthetic-membership-mismatch",
        expectedType: "member-of",
        newType: "participates-in",
        cost: 1
      }]
    }
  },
  graphAnalysis: graphAnalysis
};

const undirectedConfig = {
  ...baseConfig,
  graphAnalysis: {
    ...graphAnalysis,
    contextualClique: {
      focusNodeTypes: ["person"],
      contextNodeTypes: ["unit"],
      edgeTypes: ["member-of"],
      minimumSize: 3
    },
    signedTriads: {
      attribute: "polarity",
      positiveValues: [1],
      negativeValues: [-1],
      edgeTypes: ["social-tie", "collaboration"]
    }
  }
};

const directedConfig = {
  ...baseConfig,
  graphIntegrity: {
    ...baseConfig.graphIntegrity,
    cardinalities: [{ nodeType: "person", edgeType: "member-of", incidence: "source", min: 1, max: 2 }]
  },
  graphMapping: {
    ...baseConfig.graphMapping,
    edge: { ...baseConfig.graphMapping.edge, direction: "directed" }
  }
};

await mkdir(examplesDirectory, { recursive: true });
await writeFile(path.join(examplesDirectory, "synthetic-graph.json"), `${JSON.stringify({ nodes, edges }, null, 2)}\n`);
await writeFile(path.join(examplesDirectory, "synthetic-graph.config.json"), `${JSON.stringify(undirectedConfig, null, 2)}\n`);
await writeFile(path.join(examplesDirectory, "synthetic-graph-directed.config.json"), `${JSON.stringify(directedConfig, null, 2)}\n`);
process.stdout.write(`Synthetic Graph: ${nodes.length} nodi, ${edges.length} record d'arco, ${edges.filter((edge) => edge.id.includes("membership-mismatch")).length} anomalia di tipo intenzionale.\n`);
