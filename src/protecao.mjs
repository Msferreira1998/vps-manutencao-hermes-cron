// Lista de proteção (PR-002): toda remoção passa por aqui; nada protegido sai, nem com aprovação.
import { existsSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

const DENTRO = (rel) => rel !== "" && !rel.startsWith("..") && !rel.startsWith(sep);

function real(p) {
  // Resolve links do caminho existente mais próximo: um link não pode levar a remoção para dentro da proteção.
  let atual = resolve(p), resto = [];
  while (!existsSync(atual) && dirname(atual) !== atual) { resto.unshift(basename(atual)); atual = dirname(atual); }
  return join(realpathSync(atual), ...resto);
}

export function protegido(caminho, { home, tmp, aprovados = [] } = {}) {
  const p = real(caminho);
  if (tmp && DENTRO(relative(real(tmp), p))) return false;
  const rel = relative(real(home), p);
  if (!DENTRO(rel)) return true; // fora do HOME (e fora do /tmp permitido): nunca
  const partes = rel.split(sep);
  if (basename(p) === "node_modules" && aprovados.map((a) => real(a)).includes(p)) return false;
  const [topo, sub, terceiro, quarto] = partes;
  if (["Documentos", ".ssh", ".config", ".gnupg"].includes(topo)) return true;
  if (topo === ".claude") return !(sub === "projects" && terceiro && quarto && quarto !== "memory" && !partes.includes("memory"));
  if (topo === ".hermes") return !(sub === "cache" && terceiro === "uv");
  if (topo === ".cache" && ["ms-playwright", "Cypress", "google-chrome-for-testing-headless"].includes(sub)) return true;
  if (topo === ".local" && sub === "state" && ["rapport-diario", "vps-faxina"].includes(terceiro)) return true;
  return partes.length < 2; // pastas de primeiro nível do HOME inteiras nunca saem
}

export function remover(caminho, { home, tmp, aprovados, dryRun = false, log = () => {} } = {}) {
  if (protegido(caminho, { home, tmp, aprovados })) { log(`protegido, não removido: ${caminho}`); return "protegido"; }
  if (!existsSync(caminho)) return "ausente";
  if (dryRun) return "seria";
  rmSync(caminho, { recursive: true, force: true });
  log(`removido: ${caminho}`);
  return "removido";
}
