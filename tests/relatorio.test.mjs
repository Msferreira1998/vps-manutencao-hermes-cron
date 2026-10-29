import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ambiente, arquivo } from "./helpers.mjs";

// SPECSFY: US-004 FR-009 NFR-003 AC-018
test("AC-018: relatório traz categorias, disco e memória antes/depois e o resultado do reboot", () => {
  const a = ambiente({ env: { FAXINA_ATIVIDADE: "1,1,1,1,1,1,1,1,1" } });
  arquivo(join(a.home, ".cache/uv/a"), { conteudo: "z".repeat(4000) });
  arquivo(join(a.home, ".claude/projects/p/velha.jsonl"), { dias: 9, agora: a.agora });
  a.rodar("limpar");
  const tg = a.ler("telegram");
  for (const trecho of [/Docker/, /Caches/, /Sessões do Claude/, /Disco: .*→/, /Memória: .*→/, /reboot pulado/]) assert.match(tg, trecho);
});
