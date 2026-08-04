# Mapa dos dados do usuário — quem lê o quê (e o que está duplicado)

Levantado em 04/08/2026 para decidir o desenho do `userSnapshot`. Serve para não
repagar a varredura: antes de criar mais um leitor de perfil/meta, comece por aqui.

## Onde cada coisa mora

| Fato | Fonte de verdade | Observação |
|---|---|---|
| Antropometria declarada (peso, altura, idade, sexo) | `user_settings.preferences` | Chaves: `bodyWeightKg`, `heightCm`, `age`, `biologicalSex` |
| Antropometria **medida** | `assessments` | Não confundir: no prompt de IA a declarada é rotulada como "declarado" |
| Objetivo de **treino** | `user_settings.preferences.fitnessGoal` | Enum |
| Fase da **dieta** | `user_settings.preferences.nutritionPhase` | Intenção nutricional — eixo independente do objetivo de treino |
| Meta calórica/macros | `nutrition_goals`, com fallback derivado do TDEE | 3 de 57 contas tinham linha salva (ago/2026) |
| Sessões de treino | `workouts.notes` (JSON em TEXT) | ⚠️ nunca selecionar num leitor agregado |
| Check-in / prontidão | tabela de check-ins + `utils/checkin/metrics.ts` | |
| Status VIP | derivado por `getVipPlanLimits` | Já é leitor único |

## O que já era fonte única (não duplicar de novo)

- `lib/nutrition/phase.ts` — `computeGoalsFromPrefs`, `resolveNutritionPhase`,
  `extractProfileStats`, `mapFitnessGoal`/`mapGender`/`mapActivityLevel`.
- `utils/vip/limits.ts` — `getVipPlanLimits`.
- `utils/autoload/` — motor de carga, com fiação própria já testada.

## Duplicação encontrada

1. **Antropometria extraída em dois lugares** — `extractProfileStats`
   (`lib/nutrition/phase.ts`) e `profileSection` (`utils/ai/userContext.ts`) liam as
   mesmas 5 chaves, cada um por conta. **Resolvido** pelo `userSnapshot`.
2. **Fiação da meta refeita 3×** — a sequência "busca prefs → busca `nutrition_goals`
   → decide fallback" está em `dashboard/nutrition/page.tsx`,
   `NutritionOverlay.tsx` e `userContext.ts`. **Resolvido só no terceiro**; os dois
   primeiros são o PR 2.
3. **23 arquivos leem `user_settings` direto**; `bodyWeightKg` aparece em 25. Cada um
   com o seu próprio fallback quando o campo falta.
4. **Prontidão derivada em ≥3 caminhos** — `utils/checkin/metrics.ts`,
   `utils/autoload/suggestWeight.ts` e `api/ai/post-workout-insights`.

## O desenho: leitor, não depósito

`src/lib/user/snapshot.ts` lê as fontes que já existem e devolve os fatos resolvidos.
As quatro regras que o mantêm barato estão documentadas no cabeçalho do módulo —
resumo: modular por setor, derivado (nunca persistido), **sem `workouts.notes`**, e
resiliente por setor.

**Por que não uma tabela `user_snapshot`:** seria uma segunda fonte de verdade,
precisaria de sincronização e um dia divergiria — o mesmo padrão que já custou caro
aqui (os 14 renderers de série, as duas superfícies de nutrição). O que é derivado na
leitura não fica velho.

## Plano

- **PR 1 — `lib/user/snapshot.ts` + `userContext` consumindo.** ✅ Feito.
  Mata a duplicação nº 1. Setores: `profile`, `nutrition`.
- **PR 2 — `useUserSnapshot` (client).** As superfícies de nutrição param de refazer a
  fiação (nº 2). Entrega o mesmo objeto que elas já montam, então dá para provar
  equivalência antes de trocar. É onde entra o setor `readiness` — deixado de fora do
  PR 1 de propósito, porque sem consumidor seria código morto.
- **PR 3 — ratchet.** Source-guard com allowlist dos arquivos que ainda leem
  `user_settings` direto, e a lista só encolhe (mesmo mecanismo do guard de payload
  do histórico).

Fora de escopo por decisão: `workouts.notes`, autoload e VIP.
