import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { protegido, remover } from "../src/protecao.mjs";
import { ambiente, arquivo } from "./helpers.mjs";

// SPECSFY: US-002 FR-005 NFR-002 AC-010
test("AC-010: a lista de proteção vence qualquer pedido de remoção", () => {
  const { home } = ambiente();
  for (const p of [".ssh/id_ed25519", "Documentos/work/app/src/a.js", ".claude/projects/p/memory/MEMORY.md", ".claude/settings.json",
    ".cache/ms-playwright/chromium/x", ".cache/Cypress/x", ".hermes/.env", ".hermes/config.yaml", ".config/x"]) {
    assert.equal(protegido(join(home, p), { home }), true, p);
  }
  for (const p of [".cache/uv/x", ".npm/_cacache/x", ".hermes/cache/uv/x", ".claude/projects/p/abc.jsonl"]) {
    assert.equal(protegido(join(home, p), { home }), false, p);
  }
  assert.equal(protegido(join(home, "Documentos/work/app/node_modules"), { home, aprovados: [join(home, "Documentos/work/app/node_modules")] }), false);
  const memoria = arquivo(join(home, ".claude/projects/p/memory/MEMORY.md"));
  assert.equal(remover(memoria, { home }), "protegido");
  assert.ok(existsSync(memoria));
  const viaLink = join(home, ".claude/projects/p/../p/memory/MEMORY.md");
  assert.equal(remover(viaLink, { home }), "protegido");
});
