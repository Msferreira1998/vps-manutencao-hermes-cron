// Único ponto de execução de comandos externos e de sudo (allowlist PR-003).
import { spawnSync } from "node:child_process";

export function rodar(bin, args, env = process.env, timeout = 15 * 60_000) {
  const r = spawnSync(bin, args, { env, encoding: "utf8", timeout, maxBuffer: 64 * 1024 * 1024 });
  return { ok: !r.error && r.status === 0, saida: (r.stdout ?? "").trim(), erro: (r.stderr || r.error?.message || "").trim() };
}

const PERMITIDOS = {
  reboot: ["systemctl", "reboot"],
  apt: ["apt-get", "clean"],
  journal: ["journalctl", "--vacuum-time=14d"],
  "restart-docker": ["systemctl", "restart", "docker.service"],
  "restart-tailscaled": ["systemctl", "restart", "tailscaled.service"],
  "restart-ollama": ["systemctl", "restart", "ollama.service"],
};

export function sudo(nome, env = process.env) {
  if (!PERMITIDOS[nome]) throw new Error(`sudo não permitido: ${nome}`);
  return rodar("sudo", ["-n", ...PERMITIDOS[nome]], env);
}

export const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
