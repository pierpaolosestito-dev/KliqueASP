import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getUserFacingConfigurationError } from "../src/lib/kliqueasp/graph/configurationErrorCopy.ts";

test("configuration errors replace internal JSON paths with the supplied action", () => {
  const fallback = "Apri Dati e configurazione e verifica gli archi candidati.";

  assert.equal(
    getUserFacingConfigurationError(
      new TypeError("edgeAdditions[2].sourceNodeId deve indicare un ID nodo."),
      fallback
    ),
    fallback
  );
  assert.equal(
    getUserFacingConfigurationError(
      new TypeError("Le sostituzioni richiedono graphMapping.edge.typeField."),
      fallback
    ),
    fallback
  );
  assert.equal(
    getUserFacingConfigurationError(new Error("Il calcolo è stato interrotto."), fallback),
    "Il calcolo è stato interrotto."
  );
});

test("primary configuration messages use graph terms and direct users to the correction area", async () => {
  const app = await readFile(new URL("../src/lib/kliqueasp/GraphApp.svelte", import.meta.url), "utf8");
  const integrityReadiness = app.slice(
    app.indexOf("$: integrityRepairDataReadiness = (() => {"),
    app.indexOf("\n  let query =")
  );

  assert.match(integrityReadiness, /associa un campo al tipo nella mappatura dei dati/);
  assert.doesNotMatch(integrityReadiness, /reasons\.push\([^\n]*(?:graphMapping|graphIntegrity|graphAnalysis)\./);
  assert.match(app, /Aggiungi archi candidati con origine, destinazione e costo in Dati e configurazione/);
  assert.match(app, /getUserFacingConfigurationError\(\s*error,\s*"La configurazione degli archi candidati non è valida/);
  assert.doesNotMatch(app, /(?:structural\w+Error|integrityRepairError)\s*=\s*"[^"]*(?:graphMapping|graphIntegrity|graphAnalysis)\./);
  assert.doesNotMatch(app, /(?:structural\w+Error|integrityRepairError)\s*=\s*"[^"]*edgeAdditions/);
});
