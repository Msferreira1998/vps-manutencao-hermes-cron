#!/usr/bin/env node
// faxina lista | escolher "<texto>" | limpar [--dry-run] [--sem-reboot] | pos-boot — ver specs/*/0001-faxina-semanal/spec.md
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative } from "node:path";
import { semanaDe, lerSemana, gravarSemana, limparHistorico, somarDias, ddmm } from "../src/semana.mjs";
import { remover } from "../src/protecao.mjs";
import { interpretar } from "../src/escolha.mjs";
import { listarItens } from "../src/itens.mjs";
import { limparSeguro, limparTmp, tamanho } from "../src/seguro.mjs";
import { sessoesAntigas } from "../src/sessoes.mjs";
import { estaAtivo, cpuVigiados, aguardarReboot } from "../src/atividade.mjs";
import { rodar, sudo, dormir } from "../src/sistema.mjs";
import { enviar } from "../src/telegram.mjs";

const env = process.env;
const HOME = env.FAXINA_HOME ?? homedir();
const TMP = env.FAXINA_TMP ?? "/tmp";
const BASE = env.FAXINA_ESTADO_DIR ?? join(HOME, ".local/state/vps-faxina");
const ESPERA = env.FAXINA_ESPERA_MS ? Number(env.FAXINA_ESPERA_MS) : null; // testes: esperas encurtadas e relógio virtual
let decorrido = 0;
const agora = () => new Date((env.FAXINA_AGORA ? Date.parse(env.FAXINA_AGORA) : Date.now()) + (ESPERA === null ? 0 : decorrido));
const esperar = (ms) => { if (ESPERA === null) dormir(ms); else { decorrido += ms; dormir(ESPERA); } };
const SEMANA = semanaDe(agora());

