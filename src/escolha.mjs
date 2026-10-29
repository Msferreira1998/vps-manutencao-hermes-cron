// "limpar tudo" | "limpar 1,3,5" | "nada" → escolha da semana.
export function interpretar(texto, total) {
  const t = texto.trim().toLowerCase();
  if (/^nada\.?$/.test(t)) return { tipo: "nada", numeros: [] };
  if (/^limpar\s+tudo\.?$/.test(t)) return { tipo: "tudo", numeros: Array.from({ length: total }, (_, i) => i + 1) };
  const m = t.match(/^limpar\s+([\d,\s]+)$/);
  if (!m) return { erro: 'não entendi: responda "limpar tudo", "limpar 1,3" ou "nada"' };
  const numeros = [...new Set(m[1].split(/[,\s]+/).filter(Boolean).map(Number))].sort((a, b) => a - b);
  const fora = numeros.find((n) => n < 1 || n > total);
  return fora ? { erro: `o item ${fora} não existe (a lista tem ${total})` } : { tipo: "alguns", numeros };
}
