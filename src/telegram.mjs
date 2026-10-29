// Telegram pelo Hermes; se o Hermes falhar (ou estiver fora), direto pela API do bot.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { rodar } from "./sistema.mjs";

function credenciais(home) {
  const env = Object.fromEntries(readFileSync(join(home, ".hermes", ".env"), "utf8").split("\n")
    .map((l) => l.match(/^([A-Z_]+)=["']?(.*?)["']?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
  return { token: env.TELEGRAM_BOT_TOKEN, chat: env.TELEGRAM_HOME_CHANNEL || env.TELEGRAM_ALLOWED_USERS?.split(",")[0] };
}

export function enviar(texto, { env = process.env, home, direto = false } = {}) {
  if (!direto && rodar("hermes", ["send", "-t", "telegram", texto], env, 60_000).ok) return "hermes";
  const { token, chat } = credenciais(home);
  // shortcut: o token aparece no argv do curl por ~1 s; trocar por --config - se a VPS tiver outros usuários.
  const r = rodar("curl", ["-s", "-m", "20", "-X", "POST", `https://api.telegram.org/bot${token}/sendMessage`, "-d", `chat_id=${chat}`, "--data-urlencode", `text=${texto.slice(0, 4000)}`], env, 30_000);
  if (!r.ok) throw new Error(`Telegram indisponível: ${r.erro}`);
  return "direto";
}
