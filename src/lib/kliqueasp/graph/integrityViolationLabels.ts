const INTEGRITY_VIOLATION_LABELS: Record<string, string> = {
  edge_endpoint_type: "Tipo degli estremi incompatibile",
  missing_endpoint_node_type: "Tipo nodo mancante su un estremo",
  missing_node_type: "Tipo nodo richiesto ma assente",
  missing_edge_type: "Tipo arco richiesto ma assente",
  node_type_out_of_domain: "Tipo nodo fuori dal vocabolario dichiarato",
  edge_type_out_of_domain: "Tipo arco fuori dal vocabolario dichiarato",
  missing_node_attribute: "Attributo nodo obbligatorio assente",
  missing_edge_attribute: "Attributo arco obbligatorio assente",
  node_attribute_out_of_domain: "Attributo nodo fuori dal dominio dichiarato",
  edge_attribute_out_of_domain: "Attributo arco fuori dal dominio dichiarato",
  missing_edge_interval: "Estremo dell'intervallo temporale assente",
  invalid_edge_interval_value: "Valore temporale non interpretabile",
  invalid_edge_interval: "Intervallo temporale invertito",
  duplicate_node_attribute: "Valore univoco duplicato",
  duplicate_edge_attribute: "Valore arco univoco duplicato",
  cardinality_min: "Cardinalità minima non rispettata",
  cardinality_max: "Cardinalità massima superata"
};

export function getIntegrityViolationLabel(kind: string): string {
  return INTEGRITY_VIOLATION_LABELS[kind] ?? `Violazione non riconosciuta (${kind.replaceAll("_", " ")})`;
}
