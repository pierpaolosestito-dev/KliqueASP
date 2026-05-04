# 🧠 KliqueASP

> **Interactive Knowledge Graph exploration meets Answer Set Programming.**

KliqueASP is a browser-based framework for exploring heterogeneous Knowledge Graphs through an interactive 3D interface and client-side **Answer Set Programming (ASP)** reasoning.

It lets users load a JSON-labelled graph, filter it visually and semantically, generate ASP facts from the current graph projection, solve a maximum clique task directly in the browser, and inspect the results inside the graph visualization.

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

Temporal metadata can be extracted from node fields and used to filter the graph dynamically.

The framework supports a **graph-aware timeline mode**, where temporal nodes visible in the selected interval can bring connected contextual nodes into the current projection.

This is useful for datasets where entities such as people, institutions, places, events, or organizations are connected across time.

---

### 🧭 Dynamic Semantic Filters

KliqueASP can extract semantic groups from nested JSON metadata and automatically expose them as filters.

For example, if a node contains roles, affiliations, disciplines, or groups, these values can be extracted through configuration and used to restrict the reasoning task.

---

### 🧠 Client-Side ASP Reasoning

The current graph projection is translated into ASP facts and solved directly in the browser through `clingo-wasm` running inside a Web Worker.

No dedicated backend is required.

This makes the reasoning workflow portable, inspectable, and reproducible from the client side.

---

### 🔎 Maximum Clique Detection

The current implementation uses maximum clique detection as a representative combinatorial reasoning task.

The solver panel reports:

- number of exported cliques;
- maximum clique size;
- clique size distribution;
- execution time;
- number of visible nodes and links;
- current temporal interval;
- maximum cliques and additional clique structures.

Detected cliques can be highlighted directly in the 3D graph.

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
      "macroAreaField": "$.data.affiliations[*].group"
    }
  }
}
```

This configuration means that:

- temporal information is extracted from `$.data.active_from` and `$.data.active_to`;
- semantic group values are extracted from `$.data.affiliations[*].group`;
- extracted groups can be used to populate filters and generate ASP facts.

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

When a semantic filter is selected, the framework also generates facts such as:

```prolog
macro(1,psychology).
macro(3,psychology).
```

The default maximum clique encoding is:

```prolog
{ in(V) : node(V) }.

:- in(U), in(V), U < V, not edge(U,V).

#maximize { 1,V : in(V) }.

#show in/1.
```

When a semantic group is selected, the search space is restricted:

```prolog
valid(V) :- node(V), macro(V, psychology).

{ in(V) : valid(V) }.

:- in(U), in(V), U < V, not edge(U,V).

#maximize { 1,V : in(V) }.

#show in/1.
```

The answer sets are mapped back to graph node identifiers and highlighted in the 3D visualization.

---

## 🖥️ Interface Highlights

The interface includes:

- 🔍 node search with autocomplete;
- 🧭 neighborhood navigation;
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

---

## 🧠 Why ASP?

ASP is useful when graph analysis requires more than simple structural filtering.

With ASP, constraints can be expressed declaratively and inspected directly.

In KliqueASP, the graph and its metadata are translated into logical facts, while the reasoning task is encoded as a compact logic program.

This makes the framework suitable for exploratory scenarios where users need to test structural, semantic, and temporal hypotheses over heterogeneous graphs.

---

## 🎯 Current Focus

The current version focuses on maximum clique detection.

This task was chosen because it provides a clear combinatorial benchmark for testing the full pipeline:

```text
Graph projection → ASP fact generation → Client-side solving → Visual feedback
```

KliqueASP is not intended to introduce a new clique-detection algorithm.  
Its contribution is the integration of declarative reasoning inside an interactive visual exploration workflow.

---

## 🗺️ Roadmap

Planned extensions include:

- 🧩 support for custom ASP encodings;
- 📤 export of generated ASP programs;
- 🧪 improved debugging tools for node-index mappings;
- 📚 support for multiple graph datasets;
- 🧠 additional graph reasoning tasks;
- 🧑‍🍳 integration as a reusable graph-oriented component in ASP-Chef;
- 📊 richer visual analytics components;
- 📝 improved documentation for custom datasets and configurations.

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

## 🌐 Live Demo

The GitHub Pages deployment exposes three entry points:

- **Home / Easter Egg**  
  https://pierpaolosestito-dev.github.io/KliqueASP/

  Shows the KliqueASP landing graph. If no dataset is loaded, the framework displays the built-in KliqueASP easter egg graph.

- **KliqueASP Sandbox**  
  https://pierpaolosestito-dev.github.io/KliqueASP/KliqueASP/

  Provides an interactive sandbox where users can edit both the graph configuration JSON and the dataset JSON directly from the browser, then reload the visualization.

- **Psychology History Graph**  
  https://pierpaolosestito-dev.github.io/KliqueASP/KliqueASP/PsychologyHistoryGraph/

  Loads the static case-study dataset and configuration for the Italian Psychology History Knowledge Graph.