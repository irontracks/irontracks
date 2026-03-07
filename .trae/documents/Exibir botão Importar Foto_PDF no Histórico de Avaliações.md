Você ainda não está vendo o botão porque essa tela do print não usa o componente [AssessmentButton.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/assessment/AssessmentButton.tsx). Ela usa o cabeçalho do [AssessmentHistory.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/assessment/AssessmentHistory.tsx#L803-L837), que hoje só tem **“+ Nova Avaliação”** e **“Ver Histórico”**.

## Correção
1. **Adicionar o botão no lugar certo (tela do print)**
   - Em [AssessmentHistory.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/assessment/AssessmentHistory.tsx#L814-L828), incluir um 3º botão ao lado dos dois existentes: **“Importar Foto/PDF”**.
   - Incluir um `<input type="file" accept="image/*,application/pdf" multiple hidden>` e handler para chamar `POST /api/assessment-scanner`.

2. **Reusar a mesma lógica de import (sem duplicar comportamento)**
   - Aplicar a mesma regra de merge determinístico (primeiro valor válido por campo) e salvar no `sessionStorage` em `assessment_import_${studentId}`, redirecionando para `/assessments/new/${studentId}`.

3. **Cobrir o caso “sem avaliações”**
   - Quando `assessments.length === 0`, hoje a tela mostra apenas mensagem. Vou adicionar ali também um CTA “Importar Foto/PDF” e “Nova Avaliação”, para não sumir o recurso.

4. **Validação**
   - Conferir build/lint.
   - Testar fluxo visual: abrir Avaliações → clicar “Importar Foto/PDF” → selecionar imagem/PDF → redirecionar para `/assessments/new/[studentId]` com campos preenchidos.

## Entrega
- O botão ficará exatamente no cabeçalho da página de Avaliações (a mesma região do print), ao lado de “+ Nova Avaliação” e “Ver Histórico”, e também no estado vazio.

Se você confirmar, eu aplico essas mudanças e no final te digo exatamente o arquivo/linhas onde o botão ficou.