/**
 * Testes `.test.ts` que precisam de DOM.
 *
 * A suíte roda em DOIS projetos (ver vitest.config.ts): `.test.tsx` vai para jsdom
 * (componente = DOM, por definição) e `.test.ts` vai para `node`, que é ~2,5× mais
 * rápido por não montar um DOM inteiro por arquivo. Estes doze são a exceção:
 * arquivos `.ts` que mexem em `document`/`window`/testing-library e portanto
 * precisam de jsdom mesmo sem serem de componente.
 *
 * Ao adicionar um `.test.ts` que toque no DOM, inclua o caminho aqui — o guard em
 * `src/__tests__/vitestDomProjectList.test.ts` falha com a instrução exata se
 * esquecer, em vez de deixar o teste quebrar com um confuso "document is not
 * defined".
 */
export const DOM_TEST_FILES = [
  'src/lib/workout/__tests__/restoreSessionGate.test.ts',
  // A marca de "já treinou hoje" é persistida em `localStorage` — é ela que
  // impede o card de treino piscar a cada abertura do app.
  'src/lib/workout/__tests__/trainedToday.test.ts',
  'src/app/(app)/community/__tests__/communityAlertsToast.test.ts',
  'src/components/update/__tests__/swAutoUpdate.test.ts',
  'src/components/workout/__tests__/deloadGuards.test.ts',
  'src/components/workout/__tests__/postCheckinZIndex.test.ts',
  'src/components/workout/__tests__/reportCacheUserScope.test.ts',
  'src/components/workout/hooks/__tests__/methodSaverWeightSource.test.ts',
  'src/hooks/__tests__/liveActivityRegressionGuards.test.ts',
  'src/components/stories/__tests__/brandBoxAndPinch.test.ts',
  'src/hooks/__tests__/nativeTimerActionRace.test.ts',
  'src/hooks/__tests__/useAppStoreUpdateCheck.test.ts',
  'src/hooks/__tests__/useBodyPhotoHistory.test.ts',
  'src/hooks/__tests__/usePeriodizedWorkouts.test.ts',
  'src/lib/nutrition/__tests__/nutritionChatUiGates.test.ts',
  'src/utils/app/__tests__/hardRefresh.test.ts',
] as const
