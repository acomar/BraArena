# Publicação da POC

Na VPS de referência, o BraArena possui projeto Compose, banco, volume, cron e diretório próprios. A interface escuta em HTTPS na porta 8443 e utiliza o certificado já emitido para o IP. A API e o banco só têm endereços internos do Docker.

## Primeiro deploy

Execute `python3 deploy/provision.py` como administrador na VPS de referência. O script cria `/opt/braarena/.env` e `/opt/braarena/admin-token` com modo 600. Uma instalação existente preserva os segredos. Para outra VPS, revise IP, porta e caminhos do certificado. O token administrativo é lido no servidor e digitado no painel. A chave do projeto OpenAI pode ser instalada em `/opt/braarena/openai.key` com modo 600. A manutenção importa a chave, atualiza a API e remove a cópia de entrada. A página de saúde informa se a chave foi carregada.

O Compose usa tags imutáveis por commit. Com as duas imagens disponíveis localmente, execute `cd /opt/braarena && ./deploy-remote.sh SHA`. Instale `deploy/braarena.cron` em `/etc/cron.d/braarena` com modo 644. A manutenção confere o certificado a cada dois minutos e recria somente o web do BraArena quando o certificado servido diverge do certificado renovado.

## Entrega contínua

A branch de implementação dispara testes, build e publicação no GHCR pelo GitHub Actions. O workflow também disponibiliza as mesmas imagens verificadas como asset de pré-release no repositório público. O agente da VPS verifica o head da branch, a execução aprovada no repositório e o digest SHA-256 publicado pelo GitHub antes de carregar as imagens. Assim o deploy usa conexão de saída e dispensa uma chave SSH de longa duração no GitHub. A verificação ocorre a cada dez minutos. Para executá-la imediatamente, use `python3 /opt/braarena/pull-release.py`.

## Backup e rollback

O deploy valida os serviços, o PostgreSQL e a URL HTTPS. Em erro, tenta reaplicar a versão anterior. Para rollback manual, crie `/opt/braarena/.hold-release` e execute `./deploy-remote.sh "$(cat .previous-sha)"` em `/opt/braarena`. Remova o arquivo de pausa ao retomar a entrega automática. As migrações da POC são aditivas. Rollback de imagens não reverte dados.

O backup diário e o backup anterior a cada atualização usam pg_dump custom, com retenção de sete dias e acesso exclusivo do operador. `./backup.sh` gera um backup sob demanda. A restauração deve ser testada em banco isolado com pg_restore antes de qualquer substituição dos dados ativos. As cópias ficam no mesmo host.
