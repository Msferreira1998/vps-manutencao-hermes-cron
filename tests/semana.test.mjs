import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { semanaDe, limparHistorico } from "../src/semana.mjs";
import { ambiente, gravarEstado } from "./helpers.mjs";

// SPECSFY: NFR-001 FR-001 FR-006 AC-022
test("AC-022: semana e timers em Brasília com o servidor em Berlim", () => {
  assert.equal(process.env.TZ, "Europe/Berlin");
  assert.equal(semanaDe(new Date("2026-10-25T21:00:00-03:00")), "2026-10-26");
  assert.equal(semanaDe(new Date("2026-10-26T04:00:00-03:00")), "2026-10-26");
  assert.equal(semanaDe(new Date("2026-10-26T01:30:00+01:00")), "2026-10-26"); // domingo 21:30 BRT visto de Berlim
  const timer = (n) => readFileSync(new URL(`../systemd/${n}`, import.meta.url), "utf8");
  assert.match(timer("faxina-lista.timer"), /OnCalendar=Sun \*-\*-\* 21:00:00 America\/Sao_Paulo/);
  assert.match(timer("faxina-limpar.timer"), /OnCalendar=Mon \*-\*-\* 04:00:00 America\/Sao_Paulo/);
});

// SPECSFY: US-004 FR-010 AC-019
test("AC-019: histórico de 5 semanas sai, de 3 semanas fica", () => {
  const a = ambiente();
  gravarEstado(a.estado, "2026-09-21", { reboot: "feito" });
  gravarEstado(a.estado, "2026-10-05", { reboot: "feito" });
  limparHistorico(a.estado, "2026-10-26");
  assert.equal(existsSync(join(a.estado, "2026-09-21")), false);
  assert.equal(existsSync(join(a.estado, "2026-10-05")), true);
});
