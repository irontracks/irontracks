## Diagnóstico (o que deveria acontecer)
- Ao clicar em **Novo Treino** no dashboard, deveria abrir o **Wizard Automático** (modal) e só abrir o editor quando você clicar em **Abrir no editor**.
- Pela sua captura, está indo direto para o editor (e o console mostra erro), então o Wizard está **não abrindo** ou está **sendo escondido/abortado**.

## Hipóteses mais prováveis
1) **Você está acionando um caminho “manual”** (ex.: scanner/atalho) que abre direto o editor.
2) O Wizard está montando, mas **ficou atrás** de algum overlay/z-index.
3) Existe um **erro em runtime** (o “1 error” no rodapé) que impede o modal de renderizar quando `createWizardOpen` muda.

## Plano de Correção (sem depender de suposições)
1) **Reproduzir o clique** no botão Novo Treino e checar qual handler está disparando.
   - Adicionar um indicador simples (ex.: abrir o Wizard com prioridade, ou um fallback visual) para confirmar que o estado `createWizardOpen` está sendo setado.
2) **Garantir que o Wizard sempre esteja visível**:
   - Ajustar `z-index` do modal para acima de qualquer overlay.
   - Garantir que ele não dependa do `view` atual (dashboard/edit).
3) **Criar um segundo ponto de entrada** (backup) no menu **Ferramentas**:
   - “Criar Treino Automático” (abre o Wizard).
   - Assim mesmo que o botão Novo Treino esteja caindo em outro fluxo, você consegue acessar e validar.
4) **Investigar e corrigir o erro do console**:
   - Identificar o stack/causa (provável exceção em render/hook) e ajustar o componente/estado.
5) **Validar e registrar no checklist**:
   - Teste manual em localhost: Novo Treino → Wizard abre; Gerar → Abrir no editor.
   - Atualizar CHECKLIST_FUNCIONAL.md se algum passo mudar.

Assim que você confirmar, eu aplico a correção e deixo o Wizard abrindo com 100% de confiabilidade (Novo Treino + Ferramentas).