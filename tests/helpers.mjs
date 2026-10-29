// Ambiente isolado: HOME, /tmp e estado temporários + binários falsos (docker, sudo, systemctl, journalctl, hermes, curl).
// Nenhum teste toca o HOME, o Docker ou o Telegram reais.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

export const DIA = 86_400_000;

/** Cria arquivo com conteúdo e mtime de `dias` atrás em relação a `agora`. */
export function arquivo(caminho, { dias = 0, agora = new Date(), conteudo = "x" } = {}) {
  mkdirSync(dirname(caminho), { recursive: true });
  writeFileSync(caminho, conteudo);
  const t = new Date(agora.getTime() - dias * DIA);
  utimesSync(caminho, t, t);
  return caminho;
}

export function volumeDf(nome, { links = 0, size = "1.5GB", projeto = "" } = {}) {
  return { Name: nome, Links: String(links), Size: size, Labels: projeto ? `com.docker.compose.project=${projeto}` : "" };
}

export function ambiente({ agora = "2026-10-26T04:00:00-03:00", env: extra = {} } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), "faxina-test-"));
  const dirs = Object.fromEntries(["home", "tmp", "estado", "bin", "log"].map((d) => [d, join(raiz, d)]));
  Object.values(dirs).forEach((d) => mkdirSync(d, { recursive: true }));
  mkdirSync(join(dirs.home, ".hermes"), { recursive: true });
  writeFileSync(join(dirs.home, ".hermes", ".env"), "TELEGRAM_BOT_TOKEN=123:fake\nTELEGRAM_HOME_CHANNEL=999\n");
  const log = dirs.log;
  const fake = (nome, corpo) => {
    const f = join(dirs.bin, nome);
    writeFileSync(f, `#!/usr/bin/env bash\necho "$*" >> '${log}/${nome}.log'\n${corpo}\n`);
    chmodSync(f, 0o755);
  };
  fake("docker", `
em() { [[ " $1 " == *" $2 "* ]]; }
case "$1 $2" in
  "system df") echo "\${FAKE_DF_VOLUMES:-[]}";;
  "volume inspect") echo "\${FAKE_CREATED:-2026-09-01T10:00:00Z}";;
  "volume rm") echo "$3";;
  "ps --format") for c in $FAKE_RUNNING; do echo "$c"; done;;
  "inspect --format") em "$FAKE_RESTART_NO" "\${@: -1}" && echo no || echo unless-stopped;;
  "builder prune"|"container prune"|"image prune") echo "Total reclaimed space: 1.5GB";;
  "start "*) em "$FAKE_START_FALHA" "$2" && { echo "erro ao iniciar $2" >&2; exit 1; }; echo "$2";;
  *) [ "$1" = start ] && { em "$FAKE_START_FALHA" "$2" && { echo "erro ao iniciar $2" >&2; exit 1; }; echo "$2"; };;
esac`);
  fake("systemctl", `
unit="\${@: -1}"
if [[ " $* " == *" is-active "* ]]; then
  if [ "$unit" = docker.service ] || [ "$unit" = docker ]; then
    n=$(cat '${log}/docker-demora' 2>/dev/null || echo "\${FAKE_DOCKER_DEMORA:-0}")
    if [ "$n" -gt 0 ]; then echo $((n-1)) > '${log}/docker-demora'; echo inactive; exit 3; fi
  fi
  [[ " $FAKE_INATIVOS " == *" $unit "* ]] && { echo inactive; exit 3; }
  echo active; exit 0
fi`);
  fake("journalctl", `echo "log de \${@: -1}: erro ao subir"`);
  fake("sudo", `[ -n "$FAKE_SUDO_FALHA" ] && [[ "$*" == *"$FAKE_SUDO_FALHA"* ]] && { echo "falhou: $FAKE_SUDO_FALHA" >&2; exit 1; }; exit 0`);
  fake("hermes", `[ "$FAKE_HERMES_SEND" = falha ] && exit 1; printf '%s\\n---\\n' "\${@: -1}" >> '${log}/telegram.log'`);
  fake("curl", "exit 0");
  const env = {
    ...process.env,
    PATH: `${dirs.bin}:${process.env.PATH}`,
    FAXINA_HOME: dirs.home,
    FAXINA_TMP: dirs.tmp,
    FAXINA_ESTADO_DIR: dirs.estado,
    FAXINA_AGORA: agora,
    FAXINA_ESPERA_MS: "1",
    ...extra,
  };
  const ler = (nome) => (existsSync(join(log, `${nome}.log`)) ? readFileSync(join(log, `${nome}.log`), "utf8") : "");
  const rodar = (...args) => spawnSync(process.execPath, [new URL("../bin/faxina.mjs", import.meta.url).pathname, ...args], { env, encoding: "utf8" });
  return { ...dirs, raiz, env, ler, rodar, agora: new Date(agora) };
}

export function estado(dir, semana) {
  const f = join(dir, semana, "estado.json");
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}

export function gravarEstado(dir, semana, dados) {
  mkdirSync(join(dir, semana), { recursive: true });
  writeFileSync(join(dir, semana, "estado.json"), JSON.stringify({ semana, ...dados }));
}
