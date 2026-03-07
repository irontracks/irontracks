Vou criar um ponto de restauração completo antes de mexermos no cálculo com IA.

## 1) Backup no GitHub
- Verificar mudanças atuais (`git status`).
- Criar um branch de snapshot com data/hora (ex.: `snapshot-20260114-1513`).
- Fazer commit de tudo que estiver no working tree (snapshot/WIP) com mensagem contendo data/hora.
- Enviar o branch para o GitHub (`git push -u origin snapshot-...`).

## 2) Snapshot local
- Gerar um arquivo `.tar.gz` do projeto com data/hora (ex.: `irontracks-snapshot-20260114-1513.tar.gz`).
- Salvar em uma pasta `./snapshots/` dentro do projeto.

Vou executar exatamente isso agora.