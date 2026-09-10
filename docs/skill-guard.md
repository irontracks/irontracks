# `/guard` — o ritual que transforma "escrevi um teste" em "provei que ele pega"

## Por que existe

Medido em 09/09/2026: o `CLAUDE.md` diz **"guard de classe" 12 vezes** e
**"provado por mutação" apenas 4**. E dos 738 arquivos de teste, **406 (55%) leem
código como texto** (source-guard) contra **55 (7%) que montam componente**.

Source-guard é frágil por construção — ele mira na FORMA, e a forma muda. Por
isso este repo tem uma lista com **oito jeitos** de um guard passar verde com o
bug vivo, e todos os oito já aconteceram aqui.

O ferramental existe (`npm run mutar`). O que falta é o ritual ser obrigatório.

## Como usar

```
/guard <o invariante que você quebrou e quer travar>
```

## Protocolo

### Fase 1 — nomear o INVARIANTE, não o caso
Escreva numa frase o que nunca mais pode acontecer. Se a frase citar um arquivo
específico, você está travando a **instância**; suba um nível até a **classe**.

> ruim: "o CardioFields mostra blocos"
> bom: "toda superfície que edita cardio oferece blocos, pela mesma fonte"

⚠️ **Guard da instância com cara de classe** é o erro que mais dói aqui: em
15/08/2026 um guard varreu "os arquivos que eu já conhecia" e passou verde com o
bug vivo no rodapé principal. **A pergunta ao escrever não é "pega o meu caso?" —
é "onde ele NÃO olha?".**

### Fase 2 — escolher o TIPO certo

| tipo | quando | modelo no repo |
|---|---|---|
| função pura | matemática/lógica isolada | `volumeVariation.test.ts` |
| mock de Supabase encadeável | resolução/metering/handlers | `utils/__tests__/authRole.test.ts` |
| **render** | o defeito é "o usuário não alcança" | `modalCardioTemBlocos.test.tsx` |
| source-guard | invariante de query/migration difícil de exercitar | `appSubscriptionExpiry.test.ts` |

⚠️ **Prefira comportamento a forma.** Um source-guard que exige `<X />` no arquivo
passa verde com `{false && <X />}` — medido nesta sessão. O que separa "está no
arquivo" de "o usuário alcança" é montar a tela.

### Fase 3 — PROVAR (não é opcional)

```bash
npm run mutar -- <arquivo> "<trecho original>" "<trecho com o bug reposto>" -- npx vitest run <teste>
```

Ele aplica, roda, **restaura do conteúdo em memória** e exige vermelho. Use
sempre isto, nunca `git checkout` à mão — o checkout já apagou trabalho não
commitado **cinco vezes** neste repo, incluindo três num único dia.

- ✅ vermelho com a mutação → guard válido.
- ❌ verde com a mutação → **o TESTE está errado.** Corrija o teste, nunca
  afrouxe o código.
- ⚠️ Antes de afrouxar: a mutação representa um defeito REAL? Trocar `autoCorrect`
  por `autocorrect` não derruba nada porque o React normaliza os dois — mutação
  inócua não prova guard fraco.

### Fase 4 — passar pelos OITO jeitos falsos

Confira um a um (a lista completa está no `CLAUDE.md`):

1. **tautológico** — assere a constante, não o literal
2. **acusa o próprio comentário** — reduza ao código executável antes de casar
3. **cobre as pontas, não a fiação** — algoritmo e coletor certos, ninguém ligando
4. **proíbe o consumo CORRETO** — mire em quem LÊ a fonte, não em quem usa o dado
5. **o teste não existe** — rode `vitest -t "<nome>"` e confirme `1 passed`, não `0 passed`
6. **ancorado no que a mudança APAGA** — ancore no que vai FICAR (o `aria-label`, a fonte)
7. **casa a referência, não a seção** — em documento, mire no TÍTULO e assere dentro do BLOCO
8. **largo demais** — guard que acusa uso correto é afrouxado na 1ª semana; restrinja o ESCOPO

### Fase 5 — fechar
```bash
npx tsc --noEmit
node --import tsx ./node_modules/eslint/bin/eslint.js --config eslint.config.mjs <arquivos> --max-warnings 0
npm run test:unit
```

E **documente o porquê junto do código**: qual sintoma, qual causa. Guard sem
motivo escrito é afrouxado pelo próximo que o vir vermelho.

## O que reportar

Nunca escreva "provado por mutação" sem ter visto o vermelho. Diga **qual**
mutação foi aplicada e o que aconteceu — é o que separa a afirmação da prova.
