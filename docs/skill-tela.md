# `/tela` — conferir no simulador sem cair nas armadilhas já medidas

## Por que existe

Nos últimos 60 commits, a origem dos defeitos foi: **14 de auditoria, 13 de
relato ou print do dono**. Ou seja — metade do que se corrige aqui chega pelo
OLHO, não pelo CI. E o repo tem 7.9k testes verdes.

A regra do dono é fixa: **mudança que precise de verificação VISUAL termina no
simulador iOS**, e é o agente que testa — não o dono virando QA.

O caminho tem umas dez armadilhas, todas já medidas. Esta skill as carrega, para
a conferência custar minutos e não uma sessão.

## Antes de começar — três checagens de 10 segundos

```bash
npm run sim:status                      # para ONDE o simulador aponta
xcrun simctl list devices booted        # tem device ligado?
gh api repos/irontracks/irontracks/deployments --jq '.[0].sha[0:9]'   # produção tem meu código?
```

⚠️ **Mudança web só aparece se estiver no ar.** O simulador aponta para
`https://irontracks.com.br` por padrão. Conferir antes do deploy = conferir o
código antigo e concluir errado.

## As armadilhas, em ordem de quanto já custaram

### 1. Coordenadas são PONTOS, não pixels — divida por ~2,09
O toque usa **440×956 pontos**; o screenshot sai em ~920×1963 px. Enviar a
coordenada lida na imagem é o erro natural e **silencioso**: `x > 440` está fora
da tela e a ferramenta ainda responde "Tapped at (460, 706)" com sucesso.

> Diagnóstico em 5 s: toque aceito e tela idêntica ⇒ **confira se `x < 440`**
> antes de suspeitar de qualquer outra coisa. Isso já consumiu uma investigação
> inteira ("o WebView parou de aceitar toque") com esta regra já escrita.

### 2. Instalar build nova DESLOGA o simulador
Container novo = sem cookie. E **o agente não digita senha** — só o dono entra.
Aconteceu em 09/09/2026: buildei para conferir e o próprio ato de instalar matou
o acesso. **Se a conferência é de código WEB, não builde**: o `.app` já instalado
serve. Build só para código NATIVO (Swift/plugin).

### 3. Duas contas — confundi-las já produziu um bug inexistente
Simulador = `djmkbrasil` (TESTE). iPhone do dono = `djmkapple` (OFICIAL).
Ler a tela de uma contra o banco da outra **inverte a conclusão** — custou uma
investigação de RLS atrás de fantasma. Identificação rápida: a de teste tem o
chip **ARQUIVADOS (6)**.

### 4. Escrever na conta de teste é liberado — inclusive finalizar treino
A oficial é intocável, sempre. Limpe depois: `npm run sim:close`.

### 5. Animação NÃO se prova por screenshot
O screenshot leva 2–3 s; qualquer coisa mais curta já terminou. Prove no
navegador, amostrando o computed style:
```js
const escala = () => new DOMMatrixReadOnly(getComputedStyle(el).transform).a
```
Devolve número, não impressão.

### 6. O cronômetro CONGELA quando a janela perde o foco
25 s em 8 min reais. Invariante que dependa de TEMPO PASSAR (timeout, teto,
expiração) é impraticável no simulador — prove por teste + mutação e **diga que
a prova foi de código, não de tela**.

### 7. O teclado corrige para o INGLÊS
"peixe grelhado com batata doce" virou "Price grew Haro com Batista doce".
Digitar português livre no simulador não prova nada — injete o dado por SQL na
conta de teste, ou chame a API direto.

### 8. `screenshot` pode falhar com `captureFailed` / `clientDisposed`
Caminho alternativo que sempre funciona:
```bash
xcrun simctl io <UDID> screenshot /tmp/s.png && sips -Z 900 /tmp/s.png --out /tmp/s2.png
```
Depois leia `/tmp/s2.png`. (Reduzir a imagem corta o custo — screenshot é o input
mais caro que existe.)

### 9. O hook `sim:close` encerra o app entre turnos
Numa auditoria isso PARECE crash: o app some sozinho. **Relance a cada turno.**

### 10. Live Activity não renderiza em build sem assinatura
`CODE_SIGNING_ALLOWED=NO` não registra as `ActivityConfiguration`. Não é
regressão — não tire conclusão sobre a Ilha Dinâmica pelo simulador.

## Economia — capture no ponto de DECISÃO

Screenshot é o input mais caro. Capture quando o estado que importa muda, não a
cada toque; e **pare quando o invariante estiver demonstrado** — se o
comportamento apareceu 2×, a 3ª não prova mais nada.

## ⛔ NUNCA mandar print ao dono

Regra dele, 15/08/2026, repetida duas vezes. Screenshot é ferramenta do agente;
o resultado se relata em **TEXTO** — o número do banco, o estado do elemento, o
que funcionou.

## Fechar sempre

```bash
npm run sim:close      # encerra o treino e limpa a sessão da conta de teste
npm run sim:prod       # se tiver apontado para local
```

E confirme pelo EFEITO, não pelo comando: consulte o banco.
