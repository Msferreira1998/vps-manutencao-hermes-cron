#!/usr/bin/env bash
# Alerta silencioso: só imprime (e o Hermes só envia) se disco >= 85% ou RAM disponível < 10%.
d=$(df --output=pcent / | tail -1 | tr -dc 0-9)
m=$(awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}END{printf "%d",a*100/t}' /proc/meminfo)
[ "$d" -ge 85 ] && echo "🚨 Disco / em ${d}% — peça ao Hermes: \"limpa o disco\""
[ "$m" -lt 10 ] && echo "🚨 RAM disponível só ${m}% — peça ao Hermes: \"o que está comendo memória?\""
exit 0
