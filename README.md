# BraArena

Aplicação **local-first** para entrevistas técnicas de Angular, com playbook do entrevistador, whiteboard, editor, compilação online e avaliação em um fluxo simples.

## Abrir a aplicação

1. Baixe ou abra [index.html](./index.html) no **Chrome ou Edge desktop**, sem instalação nem servidor.
2. Cadastre o candidato e selecione um desafio do catálogo.
3. Use as três abas: **Código Angular**, **Whiteboard** e **Avaliação**.
4. Registre observações e pontue o candidato durante a entrevista.
5. Exporte o relatório ao finalizar. Faça backups JSON periódicos em **Dados e versões**.

## Funcionalidades

- **Oito desafios** de Angular, Signals, RxJS, performance, interfaces e arquitetura, com perguntas para o entrevistador.
- **Editor de código local** no próprio HTML.
- **Compilador Angular via StackBlitz**: clique em **Compilar Angular** para carregar editor e preview reais usando o SDK externo. **Requer internet**. Use **Capturar código** antes de sair do compilador para salvar alterações no navegador. A opção **Nova aba** não sincroniza alterações automaticamente com a BraArena.
- **Whiteboard** para desenhar fluxos, componentes e soluções, com tela cheia, ferramentas de desenho e exportação PNG.
- **Avaliação** por critérios, observações e relatório HTML.
- **IndexedDB**, versões e snapshots locais, restauração, importação/exportação JSON e integração opcional com pasta local, conforme a inspiração da [skill Local-First Version Control](https://github.com/acomar/skillforge/blob/main/skills/arquitetura/local-first-version-control/SKILL.md).

## Armazenamento e limitações

A BraArena é um único arquivo HTML/CSS/JavaScript e funciona offline **para a entrevista, edição local, whiteboard e avaliações**. A compilação Angular não funciona offline e usa o StackBlitz, que depende de internet e pode ser bloqueado em redes corporativas.

Os registros permanecem no **perfil do navegador** e em arquivos exportados, não são sincronizados automaticamente com GitHub nem entre navegadores. A pasta local opcional depende da **File System Access API**, com disponibilidade variável por navegador; não constitui sincronização multiusuário transacional. Não compartilhe pastas de avaliações concorrentes sem verificar conflitos e fazer backups.

**Privacidade:** não insira credenciais, segredos ou dados bancários reais no compilador externo. Os nomes e as avaliações dos candidatos são dados pessoais, armazene e compartilhe com proteção adequada.

## Referências

- [Angular Challenges](https://github.com/tomalaforge/angular-challenges)
- [Frontend Take-Home Challenge, LendWell](https://github.com/GetLendWell/frontend-take-home-challenge)
- [Angular Frontend Interview, CloudNC](https://github.com/cloudnc/frontend-interview)
- [StackBlitz JavaScript SDK](https://developer.stackblitz.com/platform/api/javascript-sdk)

O conteúdo e a implementação da BraArena são próprios, com referências conceituais nos projetos acima.

## Validação

HTML e JavaScript passaram por verificação sintática e smoke tests básicos dos fluxos de entrevista. **A compilação real no StackBlitz, a persistência em reinício real de navegador e a sincronização concorrente por pasta ainda requerem validação adicional** antes do uso em produção.

## Licença

[MIT](./LICENSE).
