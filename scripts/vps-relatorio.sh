#!/usr/bin/env bash
# Relatório diário da VPS (sem LLM): disco, RAM, carga, docker, serviços com falha.
echo "📊 VPS $(hostname) — $(date '+%d/%m %H:%M')"
echo "⏱️ $(uptime -p) | carga: $(cut -d' ' -f1-3 /proc/loadavg)"
free -h | awk '/^Mem/{print "🧠 RAM: "$3" usados de "$2" (livre p/ uso: "$7")"}'
df -h / | awk 'NR==2{print "💾 Disco /: "$3" de "$2" ("$5")"}'
echo; echo "🔝 Top 5 RAM:"; ps -eo rss,comm --sort=-rss | awk 'NR>1&&NR<=6{printf "  %.1f GB  %s\n",$1/1048576,$2}'
if command -v docker >/dev/null; then echo; echo "🐳 Docker:"; docker system df --format '  {{.Type}}: {{.Size}} (recuperável {{.Reclaimable}})' 2>/dev/null; fi
f=$(systemctl --failed --no-legend --plain 2>/dev/null | awk '{print $1}')
[ -n "$f" ] && { echo; echo "⚠️ Serviços com falha:"; echo "$f" | sed 's/^/  /'; }
[ -f /var/run/reboot-required ] && echo "🔁 Reboot pendente (atualização do sistema)"
exit 0
