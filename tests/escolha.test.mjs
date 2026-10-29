import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretar } from "../src/escolha.mjs";
import { ambiente, gravarEstado, estado } from "./helpers.mjs";

const LISTA = [1, 2, 3].map((n) => ({ numero: n, tipo: "node_modules", alvo: `/x/${n}/node_modules`, tamanho: 100 }));

// SPECSFY: US-001 FR-002 AC-006
test("AC-006: número fora da lista é recusado e a escolha anterior fica", () => {
  assert.deepEqual(interpretar("limpar 1,3", 3), { tipo: "alguns", numeros: [1, 3] });
  assert.deepEqual(interpretar("Limpar tudo", 3), { tipo: "tudo", numeros: [1, 2, 3] });
  assert.deepEqual(interpretar("nada", 3), { tipo: "nada", numeros: [] });
  assert.match(interpretar("limpar 9", 3).erro, /9/);
  const a = ambiente({ agora: "2026-10-25T22:00:00-03:00" });
  gravarEstado(a.estado, "2026-10-26", { lista: LISTA, escolha: { tipo: "alguns", numeros: [2] } });
  const r = a.rodar("escolher", "limpar 9");
  assert.equal(r.status, 1);
  assert.match(a.ler("telegram"), /9 não existe/);
  assert.deepEqual(estado(a.estado, "2026-10-26").escolha, { tipo: "alguns", numeros: [2] });
});
