# Consumo individual

Cada convite congela uma tabela versionada em USD por milhão de tokens. As tabelas de voz, transcrição e resumo estão em `api/app/billing.py`. O operador pode usar `BRAARENA_RATES` em JSON com o mesmo formato quando os preços ou modelos mudarem. A taxa de câmbio é indicativa e configurável com `USD_BRL` e `USD_BRL_DATE`. A instalação inicial usa PTAX de venda de 25/11/2026.

Cada evento de consumo tem chave única por entrevista e resposta. O cálculo diferencia texto, áudio, cache e saída. O relatório salva os componentes, moedas e a versão das tarifas. Quando falta decomposição, o componente aparece indisponível e o montante conhecido fica estimado. O valor faturado permanece nulo até conciliação externa. A soma do período usa a data de encerramento UTC e mostra quantas entrevistas têm custo incompleto.

O orçamento por entrevista vem do modelo. A cada resposta concluída, o servidor verifica o consumo disponível de voz e transcrição e registra avisos a partir de 80%. Ao atingir 100%, solicita o encerramento. A cobrança da última resposta e do relatório pode exceder o limite.

[GPT Realtime](https://developers.openai.com/api/docs/models/gpt-realtime) · [GPT-4o Mini Transcribe](https://developers.openai.com/api/docs/models/gpt-4o-mini-transcribe) · [GPT-4.1 Mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) · [PTAX do Banco Central](https://ptax.bcb.gov.br/ptax_internet/consultarUltimaCotacaoDolar.do)
