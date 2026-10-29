// Sessões do Claude Code (<id>.jsonl + pasta <id>/ irmã) sem interação há mais de 7 dias. memory/ nunca entra.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export function sessoesAntigas(home, agora, dias = 7) {
  const base = join(home, ".claude", "projects");
  if (!existsSync(base)) return [];
  const limite = agora.getTime() - dias * 86_400_000;
  const alvos = [];
  for (const projeto of readdirSync(base)) {
    const dir = join(base, projeto);
    if (!statSync(dir).isDirectory()) continue;
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".jsonl"))) {
      if (statSync(join(dir, f)).mtimeMs >= limite) continue;
      alvos.push(join(dir, f));
      const irma = join(dir, f.slice(0, -6));
      if (f.slice(0, -6) !== "memory" && existsSync(irma)) alvos.push(irma);
    }
  }
  return alvos;
}
