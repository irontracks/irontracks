# `/lista_skills` — todos os comandos disponíveis, sempre atualizado

## Por que existe

Pedido do dono, 10/09/2026: uma forma rápida de ver todas as skills sem abrir
`.claude/commands/` na mão. **Nunca copie a lista abaixo como resposta fixa** —
ela precisa ser lida do disco toda vez, senão o comando novo que alguém criar
amanhã fica invisível até este arquivo ser atualizado à mão. É a mesma armadilha
de nota que apodrece que o resto do `CLAUDE.md` já evita.

## Protocolo

### Fase 1 — varrer as três origens, nesta ordem

```bash
ls -1 .claude/commands/*.md 2>/dev/null           # comandos DESTE projeto
ls -1 ~/.claude/skills/*/SKILL.md 2>/dev/null      # skills GLOBAIS (todo projeto)
ls -1 .claude/agents/*.md docs/agents/*.md 2>/dev/null   # agentes (Agent tool)
```

Cada comando de `.claude/commands/<nome>.md` vira `/<nome>`. Skills globais em
`~/.claude/skills/<nome>/SKILL.md` já se invocam como `<nome>` (sem barra, no
padrão do Skill tool). Agentes não são slash-command — são chamados via `Agent`
com `subagent_type`.

### Fase 2 — extrair a descrição de UMA linha

Para comando de projeto: primeira linha do `.md` (`# /nome — descrição`), corte
o `# /nome — `.

Para skill global: campo `description` do frontmatter YAML.

Para agente: campo `description` do frontmatter (`.claude/agents/*.md`) — é a
mesma string que aparece no `<system-reminder>` de agentes disponíveis.

### Fase 3 — agrupar e reportar

```
COMANDOS DESTE PROJETO (.claude/commands/)
  /irmaos       — quem MAIS precisa mudar quando você mexe aqui
  /guard        — travar um invariante e PROVAR que o teste pega
  ...

SKILLS GLOBAIS (~/.claude/skills/, valem em qualquer projeto)
  documentar    — ...
  ...

AGENTES (chamados via Agent tool, não por /)
  auditor-de-classe — varre uma CLASSE de defeito pelos dois ângulos...
  ...
```

Se alguma das três pastas não existir ou vier vazia, diga isso explicitamente —
não omita a seção.

### O que NÃO fazer

- **Não abrir e resumir o conteúdo de cada skill.** Isso é o `/irmaos` ou uma
  leitura pontual, não este comando — ele é para orientação rápida, uma
  linha por item.
- **Não incluir os 6 agentes genéricos do repo** (`react-specialist`,
  `typescript-specialist` etc.) misturados com sem aviso — se quiser listá-los,
  separe-os com a nota de que são genéricos, não específicos deste projeto.
