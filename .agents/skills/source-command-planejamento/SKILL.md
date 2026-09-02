---
name: "source-command-planejamento"
description: "Migrated source command `planejamento`"
---

# source-command-planejamento

Use this skill when the user asks to run the migrated source command `planejamento`.

## Command Template

# /planejamento — plano com Opus no máximo, execução com Sonnet

Uso: `/planejamento <descrição da funcionalidade ou ferramenta nova>`

O protocolo completo está **versionado** em [`docs/skill-planejamento.md`](../../docs/skill-planejamento.md).
Leia esse arquivo e siga as fases dele.

Ele mora em `docs/` porque `.claude/` está no `.gitignore` deste repo: aqui o
conteúdo sumiria em outro clone e nunca passaria por revisão de PR — foi
exatamente o que aconteceu com a primeira versão deste comando.
