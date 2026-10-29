import { test } from "node:test";
import assert from "node:assert/strict";
import { ambiente, gravarEstado, estado } from "./helpers.mjs";

const SEMANA = "2026-10-26";
const reboot = (a) => gravarEstado(a.estado, SEMANA, { reboot: "pedido", religar: ["app_a", "app_b"], relatorio: { linhas: ["Docker: 1.5GB liberado"] } });
const conta = (texto, padrao) => (texto.match(padrao) ?? []).length;

// SPECSFY: US-003 US-004 FR-007 FR-009 AC-014
test("AC-014: depois do boot religa os containers, confere serviços e manda o relatório", () => {
  const a = ambiente({ agora: "2026-10-26T04:06:00-03:00" });
  reboot(a);
  const r = a.rodar("pos-boot");
  assert.equal(r.status, 0, r.stderr);
  const docker = a.ler("docker");
  assert.match(docker, /start app_a/);
  assert.match(docker, /start app_b/);
  const sys = a.ler("systemctl");
  for (const u of ["docker.service", "tailscaled.service", "ollama.service", "hermes-gateway.service", "meu-bot.service", "rapport-rascunho.timer", "faxina-limpar.timer"]) assert.match(sys, new RegExp(u.replace(".", "\\.")));
  assert.match(a.ler("telegram"), /Faxina 26\/10/);
  const e = estado(a.estado, SEMANA);
  assert.equal(e.reboot, "feito");
  assert.equal(e.relatorio_enviado, true);
});

// SPECSFY: US-003 FR-008 NFR-003 AC-015
test("AC-015: Hermes fora após 2 tentativas → aviso direto pela API do Telegram", () => {
  const a = ambiente({ env: { FAKE_INATIVOS: "hermes-gateway.service", FAKE_HERMES_SEND: "falha" } });
  reboot(a);
  a.rodar("pos-boot");
  assert.equal(conta(a.ler("systemctl"), /restart hermes-gateway\.service/g), 2);
  const curl = a.ler("curl");
  assert.match(curl, /api\.telegram\.org\/bot123:fake\/sendMessage/);
  assert.match(curl, /chat_id=999/);
  assert.match(curl, /hermes-gateway/);
});

// SPECSFY: US-003 FR-007 FR-008 AC-016
test("AC-016: container que não sobe é tentado 3 vezes e citado com o log", () => {
  const a = ambiente({ env: { FAKE_START_FALHA: "app_b" } });
  reboot(a);
  a.rodar("pos-boot");
  const docker = a.ler("docker");
  assert.equal(conta(docker, /start app_a/g), 1);
  assert.equal(conta(docker, /start app_b/g), 3);
  assert.match(a.ler("telegram"), /app_b.*erro ao iniciar/s);
});

// SPECSFY: FR-008 NFR-003 AC-017
test("AC-017: Docker inteiro fora → aviso e nenhum segundo reboot", () => {
  const a = ambiente({ env: { FAKE_INATIVOS: "docker.service" } });
  reboot(a);
  a.rodar("pos-boot");
  assert.match(a.ler("telegram"), /docker\.service.*fora/is);
  assert.doesNotMatch(a.ler("sudo"), /reboot/);
  assert.doesNotMatch(a.ler("docker"), /start app_a/);
});

// SPECSFY: FR-007 FR-011 NFR-003 AC-027
test("AC-027: o pós-boot espera o Docker subir antes de religar", () => {
  const a = ambiente({ env: { FAKE_DOCKER_DEMORA: "3" } });
  reboot(a);
  a.rodar("pos-boot");
  assert.match(a.ler("docker"), /start app_a/);
  assert.doesNotMatch(a.ler("telegram"), /docker\.service.*fora/is);
});

// SPECSFY: US-004 FR-009 FR-010 AC-021
test("AC-021: pós-boot repetido na mesma semana não reenvia nem religa", () => {
  const a = ambiente();
  reboot(a);
  a.rodar("pos-boot");
  const antes = a.ler("telegram");
  const r = a.rodar("pos-boot");
  assert.equal(r.status, 2);
  assert.equal(a.ler("telegram"), antes);
  assert.equal(conta(a.ler("docker"), /start app_a/g), 1);
});
