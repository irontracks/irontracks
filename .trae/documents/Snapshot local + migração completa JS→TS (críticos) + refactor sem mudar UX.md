## Objetivo
Fechar 100% do que o arquivo de análise lista como pendência técnica em aberto (especialmente: migração JS→TS e refatoração dos componentes críticos), sem alterar o comportamento do app.

## 1) Snapshot local (ponto de restauração)
- Gerar timestamp `YYYY-MM-DD_HHmm`.
- Criar pasta `snapshots/`.
- Gerar:
  - `snapshots/irontracks-<TS>.bundle` (git bundle para restaurar offline)
  - `snapshots/irontracks-<TS>.patch` (patch do HEAD)

## 2) Migração completa para TypeScript dos componentes críticos
### 2.1 ActiveWorkout
- Converter `src/components/ActiveWorkout.js` → `src/components/ActiveWorkout.tsx`.
- Tipar props (começando por `any` onde necessário) e ir substituindo por tipos reais conforme o TS acusar problemas.
- Garantir que o export default e todos os imports no app continuem funcionando (sem mudar UI/fluxo).

### 2.2 AdminPanelV2
- Converter `src/components/AdminPanelV2.js` → `src/components/AdminPanelV2.tsx`.
- Mesma estratégia: tipagem progressiva, mantendo comportamento.

## 3) Refatoração estrutural (sem mudar UX)
- Extrair lógica de dados para hooks em `src/hooks/`:
  - `useAdminStudents`, `useTeacherInbox`, `useCheckinAlerts` (nomes ajustados ao que existir no arquivo)
- Extrair utilitários de negócio para `src/utils/` quando hoje estiverem dentro do componente.
- Quebrar UI em subcomponentes internos (ex.: `AdminTabs`, `StudentList`, `CheckinsPanel`, etc.) mantendo o mesmo DOM/estilos sempre que possível.
- Regra: qualquer modal/overlay deve manter o mesmo layout e só acrescentar o que for pedido.

## 4) Verificação e “trava” anti-regressão
- Rodar `npm run build`.
- Rodar `npm run test:smoke`.
- Se aparecerem erros de tipo, ajustar até ficar verde.

## Resultado esperado
- `ActiveWorkout` e `AdminPanelV2` 100% em TSX.
- Componentes críticos mais “quebrados” e com responsabilidades separadas.
- Build + smoke tests verdes e sem mudança perceptível de UI/fluxo.