# POC de entrevistas por voz

A branch `feat/ai-interview-poc` contém a aplicação Angular/FastAPI. A aplicação estática anterior permanece em `index.html`.

## Operação

Em **Modelos**, escreva as instruções em um único campo de até 10.000 caracteres e clique em **Salvar modelo**. Título, tempo total, orçamento, gravação e regras reutilizáveis ficam em **Opções do modelo**. Sem título, o sistema gera um identificador de exibição. Para manter gabarito e critérios fora da conversa por voz, escreva uma linha com `Avaliação privada:` e coloque essas notas abaixo dela. O cabeçalho opcional `Etapa 1 · Pergunta` separa os assuntos. A entrevista avança conforme as respostas, com um limite máximo total. O editor aceita os cabeçalhos antigos com segundos. Cada convite congela a definição do modelo, as versões das regras e a tabela de tarifas. O link carrega um segredo no fragmento da URL. O banco mantém o hash. Links antigos que usam a query continuam aceitos.

O candidato verifica som e microfone, aceita o processamento e decide separadamente sobre gravação. A API abre a chamada por SDP e cria uma credencial local de sessão. A chave da OpenAI permanece no servidor. Um único processo Uvicorn por instalação coordena o WebSocket de controle, as transições entre assuntos após uma resposta e o encerramento. Convites novos usam a voz Bossa em português brasileiro no GPT-Live 1.1, com áudio WebRTC e controle privado no servidor. Convites emitidos com tarifas Realtime continuam com o modelo e a voz anteriores. A tarifa Live é de US$ 0,05 por minuto ativo com transcrição incluída. A despedida pode acontecer antes do limite total. Uma queda curta de rede pode ser recuperada pelo ICE. Se a conexão se perder definitivamente, o gestor precisa emitir outro convite.

Somente a faixa de áudio é negociada. Não existe endpoint de telemetria do navegador. A conexão do backend com a OpenAI fornece os identificadores, transcrições e uso. As regras privadas de avaliação entram somente no processamento posterior. Evidências antigas do navegador permanecem identificadas. O relatório mantém texto e IDs para conferência humana. Uma recomendação de emprego não integra o contrato de avaliação.

## Gravação e retenção

O navegador mistura a saída remota e o microfone em Web Audio, comprime em WebM/Opus e envia no encerramento. O gestor autenticado pode reproduzir ou excluir o arquivo. A API expira a gravação conforme `RECORDING_DAYS` (30 por padrão). Uma aba fechada à força pode perder a gravação local antes do envio. Backups privados podem conter a gravação até o fim da própria retenção.

## Verificação

- Backend e PostgreSQL real em banco descartável: `docker build -t braarena-api:development api` e `docker compose -f compose.test.yml up --abort-on-container-exit --exit-code-from test`.
- Interface Angular e Chromium: construa `braarena-web:development` de `web` e `braarena-browser:test` de `tests`, depois execute `docker compose -f tests/compose.browser.yml up --abort-on-container-exit --exit-code-from browser`.
- Os testes automatizados usam dados sintéticos. O contrato de voz é exercitado com transporte simulado. A verificação em desktop e celular físicos exige uma chave com acesso aos modelos e uma conversa com microfone real.
- O relatório sinaliza transcrição incompleta, ausência de uso ou falha da análise. Em uma queda de observador, a API tenta desligar a chamada e guarda o identificador para tentar novamente se a OpenAI estiver inacessível.

[Controle Realtime pelo servidor](https://developers.openai.com/api/docs/guides/realtime-server-controls) · [Negociação WebRTC](https://developers.openai.com/api/docs/guides/realtime-webrtc)

A suíte de navegador usa ainda um segundo par WebRTC no Chromium, com áudio sintético, para verificar o movimento da boca e a presença de uma gravação WebM/Opus exclusivamente no fluxo autorizado. O CI valida o SHA servido por HTTPS a partir de um runner externo. As imagens do GHCR usam os nomes `acomar/braarena-poc-api` e `acomar/braarena-poc-web`.

O relatório apresenta parecer técnico e notas de 0 a 5 por critério, com citações verificadas das respostas. Casos sem evidência ficam sem nota. Quando o gestor não especifica critérios para uma pergunta ou situação, o painel usa “Adequação da resposta ao caso”. A exportação inclui a avaliação e a revisão do gestor.
