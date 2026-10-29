// Nível seguro (FR-003): Docker, caches regeneráveis, apt/journal e /tmp (só sem reboot).
import { existsSync, readdirSync, lstatSync } from "node:fs";
import { join } from "node:path";
import { rodar, sudo } from "./sistema.mjs";
import { remover } from "./protecao.mjs";

const CACHES = [".npm/_cacache", ".local/share/pnpm/store", ".cache/pnpm", ".cache/uv", ".cache/pip", ".cache/composer", ".gradle/caches", ".hermes/cache/uv"];
const DOCKER = [["builder", "prune", "-af"], ["container", "prune", "-f", "--filter", "until=168h"], ["image", "prune", "-af", "--filter", "until=168h"]];

export const tamanho = (p, env) => (existsSync(p) ? Number(rodar("du", ["-sb", p], env).saida.split("\t")[0]) || 0 : 0);

export function limparSeguro({ home, env = process.env, dryRun = false, log = () => {} }) {
  const r = { docker: [], caches: 0, falhas: [], previstos: [] };
  for (const args of DOCKER) {
    if (dryRun) { r.previstos.push(`seria executado: docker ${args.join(" ")}`); continue; }
    const s = rodar("docker", args, env);
    if (!s.ok) r.falhas.push(`docker ${args[0]} prune: ${s.erro.slice(0, 120)}`);
    else r.docker.push(`${args[0]}: ${s.saida.match(/Total reclaimed space:\s*(.+)/)?.[1] ?? "0B"}`);
  }
  for (const rel of CACHES) {
    const p = join(home, rel);
    const bytes = tamanho(p, env);
    const res = remover(p, { home, dryRun, log });
    if (res === "removido") r.caches += bytes;
    if (res === "seria") r.previstos.push(`seria removido: ${p} (${bytes} B)`);
  }
  for (const [nome, desc] of [["apt", "apt-get clean"], ["journal", "journalctl --vacuum-time=14d"]]) {
    if (dryRun) { r.previstos.push(`seria executado: sudo ${desc}`); continue; }
    const s = sudo(nome, env);
    if (!s.ok) r.falhas.push(`${desc} (${s.erro.slice(0, 80)})`);
  }
  return r;
}

/** Arquivos do próprio usuário em /tmp com mais de 7 dias — só quando não houver reboot (tmpfs). */
export function limparTmp({ home, tmp, agora, dryRun = false, log = () => {} }) {
  const previstos = [];
  if (!existsSync(tmp)) return previstos;
  const limite = agora.getTime() - 7 * 86_400_000;
  for (const n of readdirSync(tmp)) {
    const p = join(tmp, n);
    let st; try { st = lstatSync(p); } catch { continue; }
    // shortcut: só arquivos do próprio usuário (sem sudo); restos de outros usuários somem no próximo reboot (tmpfs).
    if (n.startsWith("systemd-private") || st.isSocket() || st.uid !== process.getuid() || st.mtimeMs >= limite) continue;
    if (remover(p, { home, tmp, dryRun, log }) === "seria") previstos.push(`seria removido: ${p}`);
  }
  return previstos;
}
