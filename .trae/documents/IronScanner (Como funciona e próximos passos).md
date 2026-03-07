A ferramenta IronScanner já existe no app e hoje serve para **importar um treino a partir de imagem/PDF** (UI no editor) usando Gemini para extrair um JSON estruturado. Ex.: API [/api/iron-scanner](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/app/api/iron-scanner/route.ts) + ação [iron-scanner-actions.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/actions/iron-scanner-actions.ts) + integração no [ExerciseEditor.js](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/ExerciseEditor.js).

Para levar essa ideia para a sessão de Avaliação, faz muito sentido: hoje o fluxo de import em Avaliação existe, mas é **apenas JSON** (via [AssessmentButton.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/assessment/AssessmentButton.tsx)) e a tela de criação já suporta “pré-preencher” via `sessionStorage` (merge em [AssessmentForm.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/assessment/AssessmentForm.tsx)).

## Objetivo
- Adicionar um botão **Importar por Foto/PDF** na sessão de Avaliação que extraia campos de avaliação e preencha o formulário automaticamente.
- Salvar as configurações/resultados no Supabase como já ocorre no fluxo normal (o formulário salva via [useAssessment.ts](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/hooks/useAssessment.ts)).

## Implementação (sem mudanças de UX além do necessário)
1. **Criar um “AssessmentScanner” no backend**
   - Nova action server-side (similar ao `processWorkoutImage`) para receber `multipart/form-data` com `file` e pedir ao Gemini um JSON no formato do `AssessmentFormData`.
   - Normalizar a saída para ficar 100% compatível com o merge atual do formulário (campos como strings; `gender` em `M|F`; `assessment_date` em `YYYY-MM-DD`; altura em cm).

2. **Criar endpoint dedicado**
   - Nova rota `POST /api/assessment-scanner` (espelhando `/api/iron-scanner`) para encapsular validações de content-type/erro e retornar `{ ok, formData }`.

3. **Integrar no UI de Avaliação (ponto de entrada já existente)**
   - Em [AssessmentButton.tsx](file:///Users/macmini/Documents/Projetos%20programa%C3%A7%C3%A3o%20(trae)/App%20IronTracks/src/components/assessment/AssessmentButton.tsx), adicionar um segundo import:
     - `accept="image/*,application/pdf"` e `multiple` (opcional).
     - Chamar `/api/assessment-scanner`.
     - Persistir resultado em `sessionStorage` na mesma chave `assessment_import_${studentId}` (o `AssessmentForm` já consome isso).

4. **Regra para múltiplos arquivos**
   - Definir merge determinístico: “primeiro valor válido vence” (ou “último vence”), por campo.
   - Isso permite anexar frente/verso da ficha e aproveitar o máximo.

5. **Tratamento de PDF**
   - Versão 1: enviar PDF para o modelo como `inlineData` se o modelo aceitar.
   - Se houver limitações, evoluir para: converter páginas para imagens antes (versão 2).

## Validação
- Testar import com:
  - 1 imagem nítida (ficha)
  - 2 imagens (frente/verso)
  - 1 PDF
- Verificar se o formulário abre preenchido e se o `createAssessment()` salva corretamente (campos numéricos convertidos via `formDataToAssessment`).

## Entregáveis
- Novo endpoint `/api/assessment-scanner` + action de extração.
- Botão “Importar por Foto/PDF” em Avaliação (aproveitando o fluxo `sessionStorage` existente).
- Normalização robusta para preencher corretamente os campos principais.

Se você aprovar esse plano, eu implemento e valido ponta-a-ponta.