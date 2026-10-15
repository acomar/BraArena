# BraArena

Plataforma local-first para entrevistas técnicas de frontend, com foco inicial em Angular e liderança técnica.

## Executar

1. Baixe o arquivo [index.html](./index.html) ou clone este repositório.
2. Abra `index.html` no Chrome ou Edge. Não exige instalação, build nem servidor.
3. Cadastre um candidato, escolha um desafio e inicie a entrevista.
4. Registre notas, respostas, observações e evidências no playbook.
5. Gere relatórios e exporte backups pela seção **Dados e versões**.

## Recursos

- 16 desafios originais com ênfase em Angular, RxJS, JavaScript, arquitetura, performance e contextos financeiros.
- Playbook para entrevistador, perguntas de aprofundamento, pistas e sinais de senioridade.
- Rubrica de avaliação e relatório individual para impressão.
- Editor e testes executáveis para os desafios JavaScript suportados.
- IndexedDB para gravação local, snapshots e histórico de versões.
- Exportação e importação JSON. Publicação em uma pasta escolhida pelo usuário quando a File System Access API estiver disponível.
- Detecção de divergências de edições locais; funcionalidades de sincronização dependem das limitações do navegador e do sistema de arquivos.

## Armazenamento e privacidade

A aplicação não possui backend. Dados de candidatos, entrevistas e avaliações são guardados no perfil do navegador utilizado. Não são enviados automaticamente ao GitHub. Faça backups JSON regulares e proteja-os como dados pessoais.

A aplicação não executa projetos Angular completos. Esses desafios são conduzidos e avaliados pelo entrevistador. O runner executa somente os exercícios JavaScript previstos; **não cole nele código recebido de fontes desconhecidas**.

## Referências conceituais

- [Angular Challenges](https://github.com/tomalaforge/angular-challenges)
- [GetLendWell frontend take-home challenge](https://github.com/GetLendWell/frontend-take-home-challenge)
- [CloudNC frontend interview](https://github.com/cloudnc/frontend-interview)
- [SkillForge: Local-First Version Control](https://github.com/acomar/skillforge/blob/main/skills/arquitetura/local-first-version-control/SKILL.md)

A BraArena possui implementação própria; os repositórios acima serviram de referência conceitual para os temas dos exercícios.

## Licença

Consulte [LICENSE](./LICENSE).
