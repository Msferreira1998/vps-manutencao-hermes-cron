# Manutenção de VPS para o Hermes

Quatro automações para quem administra a própria VPS e usa o [Hermes Agent](https://github.com/NousResearch/hermes-agent):

| O que | Quando | Como roda |
| --- | --- | --- |
| Relatório da máquina no Telegram | todo dia, 08:00 | cron do Hermes, `scripts/vps-relatorio.sh` |
| Alerta de disco e RAM | a cada 15 min, **só fala se apertar** | cron do Hermes, `scripts/vps-alerta.sh` |
| Faxina semanal: lista o que dá para limpar | segunda | timer do systemd, `bin/faxina.mjs lista` |
| Faxina: limpa o que você escolheu | depois da sua escolha | timer do systemd, `bin/faxina.mjs limpar` |

Node puro, sem dependência para instalar. Os dois scripts de cron são bash e não dependem do resto.

## A parte mais útil, se você tem pressa

Os dois scripts em `scripts/` resolvem sozinhos e não precisam do projeto:

```bash
cp scripts/vps-relatorio.sh scripts/vps-alerta.sh ~/.hermes/scripts/
hermes cron create "0 8 * * *"    --name "Relatório diário VPS" --no-agent \
  --script vps-relatorio.sh --deliver telegram
hermes cron create "*/15 * * * *" --name "Alerta disco/RAM"     --no-agent \
  --script vps-alerta.sh --deliver telegram --failure-deliver local
```

- **`vps-relatorio.sh`**: disco, RAM, carga, as 5 maiores consumidoras de memória, espaço do Docker, serviços com falha e reboot pendente. Nenhuma chamada de modelo — é bash e `/proc`.
- **`vps-alerta.sh`**: imprime **nada** quando está tudo bem, e o cron com `--no-agent` só manda mensagem quando há saída. Fala quando o disco passa de 85% ou a RAM disponível cai de 10%. Ajuste os dois números na primeira linha do arquivo.

`--failure-deliver local` no alerta é de propósito: se o script falhar a cada 15 minutos, o erro vai para o log em vez de encher seu Telegram.

## A faxina semanal

A ideia: **a máquina sugere, você decide, ela executa.** Nada é apagado sem a sua escolha.

```bash
git clone <este-repo> ~/Documentos/vps-manutencao
cd ~/Documentos/vps-manutencao
npm run test:tdd                      # 31 testes
node bin/faxina.mjs lista              # mostra o que daria para limpar, com tamanho
```

Ele olha cache de pacote, imagens e volumes soltos do Docker, logs antigos, lixo de build e
sessões velhas. Para cada item diz o tamanho e o risco. Você escolhe por texto e depois limpa:

```bash
node bin/faxina.mjs escolher "docker e logs, menos os volumes"
node bin/faxina.mjs limpar --dry-run    # mostra o que faria
node bin/faxina.mjs limpar              # executa
```

Comandos: `lista`, `escolher "<texto>"`, `limpar [--dry-run] [--sem-reboot]`, `pos-boot`.
`--dry-run` não apaga nada. `pos-boot` é o passo que roda depois de um reboot pendente.
Pelo Telegram, a skill em `hermes-skill/faxina-escolha/` deixa o Hermes conduzir a escolha.

Instalar os timers (rodam como seu usuário, sem root):

```bash
cp systemd/*.service systemd/*.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now faxina-lista.timer faxina-limpar.timer
```

As units usam `%h` em vez de caminho fixo, então funcionam no seu usuário sem editar. Elas
esperam o projeto em `~/Documentos/vps-manutencao`; se você clonou em outro lugar, ajuste
`WorkingDirectory` e `ExecStart`.

## O que não está aqui

As especificações e as decisões de projeto ficaram de fora porque descrevem a minha máquina.
O que está publicado é o código, os testes e a documentação técnica em `docs/`.
