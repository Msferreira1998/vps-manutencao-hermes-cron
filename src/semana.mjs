// "Semana" da faxina = data (BRT) da segunda-feira que fecha o ciclo domingo 21:00 → segunda 04:00.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TZ = "America/Sao_Paulo";
const DIA = 86_400_000;

export const diaBRT = (data) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(data);
export const horaBRT = (data) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(data);
export const somarDias = (dia, n) => new Date(Date.parse(`${dia}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);
export const ddmm = (dia) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

export function semanaDe(data) {
  const dia = diaBRT(data);
  const dow = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo, 1 = segunda
  return somarDias(dia, (8 - dow) % 7);
}

const arquivo = (base, semana) => join(base, semana, "estado.json");
export const lerSemana = (base, semana) => (existsSync(arquivo(base, semana)) ? JSON.parse(readFileSync(arquivo(base, semana), "utf8")) : null);

export function gravarSemana(base, semana, dados) {
  mkdirSync(join(base, semana), { recursive: true, mode: 0o700 });
  const novo = { ...lerSemana(base, semana), ...dados, semana };
  writeFileSync(arquivo(base, semana), JSON.stringify(novo, null, 2), { mode: 0o600 });
  return novo;
}

export function limparHistorico(base, semanaAtual) {
  if (!existsSync(base)) return;
  for (const s of readdirSync(base).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
    if (Date.parse(semanaAtual) - Date.parse(s) >= 28 * DIA) rmSync(join(base, s), { recursive: true, force: true });
  }
}
