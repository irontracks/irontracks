## Sim — é no modal de edição
- O print é do **modal do ExerciseEditor** (edição do exercício dentro do treino), com o método “Rest-P”.

## O que está errado no print (no contexto do modal)
1) **Campo “SETS” no topo está em branco**, mas o modal renderiza **Série 1/2/3**.
- Isso é inconsistente para o usuário e indica que o header (`exercise.sets`) não está sincronizado com `setDetails`.

2) **Método “Rest-P” está selecionado, porém só a Série 3 mostra os campos de Rest-Pause**.
- Série 1 e 2 ficam no layout “normal” (Carga/Reps/RPE).
- Série 3 mostra “Reps iniciais / Pausa (s) / Mini-sets”.
- Isso sugere que o Rest-Pause depende de `advanced_config` e ele está preenchido só em uma série.

3) **Semântica confusa no modal**
- Se o método do exercício é Rest-Pause, o modal deveria deixar claro se:
  - Rest-Pause é uma configuração aplicada ao exercício inteiro (todas as séries), ou
  - Rest-Pause é por série (aí o método não deveria estar no header do exercício, e sim por série).

4) **“Ver vídeo” está funcional, mas parece um link “perdido”**
- No modal ele compete com muitos inputs; é fácil não notar.

## Plano de correção (apenas no modal de edição)
1) **Sincronizar “SETS” do header com as séries renderizadas**
- Se existir `setDetails.length`, mostrar esse número no header (e não deixar vazio).

2) **Padronizar Rest-Pause no modal**
- Quando o usuário selecionar “Rest-Pause” no header:
  - Inicializar/propagar automaticamente o `advanced_config` de Rest-Pause para todas as séries existentes, para todas exibirem os mesmos campos.
  - (Ou alternativa mais simples) reduzir para 1 série e manter Rest-Pause como uma única série configurável.

3) **Deixar “Ver vídeo” mais claro sem poluir**
- Manter o link, mas transformar em micro-ação consistente com o resto do modal (ex.: botão inline compacto ao lado do label, ou com ícone e opacidade igual aos outros actions).

Se você aprovar, eu implemento primeiro a abordagem de **propagar o Rest-Pause para todas as séries** (menos disruptiva, não muda a quantidade de séries do usuário), e junto arrumo o header “SETS” para nunca ficar vazio.