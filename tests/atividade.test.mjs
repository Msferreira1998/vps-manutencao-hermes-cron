import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { estaAtivo, aguardarReboot } from "../src/atividade.mjs";
import { ambiente, arquivo, estado, gravarEstado } from "./helpers.mjs";

const MIN = 60_000;

// SPECSFY: US-003 FR-006 NFR-002 AC-024
test("AC-024: Claude esperando a API (sem CPU) conta como ativo pelo .jsonl", () => {
  const { home } = ambiente();
  const agora = new Date("2026-10-26T04:00:00-03:00");
  const sessao = join(home, ".claude/projects/p/s.jsonl");
  arquivo(sessao, { dias: 3 / 1440, agora });
  assert.equal(estaAtivo({ home, agora, cpuSegundos: 0 }), true);
  arquivo(sessao, { dias: 20 / 1440, agora });
  assert.equal(estaAtivo({ home, agora, cpuSegundos: 0 }), false);
  assert.equal(estaAtivo({ home, agora, cpuSegundos: 6 }), true);
});

// SPECSFY: US-003 FR-006 AC-013
test("AC-013: atividade às 04:00 e nenhuma às 04:30 → reboot às 04:30", () => {
  let t = new Date("2026-10-26T04:00:00-03:00").getTime();
  const respostas = [true, false];
  const r = aguardarReboot({ ativo: () => respostas.shift(), agora: () => new Date(t), esperar: (ms) => { t += ms; } });
  assert.deepEqual(r, { acao: "reboot", hora: "04:30" });
});

// SPECSFY: US-003 FR-006 FR-007 NFR-001 AC-011
test("AC-011: sem atividade às 04:00 BRT registra os containers sem restart e pede o reboot", () => {
  const a = ambiente({ env: { FAXINA_ATIVIDADE: "0", FAKE_RUNNING: "app_a app_b app_c", FAKE_RESTART_NO: "app_a app_b" } });
  gravarEstado(a.estado, "2026-10-26", { reboot: "feito", relatorio_enviado: true }); // execução anterior na mesma semana
  const r = a.rodar("limpar");
  assert.equal(r.status, 0, r.stderr);
  assert.match(a.ler("sudo"), /systemctl reboot/);
  const e = estado(a.estado, "2026-10-26");
  assert.deepEqual(e.religar, ["app_a", "app_b"]);
  assert.equal(e.reboot, "pedido");
  assert.equal(e.relatorio_enviado, false, "novo reboot precisa de novo relatório pós-boot");
});

// SPECSFY: US-003 FR-006 NFR-003 AC-012
test("AC-012: atividade até 07:00 → reboot pulado e avisado", () => {
  const a = ambiente({ env: { FAXINA_ATIVIDADE: "1,1,1,1,1,1,1,1,1" } });
  const r = a.rodar("limpar");
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(a.ler("sudo"), /reboot/);
  assert.match(a.ler("telegram"), /reboot pulado: trabalho ativo/);
  assert.equal(estado(a.estado, "2026-10-26").reboot, "pulado");
  void MIN;
});

// SPECSFY: US-003 FR-006 NFR-002 AC-028
test("AC-028: sessões do Claude abertas e paradas (CPU da interface, sem .jsonl novo) não seguram o reboot", async () => {
  const { vigiado } = await import("../src/atividade.mjs");
  assert.equal(vigiado("claude", "claude --dangerously-skip-permissions --resume abc"), false);
  assert.equal(vigiado("node", "node /x/vite build"), true);
  assert.equal(vigiado("git", "git clone x"), true);
  assert.equal(vigiado("node", "node /home/m/Documentos/rapport-diario/bin/rapport.mjs rascunho"), true);
});

// SPECSFY: US-003 FR-006 NFR-003 AC-028
test("AC-028 (containers): processo dentro de container Docker não conta como trabalho do usuário", async () => {
  const { emContainer } = await import("../src/atividade.mjs");
  assert.equal(emContainer("0::/system.slice/docker-3f9a1c.scope\n"), true);
  assert.equal(emContainer("0::/system.slice/containerd.service\n"), true);
  assert.equal(emContainer("0::/user.slice/user-1000.slice/session-12.scope\n"), false);
});
