import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ambiente, arquivo, volumeDf, estado, gravarEstado } from "./helpers.mjs";

const DOMINGO = "2026-10-25T21:00:00-03:00";
const volumes = (...v) => ({ FAKE_DF_VOLUMES: JSON.stringify(v) });

function projeto(home, nome, dias, agora) {
  arquivo(join(home, "Documentos/work", nome, "package.json"), { dias, agora });
  return arquivo(join(home, "Documentos/work", nome, "node_modules/lib/index.js"), { dias, agora, conteudo: "y".repeat(5000) });
}

// SPECSFY: US-001 FR-001 NFR-001 NFR-002 AC-001
test("AC-001: domingo 21:00 chega a lista numerada e nada é apagado", () => {
  const a = ambiente({ agora: DOMINGO, env: volumes(volumeDf("teste_db", { size: "2.1GB", projeto: "teste" })) });
  const nm = projeto(a.home, "velho", 40, a.agora);
  const r = a.rodar("lista");
  assert.equal(r.status, 0, r.stderr);
  const tg = a.ler("telegram");
  assert.match(tg, /1\. .*teste_db.*2\.1GB/);
  assert.match(tg, /2\. .*velho\/node_modules/);
  assert.match(tg, /limpar 1,2/);
  assert.match(tg, /\/tmp/);
  assert.equal(estado(a.estado, "2026-10-26").lista.length, 2);
  assert.ok(existsSync(nm));
  assert.doesNotMatch(a.ler("docker"), /volume rm|prune/);
});

// SPECSFY: US-001 FR-001 AC-002
test("AC-002: node_modules de projeto mexido há 10 dias fica fora da lista", () => {
  const a = ambiente({ agora: DOMINGO });
  projeto(a.home, "ativo", 40, a.agora);
  arquivo(join(a.home, "Documentos/work/ativo/src/app.js"), { dias: 10, agora: a.agora });
  projeto(a.home, "velho", 40, a.agora);
  a.rodar("lista");
  const tg = a.ler("telegram");
  assert.doesNotMatch(tg, /ativo\/node_modules/);
  assert.match(tg, /velho\/node_modules/);
});

// SPECSFY: US-001 FR-001 NFR-002 AC-003
test("AC-003: volume ligado a container nunca entra; órfão mostra 'nenhum container' e a data", () => {
  const a = ambiente({ agora: DOMINGO, env: volumes(volumeDf("caddy_data", { links: 1 }), volumeDf("orfao_db")) });
  a.rodar("lista");
  const tg = a.ler("telegram");
  assert.doesNotMatch(tg, /caddy_data/);
  assert.match(tg, /orfao_db.*nenhum container.*01\/09/s);
});

// SPECSFY: FR-001 FR-010 AC-020
test("AC-020: item não aprovado na semana passada volta marcado", () => {
  const a = ambiente({ agora: DOMINGO, env: volumes(volumeDf("orfao_db")) });
  gravarEstado(a.estado, "2026-10-19", { lista: [{ numero: 1, tipo: "volume", alvo: "orfao_db", tamanho: 1 }], escolha: { tipo: "nada", numeros: [] } });
  a.rodar("lista");
  assert.match(a.ler("telegram"), /orfao_db.*também na semana passada/);
});

// SPECSFY: US-001 FR-001 NFR-003 AC-029
test("AC-029: pasta sem permissão de leitura não derruba a lista", async () => {
  const { chmodSync } = await import("node:fs");
  const a = ambiente({ agora: DOMINGO });
  projeto(a.home, "velho", 40, a.agora);
  const fechada = join(a.home, "Documentos/work/app/storage/private");
  arquivo(join(fechada, "segredo.txt"), { dias: 40, agora: a.agora });
  arquivo(join(a.home, "Documentos/work/app/node_modules/x.js"), { dias: 40, agora: a.agora });
  chmodSync(fechada, 0o000);
  try {
    const r = a.rodar("lista");
    assert.equal(r.status, 0, r.stderr);
    assert.match(a.ler("telegram"), /velho\/node_modules/);
  } finally { chmodSync(fechada, 0o700); }
});

// SPECSFY: US-001 FR-001 NFR-003 AC-029
test("AC-029 (queda): qualquer erro inesperado avisa no Telegram", () => {
  const a = ambiente({ agora: DOMINGO, env: { FAKE_DF_VOLUMES: "isto não é json" } });
  const r = a.rodar("lista");
  assert.equal(r.status, 1);
  assert.match(a.ler("telegram"), /❌ Faxina \(lista\) falhou/);
});
