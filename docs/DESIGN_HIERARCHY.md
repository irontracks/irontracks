# Regra da hierarquia

> **Um fato, um lugar. O elemento com mais peso visual é o que o usuário
> precisa para decidir agora — não o que é mais fácil de calcular.**

Guard que faz valer a parte mecânica: `src/__tests__/designHierarchyRatchet.test.ts`.
O resto é code review, com a pergunta de três linhas lá embaixo.

---

## Por que esta regra existe

Na auditoria de design de agosto/2026, o **mesmo defeito** apareceu quatro vezes,
em quatro cards diferentes da mesma aba, escritos em momentos diferentes:

| Onde | O que acontecia |
|---|---|
| Barras de macro | `111 / 208 g` + barra + `53%` + `faltam 97 g` — quatro codificações do mesmo fato na mesma linha |
| Heatmap Treino × Nutrição | legenda repetindo o que a grade já desenhava |
| Card de lançamento | `655 kcal` no cabeçalho **e** `Total: 655 kcal` no rodapé da mesma caixa |
| Hero de calorias | selo dourado `85%` ao lado do anel que desenha 85% |

Nos quatro, **o duplicado tinha mais peso visual que o original**. E em três dos
quatro, o número que o usuário realmente procura — quanto falta — estava no
menor tipo da tela.

Ninguém foi descuidado. A regra simplesmente não estava escrita, então cada card
resolveu a hierarquia por conta própria, e quatro pessoas chegaram a quatro
respostas diferentes para a mesma pergunta.

---

## As três partes da regra

### 1. Um fato, um lugar

Se a informação já está na tela, ela não entra de novo na mesma caixa.

O caso mais comum é o **gráfico e o número dizendo a mesma coisa**: a barra já
desenha 53%, o anel já desenha 85%. O texto ao lado tem que dizer **outra**
coisa, ou não existir.

**Esta parte é automatizada.** O guard reprova um componente que imprima como
texto o mesmo percentual que ele próprio desenha.

### 2. Um destaque por bloco

Cada linha, card ou bloco tem **um** elemento em peso alto. Se três coisas estão
em `font-black`, nenhuma está em destaque — o olho não tem para onde ir primeiro.

Antes → depois, nas barras de macro:

```
PROTEÍNA          111 / 208 g          ← rótulo e razão, discretos
[████████░░░░░░░░░░░░░]                ← a barra compara
                      faltam 97 g      ← ISTO em peso alto
```

### 3. O destaque é o número acionável

Entre "quanto já fiz" e "quanto falta", **o destaque vai para o que muda a
decisão do usuário agora**:

- macros → `faltam 97 g`, não `111 g consumidos`
- calorias → `2000 kcal restantes`, não `0 kcal consumidas`
- treino → `faltam 2 séries`, não `3 séries feitas`

O acumulado continua na tela, em cinza, como contexto. O anel/barra guarda a
proporção. O que ganha corpo é a pergunta que o usuário está se fazendo no meio
do dia, com o celular na mão e o descanso correndo.

---

## A pergunta de code review

Antes de aprovar um card com dados, responda três coisas. Se travar em qualquer
uma, a hierarquia está errada:

1. **Qual é o único elemento em peso alto aqui?** (se a resposta tem "e", volte)
2. **Esse elemento é o que o usuário precisa para decidir agora?**
3. **Algum dado aparece duas vezes nesta caixa?** (o gráfico conta como uma)

---

## O que o guard NÃO pega — e por que

O guard trava **só** a repetição gráfico↔texto de percentual. As partes 2 e 3
são julgamento humano; não existe regex para "este é o número acionável".

Também é deliberado que ele **não** acuse "o mesmo valor renderizado duas vezes":
foi medido, e é inútil como sinal — dentro de um `.map()` a mesma expressão
aparece legitimamente em itens diferentes, e um `Math.round(x)` no texto mais
outro no `aria-valuetext` é o comportamento **correto**. As duas primeiras
versões do detector acusavam `MacroBar` e `NutritionEntryCard`, que estão certos.

Guard que grita no lugar errado é afrouxado na primeira semana, e aí não guarda
mais nada. Melhor um dente afiado que morde de verdade do que uma dentadura
inteira de plástico.

---

## Se você precisar de uma exceção

`EXCECOES` no topo do arquivo de guard, com **motivo escrito**. A lista só
encolhe: entrada que aponta para componente inexistente reprova, e entrada sem
motivo reprova.

A pergunta a responder no motivo é uma só: **o número diz algo que o desenho não
diz?** Se a resposta for "fica mais claro assim", não é exceção — é redundância.
