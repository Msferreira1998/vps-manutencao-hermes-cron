// "Trabalho ativo": CPU de processos vigiados ou sessão do Claude Code escrita nos últimos 10 min.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { horaBRT } from "./semana.mjs";

const JANELA = 10 * 60_000;
// claude fica fora: a interface parada gasta CPU o tempo todo; a atividade real dele aparece no .jsonl.
const VIGIADOS = /^(node|npm|pnpm|docker|buildkitd|git)$/;
// Processos de container aparecem no /proc do host com o mesmo comm ("node"), mas não são trabalho do usuário.
export const emContainer = (cgroup) => /docker-[0-9a-f]+\.scope|containerd|libpod-/.test(cgroup);
export const vigiado = (comm, cmd) => comm !== "claude" && (VIGIADOS.test(comm) || cmd.includes("rapport.mjs"));

export function estaAtivo({ home, agora, cpuSegundos }) {
  if (cpuSegundos > 5) return true;
  const base = join(home, ".claude", "projects");
  if (!existsSync(base)) return false;
  return readdirSync(base).some((p) => {
    const dir = join(base, p);
    return statSync(dir).isDirectory() && readdirSync(dir).some((f) => f.endsWith(".jsonl") && agora.getTime() - statSync(join(dir, f)).mtimeMs < JANELA);
  });
}

/** CPU (s) usada pelos processos vigiados fora da árvore deste processo durante `janelaMs`. */
export function cpuVigiados(janelaMs, dormir) {
  const proprios = new Set([String(process.pid), String(process.ppid)]);
  const ler = () => {
    const t = new Map();
    for (const pid of readdirSync("/proc").filter((d) => /^\d+$/.test(d) && !proprios.has(d))) {
      try {
        const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
        const comm = stat.slice(stat.indexOf("(") + 1, stat.lastIndexOf(")"));
        const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8");
        if (!vigiado(comm, cmd) || emContainer(readFileSync(`/proc/${pid}/cgroup`, "utf8"))) continue;
        const campos = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
        t.set(pid, { cpu: Number(campos[11]) + Number(campos[12]), nome: cmd.replace(/\0/g, " ").slice(0, 80) });
      } catch { /* processo saiu */ }
    }
    return t;
  };
  const antes = ler();
  dormir(janelaMs);
  let ticks = 0;
  cpuVigiados.culpados = [];
  for (const [pid, v] of ler()) {
    const d = v.cpu - (antes.get(pid)?.cpu ?? v.cpu);
    ticks += d;
    if (d > 0) cpuVigiados.culpados.push(`${v.nome} (${(d / 100).toFixed(1)}s)`);
  }
  return ticks / 100; // CLK_TCK = 100 no Linux
}

export function aguardarReboot({ ativo, agora, esperar, intervaloMs = 30 * 60_000, limite = "07:00" }) {
  for (;;) {
    if (!ativo()) return { acao: "reboot", hora: horaBRT(agora()) };
    if (horaBRT(new Date(agora().getTime() + intervaloMs)) > limite) return { acao: "pulado", hora: horaBRT(agora()) };
    esperar(intervaloMs);
  }
}
