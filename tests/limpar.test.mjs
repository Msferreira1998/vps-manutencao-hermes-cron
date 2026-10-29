import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { ambiente, arquivo, gravarEstado } from "./helpers.mjs";

const SEMANA = "2026-10-26";
const nm = (home, n) => arquivo(join(home, `Documentos/work/p${n}/node_modules/x.js`));
const lista = (home) => [1, 2, 3].map((n) => ({ numero: n, tipo: "node_modules", alvo: join(home, `Documentos/work/p${n}/node_modules`), tamanho: 10 }));

// SPECSFY: US-001 US-002 FR-002 FR-004 AC-004
test("AC-004: só os itens aprovados são apagados", () => {
  const a = ambiente();
  [1, 2, 3].forEach((n) => nm(a.home, n));
  gravarEstado(a.estado, SEMANA, { lista: [...lista(a.home), { numero: 4, tipo: "volume", alvo: "orfao_db", tamanho: 1 }], escolha: { tipo: "alguns", numeros: [1, 3, 4] } });
  const r = a.rodar("limpar", "--sem-reboot");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(join(a.home, "Documentos/work/p1/node_modules")), false);
  assert.equal(existsSync(join(a.home, "Documentos/work/p2/node_modules")), true);
  assert.equal(existsSync(join(a.home, "Documentos/work/p3/node_modules")), false);
  assert.match(a.ler("docker"), /volume rm orfao_db/);
});

// SPECSFY: US-002 FR-002 FR-004 NFR-002 AC-005
test("AC-005: sem escolha, nada da lista sai e o nível seguro roda", () => {
  const a = ambiente();
  [1, 2, 3].forEach((n) => nm(a.home, n));
  gravarEstado(a.estado, SEMANA, { lista: lista(a.home) });
  a.rodar("limpar", "--sem-reboot");
  [1, 2, 3].forEach((n) => assert.ok(existsSync(join(a.home, `Documentos/work/p${n}/node_modules`))));
  assert.match(a.ler("docker"), /builder prune/);
});

// SPECSFY: US-002 FR-003 FR-009 AC-007
test("AC-007: o nível seguro roda e o relatório traz o espaço por categoria", () => {
  const a = ambiente();
  const caches = [".npm/_cacache/a", ".cache/uv/a", ".cache/pip/a", ".cache/composer/a", ".cache/pnpm/a", ".local/share/pnpm/store/a", ".gradle/caches/a", ".hermes/cache/uv/a"]
    .map((p) => arquivo(join(a.home, p), { conteudo: "z".repeat(2000) }));
  const r = a.rodar("limpar", "--sem-reboot");
  assert.equal(r.status, 0, r.stderr);
  caches.forEach((c) => assert.equal(existsSync(c), false, c));
  const docker = a.ler("docker");
  assert.match(docker, /builder prune -af/);
  assert.match(docker, /container prune -f --filter until=168h/);
  assert.match(docker, /image prune -af --filter until=168h/);
  assert.match(a.ler("sudo"), /apt-get clean/);
  assert.match(a.ler("sudo"), /journalctl --vacuum-time=14d/);
  assert.match(a.ler("telegram"), /Caches.*liberado/is);
});

// SPECSFY: FR-003 FR-005 NFR-002 AC-008
test("AC-008: sem reboot, /tmp perde só o que tem mais de 7 dias; navegadores ficam", () => {
  const a = ambiente();
  const velho = arquivo(join(a.tmp, "velho.log"), { dias: 10, agora: a.agora });
  const novo = arquivo(join(a.tmp, "novo.log"), { dias: 2, agora: a.agora });
  const pw = arquivo(join(a.home, ".cache/ms-playwright/chromium/chrome"));
  const cy = arquivo(join(a.home, ".cache/Cypress/15/Cypress"));
  a.rodar("limpar", "--sem-reboot");
  assert.equal(existsSync(velho), false);
  assert.ok(existsSync(novo));
  assert.ok(existsSync(pw));
  assert.ok(existsSync(cy));
});

// SPECSFY: US-002 FR-004 FR-005 AC-009
test("AC-009: sessão de 8 dias sai com a pasta irmã; 6 dias e memory/ ficam", () => {
  const a = ambiente();
  const p = join(a.home, ".claude/projects/-home-x");
  const s8 = arquivo(join(p, "s8.jsonl"), { dias: 8, agora: a.agora });
  const s8dir = arquivo(join(p, "s8/subagents/a.jsonl"), { dias: 8, agora: a.agora });
  const s6 = arquivo(join(p, "s6.jsonl"), { dias: 6, agora: a.agora });
  const mem = arquivo(join(p, "memory/MEMORY.md"), { dias: 30, agora: a.agora });
  a.rodar("limpar", "--sem-reboot");
  assert.equal(existsSync(s8), false);
  assert.equal(existsSync(join(p, "s8")), false, s8dir);
  assert.ok(existsSync(s6));
  assert.ok(existsSync(mem));
});

// SPECSFY: FR-003 FR-009 NFR-003 AC-023
test("AC-023: falha de um comando não para o resto e aparece no relatório", () => {
  const a = ambiente({ env: { FAKE_SUDO_FALHA: "apt-get" } });
  const r = a.rodar("limpar", "--sem-reboot");
  assert.equal(r.status, 0, r.stderr);
  assert.match(a.ler("sudo"), /journalctl --vacuum-time=14d/);
  assert.match(a.ler("docker"), /builder prune/);
  assert.match(a.ler("telegram"), /falha.*apt/is);
});

// SPECSFY: US-002 FR-011 NFR-002 AC-025
test("AC-025: --dry-run lista tudo e não apaga nem reinicia", () => {
  const a = ambiente({ env: { FAXINA_ATIVIDADE: "0" } });
  const c = arquivo(join(a.home, ".cache/uv/a"));
  const s = arquivo(join(a.home, ".claude/projects/p/velha.jsonl"), { dias: 9, agora: a.agora });
  nm(a.home, 1);
  gravarEstado(a.estado, SEMANA, { lista: lista(a.home), escolha: { tipo: "alguns", numeros: [1] } });
  const r = a.rodar("limpar", "--dry-run");
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /seria removido.*\.cache\/uv/);
  assert.match(r.stdout, /velha\.jsonl/);
  assert.match(r.stdout, /p1\/node_modules/);
  assert.match(r.stdout, /reboot: seria feito/);
  [c, s].forEach((f) => assert.ok(existsSync(f)));
  assert.ok(existsSync(join(a.home, "Documentos/work/p1/node_modules")));
  assert.doesNotMatch(a.ler("docker"), /prune|volume rm/);
  assert.equal(a.ler("sudo"), "");
});

// SPECSFY: FR-011 FR-005 AC-026
test("AC-026: --dry-run mostra item protegido como não removível", () => {
  const a = ambiente();
  const mem = arquivo(join(a.home, ".claude/projects/p/memory/MEMORY.md"));
  gravarEstado(a.estado, SEMANA, { lista: [{ numero: 1, tipo: "node_modules", alvo: join(a.home, ".claude/projects/p/memory"), tamanho: 1 }], escolha: { tipo: "tudo", numeros: [1] } });
  const r = a.rodar("limpar", "--dry-run");
  assert.match(r.stdout, /protegido.*memory/);
  assert.ok(existsSync(mem));
});
