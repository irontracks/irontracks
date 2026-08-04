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
   → decide fallback" estava em `dashboard/nutrition/page.tsx`,
   `NutritionOverlay.tsx` e `userContext.ts`. **Resolvido em dois** (contexto de IA no
   PR 1, página no PR 2). O overlay segue pendente — ver abaixo.
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
- **PR 2 — página de nutrição.** ✅ Feito. Ela é server component: consome
  `buildUserSnapshot` direto, sem hook. O snapshot ganhou nesse PR o paralelismo
  interno (prefs e meta salva saem juntas), `savedGoalsError` e `restDayAdjustEnabled`.

### O que a investigação do PR 2 mudou no plano

O `useUserSnapshot` (hook client) **não foi feito**, e o motivo vale registro:

- O `NutritionOverlay` dispara **6 queries num único `Promise.all`**. Trocar duas
  delas por uma chamada ao snapshot só não piora a latência porque o snapshot passou
  a paralelizar internamente — mas a chamada ainda precisa entrar no mesmo
  `Promise.all`, e o overlay tem duas camadas de cache offline em volta.
- Ele também lê `preferences` para o **cálculo de kcal do treino** (peso/sexo) e para
  o **ajuste de dia de descanso**. Ambos agora existem no snapshot, então a migração
  é viável — mas é uma mudança de fiação numa tela com cache offline, e merece PR
  próprio em vez de carona.
- **A lição do PR 2:** as superfícies têm POLÍTICA própria (piso de exibição
  `DEFAULT_GOALS`, aviso de schema ausente, cache). O snapshot entrega FATOS; quem
  exibe decide o que fazer com eles. Foi por isso que `savedGoalsError` nasceu — sem
  ele, migrar a página teria apagado, em silêncio, um aviso que já existia na tela.

- **PR 3 — overlay + ratchet.** Migrar o `NutritionOverlay` (fiação nº 2, último
  pendente) e travar com source-guard de allowlist os arquivos que ainda leem
  `user_settings` direto, com a lista só encolhendo.
- **Depois:** o setor `readiness` (duplicação nº 4). Continua sem consumidor que não
  seja o autoload, que está fora de escopo por decisão — criar o setor antes disso
  seria código morto.
Fora de escopo por decisão: `workouts.notes`, autoload e VIP.
