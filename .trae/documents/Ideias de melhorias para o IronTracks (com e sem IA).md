## Antes de executar (segurança / restore)
1) **Snapshot local (restauração rápida)**
- Criar um commit com todas as mudanças atuais + tag anotada com data/hora.
- Resultado: você consegue voltar em 1 comando (`git checkout restore-point-AAAA-MM-DD_HHmm`).

2) **Backup no GitHub (restauração remota)**
- Dar push do branch atual + tags para o origin.
- Resultado: restore point fica guardado no GitHub e você consegue restaurar de qualquer máquina.

## Depois disso (execução da melhoria)
### Objetivo
- Adicionar “Modo do aluno” com **progressive disclosure** sem remover o diferencial:
  - Social/Comunidade/Marketplace continuam existindo, mas ficam **opcionais**.

### Implementação (MVP seguro)
1) Persistir preferências em `user_settings.preferences`:
- `uiMode` e `modules: { social, community, marketplace }`.
2) UI em Configurações:
- Seleção: Iniciante / Intermediário / Avançado.
- No Avançado: modal de toggles (3 módulos na v1).
- Botão “Restaurar padrão”.
3) Gating no menu/entrypoints do dashboard:
- Esconder itens do menu quando módulo desabilitado.
- Se usuário abrir rota diretamente, mostrar fallback amigável (“módulo desativado nas configurações”).

## Estratégia anti-quebra
- Feature flag por usuário (preferências) + rollout por ondas (admin → 10% → 50% → 100%).
- Release com **1 ferramenta grande** (Modo do aluno) + só pequenos ajustes.

Se você aprovar, eu executo primeiro os 2 restore points (local + GitHub) e aí começo o Modo do Aluno.