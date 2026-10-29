// Itens arriscados da lista de domingo: volumes Docker órfãos e node_modules de projetos parados.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { rodar } from "./sistema.mjs";

const PULAR = new Set(["node_modules", ".git"]);

/** mtime mais recente dos arquivos do projeto, sem node_modules/.git. */
function maisRecente(dir, profundidade = 6) {
  let max = 0, nomes;
  try { nomes = readdirSync(dir); } catch { return 0; } // pasta sem permissão: não conta, não derruba a lista
  for (const nome of nomes) {
    if (PULAR.has(nome)) continue;
    const p = join(dir, nome);
    let st; try { st = statSync(p); } catch { continue; }
    max = Math.max(max, st.isDirectory() ? (profundidade ? maisRecente(p, profundidade - 1) : 0) : st.mtimeMs);
  }
  return max;
}

function projetosComNodeModules(dir, profundidade = 5, achados = []) {
  let nomes; try { nomes = readdirSync(dir); } catch { return achados; }
  if (nomes.includes("node_modules")) achados.push(dir);
  if (profundidade) for (const n of nomes) {
    if (PULAR.has(n) || n.startsWith(".")) continue;
    const p = join(dir, n);
    try { if (statSync(p).isDirectory()) projetosComNodeModules(p, profundidade - 1, achados); } catch { /* sem acesso */ }
  }
  return achados;
}

const du = (p, env) => Number(rodar("du", ["-sb", p], env).saida.split("\t")[0]) || 0;

export function listarItens({ home, agora, env = process.env, diasParado = 30 }) {
  const itens = [];
  const df = rodar("docker", ["system", "df", "-v", "--format", "{{json .Volumes}}"], env);
  if (df.ok) {
    for (const v of JSON.parse(df.saida || "[]").filter((v) => String(v.Links) === "0")) {
      const criado = rodar("docker", ["volume", "inspect", "--format", "{{.CreatedAt}}", v.Name], env).saida;
      const projeto = (v.Labels ?? "").match(/com\.docker\.compose\.project=([^,]+)/)?.[1] ?? "";
      itens.push({ tipo: "volume", alvo: v.Name, tamanhoTexto: v.Size, criado, projeto });
    }
  }
  const docs = join(home, "Documentos");
  if (existsSync(docs)) {
    for (const proj of projetosComNodeModules(docs)) {
      const ultimo = maisRecente(proj);
      if (agora.getTime() - ultimo < diasParado * 86_400_000) continue;
      const alvo = join(proj, "node_modules");
      itens.push({ tipo: "node_modules", alvo, tamanho: du(alvo, env), parado_desde: new Date(ultimo).toISOString() });
    }
  }
  return itens.map((item, i) => ({ numero: i + 1, ...item }));
}
