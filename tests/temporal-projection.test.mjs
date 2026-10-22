import assert from "node:assert/strict";
import test from "node:test";
import {
  filterLinksByTemporalWindow,
  isTimelineControlAvailable
} from "../src/lib/kliqueasp/graph/temporalProjection.ts";

const getValidity = (link) => link.validity ?? null;

test("la finestra temporale mantiene gli archi con intervalli chiusi sovrapposti", () => {
  const links = [
    { id: "before", validity: { start: 1990, end: 1999 } },
    { id: "touches-start", validity: { start: 1995, end: 2000 } },
    { id: "inside", validity: { start: 2002, end: 2008 } },
    { id: "touches-end", validity: { start: 2010, end: 2015 } },
    { id: "after", validity: { start: 2016, end: 2020 } }
  ];

  const projected = filterLinksByTemporalWindow(links, getValidity, 2000, 2010);

  assert.deepEqual(projected.map(({ id }) => id), ["touches-start", "inside", "touches-end"]);
});

test("i record senza intervallo e le finestre non valide non eliminano archi", () => {
  const links = [
    { id: "timeless" },
    { id: "dated", validity: { start: 2000, end: 2001 } },
    { id: "malformed", validity: { start: 2010, end: 2000 } }
  ];

  assert.deepEqual(
    filterLinksByTemporalWindow(links, getValidity, 2005, 2004),
    links,
    "una finestra invertita non deve svuotare la proiezione"
  );
  assert.deepEqual(
    filterLinksByTemporalWindow(links, getValidity, 2005, 2006).map(({ id }) => id),
    ["timeless", "malformed"],
    "i record privi di intervallo valido restano presenti quando il helper viene usato senza capability completa"
  );
});

test("la timeline appare solo con una mappatura temporale dichiarata e disponibile", () => {
  assert.equal(isTimelineControlAvailable(true, true, false), true,
    "la timeline legacy sui nodi resta disponibile");
  assert.equal(isTimelineControlAvailable(true, false, true), true,
    "gli intervalli completi sugli archi abilitano la finestra v2");
  assert.equal(isTimelineControlAvailable(true, false, false), false,
    "un flag timeline senza mapping non deve mostrare il range predefinito estraneo");
  assert.equal(isTimelineControlAvailable(false, true, true), false,
    "la configurazione conserva l'opt-in esplicito della timeline");
});