const GB = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`);
const telegram = (texto, direto = false) => enviar(texto, { env, home: HOME, direto });

function log(linha) {
  mkdirSync(BASE, { recursive: true, mode: 0o700 });
  appendFileSync(join(BASE, "faxina.log"), `${new Date().toISOString()} ${linha}\n`, { mode: 0o600 });
}

function medidas() {
  const disco = Number(rodar("df", ["-B1", "--output=used", HOME], env).saida.split("\n").pop()) || 0;
  const m = Object.fromEntries(readFileSync("/proc/meminfo", "utf8").split("\n").map((l) => l.split(/:\s+/)).filter((p) => p[1]).map(([k, v]) => [k, parseInt(v, 10) * 1024]));
  return { disco, memoria: m.MemTotal - m.MemAvailable };
}

// ---------- domingo 21:00 ----------
function lista() {
  const passada = lerSemana(BASE, somarDias(SEMANA, -7));
  const aprovadosPassados = new Set((passada?.escolha?.numeros ?? []).map((n) => passada.lista?.[n - 1]?.alvo));
  const naPassada = new Set((passada?.lista ?? []).map((i) => i.alvo).filter((a) => !aprovadosPassados.has(a)));
  const itens = listarItens({ home: HOME, agora: agora(), env }).map((i) => ({ ...i, semana_passada: naPassada.has(i.alvo) }));
  gravarSemana(BASE, SEMANA, { lista: itens, escolha: null, lista_em: agora().toISOString() });
  const linha = (i) => i.tipo === "volume"
    ? `${i.numero}. 🐳 volume ${i.alvo} (${i.tamanhoTexto}) — nenhum container, criado ${i.criado ? ddmm(i.criado.slice(0, 10)) : "?"}${i.projeto ? `, projeto ${i.projeto}` : ""}`
    : `${i.numero}. 📦 ${relative(join(HOME, "Documentos"), i.alvo)} (${GB(i.tamanho)}) — projeto parado desde ${ddmm(i.parado_desde.slice(0, 10))}`;
  const exemplo = itens.length > 1 ? `limpar 1,${itens.length}` : "limpar 1";
  telegram(itens.length
    ? [`🧹 Faxina de segunda ${ddmm(SEMANA)} 04:00 — itens que só saem com o seu ok:`, "",
       ...itens.map((i) => linha(i) + (i.semana_passada ? " — também na semana passada" : "")), "",
       `Responda: *limpar tudo* · *${exemplo}* · *nada*. Sem resposta = nada.`,
       "⚠️ O reboot apaga tudo em /tmp (fica na RAM)."].join("\n")
    : `🧹 Faxina de segunda ${ddmm(SEMANA)} 04:00: nenhum item arriscado esta semana, só a limpeza segura.\n⚠️ O reboot apaga tudo em /tmp (fica na RAM).`);
  log(`${SEMANA} lista ${itens.length} itens`);
  return 0;
}

// ---------- escolha pelo Telegram ----------
function escolher(texto = "") {
  const e = lerSemana(BASE, SEMANA);
  if (!e?.lista?.length) { telegram("ℹ️ Não há lista de faxina aberta para escolher."); return 2; }
  const r = interpretar(texto, e.lista.length);
  if (r.erro) { telegram(`❌ Faxina: ${r.erro}. A escolha anterior continua valendo.`); return 1; }
  gravarSemana(BASE, SEMANA, { escolha: r });
  const total = r.numeros.reduce((s, n) => s + (e.lista[n - 1].tamanho ?? 0), 0);
  telegram(r.tipo === "nada" ? "✅ Anotado: nenhum item arriscado será apagado." : `✅ Anotado: apagar ${r.numeros.join(", ")}${total ? ` (~${GB(total)})` : ""} na segunda às 04:00.`);
  log(`${SEMANA} escolha ${JSON.stringify(r)}`);
  return 0;
}

// ---------- segunda 04:00 ----------
function ativoAgora() {
  if (env.FAXINA_ATIVIDADE !== undefined) {
    const seq = env.FAXINA_ATIVIDADE.split(",");
    ativoAgora.i = (ativoAgora.i ?? 0) + 1;
    return seq[Math.min(ativoAgora.i, seq.length) - 1] === "1";
  }
  const cpu = cpuVigiados(10 * 60_000, (ms) => dormir(ESPERA ?? ms));
  const ativo = estaAtivo({ home: HOME, agora: agora(), cpuSegundos: cpu });
  if (ativo) log(`${SEMANA} ativo: cpu=${cpu.toFixed(1)}s ${cpuVigiados.culpados.join("; ") || "(sessão do Claude com .jsonl recente)"}`);
  return ativo;
}

function relatorio({ antes, depois, seguro, aprovados, sessoes, reboot, posBoot = [] }) {
  return [
    `🧹 Faxina ${ddmm(SEMANA)}`,
    `Disco: ${GB(antes.disco)} → ${GB(depois.disco)} · Memória: ${GB(antes.memoria)} → ${GB(depois.memoria)}`,
    `Docker: ${seguro.docker.join(" · ") || "nada"}`,
    `Caches: ${GB(seguro.caches)} liberado`,
    `Sessões do Claude: ${sessoes.n} removidas (${GB(sessoes.bytes)})`,
    aprovados.length ? `Aprovados removidos: ${aprovados.join(", ")}` : "Aprovados removidos: nenhum",
    ...(seguro.falhas.length ? [`⚠️ Falhas: ${seguro.falhas.join("; ")}`] : []),
    reboot,
    ...posBoot,
  ].join("\n");
}

function limpar(flags) {
  const dryRun = flags.includes("--dry-run");
  const semReboot = flags.includes("--sem-reboot");
  const e = lerSemana(BASE, SEMANA) ?? {};
  const antes = medidas();
  const previstos = [];
  const seguro = limparSeguro({ home: HOME, env, dryRun, log });
  previstos.push(...seguro.previstos);

  const escolhidos = (e.escolha?.numeros ?? []).map((n) => e.lista?.[n - 1]).filter(Boolean);
  const aprovados = [];
  for (const item of escolhidos) {
    if (item.tipo === "volume") {
      if (dryRun) { previstos.push(`seria removido: volume ${item.alvo}`); continue; }
      const r = rodar("docker", ["volume", "rm", item.alvo], env); // o Docker recusa volume que voltou a ser usado
      r.ok ? aprovados.push(`volume ${item.alvo}`) : seguro.falhas.push(`volume ${item.alvo}: ${r.erro.slice(0, 80)}`);
    } else {
      const res = remover(item.alvo, { home: HOME, aprovados: [item.alvo], dryRun, log });
      if (res === "seria") previstos.push(`seria removido: ${item.alvo}`);
      if (res === "protegido") previstos.push(`protegido, não seria removido: ${item.alvo}`);
      if (res === "removido") aprovados.push(relative(join(HOME, "Documentos"), item.alvo));
    }
  }

  const sessoes = { n: 0, bytes: 0 };
  for (const alvo of sessoesAntigas(HOME, agora())) {
    const bytes = tamanho(alvo, env);
    const res = remover(alvo, { home: HOME, dryRun, log });
    if (res === "seria") previstos.push(`seria removido: ${alvo}`);
    if (res === "removido" && alvo.endsWith(".jsonl")) { sessoes.n++; sessoes.bytes += bytes; }
  }
  if (!dryRun) limparHistorico(BASE, SEMANA);

  if (dryRun) {
    previstos.push(...limparTmp({ home: HOME, tmp: TMP, agora: agora(), dryRun, log }).map((p) => `${p} (só se o reboot for pulado)`));
    console.log([...previstos, `reboot: ${semReboot ? "não (--sem-reboot)" : ativoAgora() ? "seria adiado (trabalho ativo)" : "seria feito"}`].join("\n"));
    return 0;
  }

  let reboot = { acao: "sem" };
  if (!semReboot) reboot = aguardarReboot({ ativo: ativoAgora, agora, esperar });
  if (reboot.acao === "reboot") {
    const religar = rodar("docker", ["ps", "--format", "{{.Names}}"], env).saida.split("\n").filter(Boolean)
      .filter((c) => rodar("docker", ["inspect", "--format", "{{.HostConfig.RestartPolicy.Name}}", c], env).saida === "no");
    const depois = medidas();
    gravarSemana(BASE, SEMANA, { reboot: "pedido", relatorio_enviado: false, religar, relatorio: { antes, depois, seguro, aprovados, sessoes, reboot: `🔁 Reboot feito às ${reboot.hora}` } });
    log(`${SEMANA} reboot pedido (${reboot.hora}); religar=${religar.join(",")}`);
    const s = sudo("reboot", env);
    if (!s.ok) { telegram(`❌ Faxina: reboot recusado (${s.erro})`); return 1; }
    return 0;
  }
  // Sem reboot o /tmp (tmpfs) não é zerado: limpa o que tem mais de 7 dias.
  limparTmp({ home: HOME, tmp: TMP, agora: agora(), log });
  const depois = medidas();
  const texto = relatorio({ antes, depois, seguro, aprovados, sessoes, reboot: reboot.acao === "pulado" ? `⏭️ reboot pulado: trabalho ativo até ${reboot.hora}` : "⏭️ sem reboot (--sem-reboot)" });
  gravarSemana(BASE, SEMANA, { reboot: reboot.acao === "pulado" ? "pulado" : "sem", relatorio_enviado: true });
  telegram(texto);
  log(`${SEMANA} limpeza concluída sem reboot (${reboot.acao})`);
  return 0;
}

// ---------- após o boot ----------
const SISTEMA = ["docker.service", "tailscaled.service", "ollama.service"];
// Serviços e timers do seu usuário que devem estar de pé depois do boot. Esta lista é
// a sua: troque "meu-bot.service" pelos seus e tire o que não usa.
const USUARIO = ["hermes-gateway.service", "meu-bot.service", "rapport-rascunho.timer", "rapport-auto.timer", "faxina-lista.timer", "faxina-limpar.timer"];
const ativa = (u, user) => rodar("systemctl", [...(user ? ["--user"] : []), "is-active", u], env).ok;
const ultimasLinhas = (u, user) => rodar("journalctl", [...(user ? ["--user"] : []), "-n", "20", "--no-pager", "-u", u], env).saida;

function posBoot() {
  const e = lerSemana(BASE, SEMANA);
  if (e?.reboot !== "pedido" || e.relatorio_enviado) return 2;
  const linhas = [], falhas = [];

  let docker = false;
  for (let i = 0; i < 30 && !(docker = ativa("docker.service")); i++) esperar(10_000); // até 5 min
  const servicos = [...SISTEMA.map((u) => [u, false]), ...USUARIO.map((u) => [u, true])];
  for (const [u, user] of servicos) {
    if (u === "docker.service" && docker) continue;
    let ok = ativa(u, user);
    for (let t = 0; t < 2 && !ok; t++) {
      if (user) rodar("systemctl", ["--user", "restart", u], env); else sudo(`restart-${u.replace(".service", "")}`, env);
      esperar(60_000);
      ok = ativa(u, user);
    }
    if (u === "docker.service") docker = ok;
    if (!ok) falhas.push(`❌ ${u} fora depois de 2 tentativas:\n${ultimasLinhas(u, user).split("\n").slice(-20).join("\n")}`);
  }
  if (docker) {
    for (const c of e.religar ?? []) {
      let r = rodar("docker", ["start", c], env);
      for (let t = 0; t < 2 && !r.ok; t++) { esperar(60_000); r = rodar("docker", ["start", c], env); }
      r.ok ? linhas.push(`▶️ ${c} religado`) : falhas.push(`❌ container ${c}: ${r.erro.split("\n").slice(-20).join("\n")}`);
    }
  }
  // Estado gravado antes do reboot; campos ausentes (versão anterior, gravação parcial) não derrubam o relatório.
  const rel = { antes: medidas(), seguro: { docker: [], caches: 0, falhas: [] }, aprovados: [], sessoes: { n: 0, bytes: 0 }, reboot: "🔁 Reboot feito", ...e.relatorio };
  const texto = relatorio({ ...rel, depois: medidas(), posBoot: [...linhas, ...(falhas.length ? falhas : [`✅ Serviços e timers no ar (${servicos.length} conferidos)`])] });
  const hermesFora = falhas.some((f) => f.includes("hermes-gateway"));
  try { telegram(texto, hermesFora); } catch (err) { log(`${SEMANA} relatório não entregue: ${err.message}`); }
  gravarSemana(BASE, SEMANA, { reboot: "feito", relatorio_enviado: true, falhas_pos_boot: falhas.length });
  log(`${SEMANA} pós-boot: ${falhas.length} falhas`);
  return falhas.length ? 1 : 0;
}

const [cmd, ...resto] = process.argv.slice(2);
const acoes = { lista, escolher: () => escolher(resto.join(" ")), limpar: () => limpar(resto), "pos-boot": posBoot };
if (!acoes[cmd]) { console.error('uso: faxina lista | escolher "<texto>" | limpar [--dry-run] [--sem-reboot] | pos-boot'); process.exit(1); }
try { process.exit(acoes[cmd]()); } catch (err) {
  log(`${cmd} falhou: ${err.stack}`);
  console.error(err.message);
  try { telegram(`❌ Faxina (${cmd}) falhou: ${err.message.slice(0, 300)}\nLog: ~/.local/state/vps-faxina/faxina.log`); } catch { /* sem canal: fica no log */ }
  process.exit(1);
}
