# Controle de orçamento por entrevista (POC)

Status: requisito aprovado, implementação pendente.

- O administrador define orçamento em USD por entrevista, sugestão inicial de US$ 6 (configurável, não é preço garantido).
- Registrar usage de cada evento da OpenAI Realtime API: tokens de entrada/saída, modalidades de áudio/texto, modelo, tarifa aplicada e timestamp. Deduplicar eventos e reconciliar custo estimado com usage final.
- Calcular custo estimado acumulado em USD, alertas em 80% e 100%, custo final e relatório por entrevista e por período.
- Usar preço por modalidade e modelo configurável/versionado, nunca embutir tarifa fixa sem atualização.
- Ao atingir limite, evitar iniciar novas etapas e encerrar sessão de forma educada, sem interromper resposta no meio; aplicar também tempo máximo e limite de tokens, pois faturamento pode atrasar.
- Ações de interrupção são best effort; teto financeiro não garante valor máximo exato.
- Nunca revelar critérios internos, respostas esperadas ou chaves de API ao candidato.
- Não misturar custo da avaliação pós-entrevista com custo da conversa sem discriminar ambos.
- Gravação de áudio é opcional e depende de consentimento explícito; seu custo de armazenamento é contabilizado separadamente.


## Prioridade 1: custo final persistido por entrevista

**Critério de aceite obrigatório:** após o encerramento de cada entrevista, o relatório e o histórico administrativo exibem o custo calculado daquela entrevista em USD, e o valor permanece disponível para consultas posteriores.

- Capturar e persistir eventos de uso da OpenAI por sessão, com IDs para deduplicação, modelo, modalidades, tokens de entrada/saída, preço versionado e horário.
- No encerramento, consolidar o custo de voz e, separadamente, o custo da avaliação posterior, sem misturar despesas de outras entrevistas.
- Salvar no PostgreSQL o custo calculado, moeda USD, duração, modelo, versão da tarifa, componentes de custo, data de cálculo e status `estimado` ou `consolidado`.
- Exibir no relatório do candidato e no histórico administrativo duração e custo da entrevista; mostrar totais agregados por período.
- Se algum evento de uso estiver ausente, marcar `estimado` ou `incompleto` e reconciliar posteriormente; não apresentar um valor incompleto como cobrança final exata.
- O custo calculado a partir de usage e tarifas pode divergir do faturamento efetivo da conta, por descontos, créditos ou outros ajustes. Não rotular como valor faturado sem conciliação com cobrança oficial.
- Testes: duas entrevistas simultâneas não misturam custos; eventos duplicados não duplicam valor; fechamento sem usage completo fica pendente; relatório e histórico mantêm o valor após reinício.

**Prioridade 2:** orçamento por entrevista e alertas de 80% e 100% descritos acima.
