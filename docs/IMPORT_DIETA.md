# Importar dieta — JSON (grátis), foto e PDF (VIP)

Extraído do `CLAUDE.md` em 31/08/2026: a seção passou de 100 linhas, e o
`CLAUDE.md` é lido inteiro em toda sessão. Abra este arquivo **antes de mexer no
import de dieta, no parser de JSON ou na base de alimentos**.

**Importar dieta por JSON — a porta GRÁTIS (29/08/2026).** A nutrição não tinha
nenhuma forma de trazer uma dieta pronta: `diet-generate` GERA, `export-pdf`
EXPORTA, e `CustomFoodScanner`/`BarcodeScanner` leem **um produto**, não um
cardápio. Quem chegava com o PDF do nutricionista digitava tudo.

O caminho é `lib/nutrition/importDietJson.ts` → `POST /api/nutrition/diet-plan`
(a rota que já salvava o plano próprio: valida com Zod, arquiva o anterior,
grava `created_by = user_id`). **Nenhuma rota de IA no meio — é por isso que é
grátis**, e o guard reprova se `/api/ai/` aparecer no modal. Decisão do dono:
"importar com ferramenta que não gasta nada como json pode ser free". Ler o PDF
pelo NOSSO Gemini seria outra conversa, com gate.

**A tolerância é o produto.** O JSON vem de um modelo que ninguém controla, e um
parser que só aceitasse as chaves exatas reprovaria a maioria dos casos reais:
aceita `refeicoes`/`meals`, `carboidratos`/`carbs`, `Proteína` com acento e
maiúscula, `"120g"`, `"1.200"`, `"35,5"`, item que é só uma string, array de
refeições solto, e nome de dia (`"terça"`, `"seg"`) virando índice.

⚠️ **`"1.200"` é AMBÍGUO** — mil e duzentos em pt-BR, um vírgula dois em inglês.
A régua é a contagem de casas: exatamente três dígitos depois do ponto é
milhar. Escolhida pelo erro na outra direção — ler "1.200 kcal" como 1,2 apaga
uma refeição, enquanto o contrário dá um número que o usuário vê e corrige na
prévia.

Os tetos (10 refeições, 20 itens, 7 dias, 5.000 g) são os do `BodySchema` da
rota, espelhados no parser **de propósito**: estourar lá devolve 400 "Invalid
input", mensagem que não ensina nada a quem colou o JSON. Aqui corta e avisa.

**O prompt de conversão é parte da feature, não enfeite.** Quem abre o modal tem
o PDF, não o JSON — sem o texto pronto para levar ao ChatGPT, a feature só serve
a quem já sabe o formato.

⚠️ **O guard `overlayPrecisaDePortal` pegou este modal** antes do aparelho: a
Nutrição é um overlay `fixed z-[25]`, e quem nasce lá dentro herda o stacking
context (o `z-[1600]` vale 25) e o containing block (o `fixed` rola junto e o
topo sai da tela). `FullscreenPortal` é obrigatório aqui.

**Dieta por FOTO/PDF (29/08/2026) — o caminho pago, ao lado do grátis.**
`POST /api/ai/diet-photo-extract` recebe a foto ou o PDF do nutricionista
(multipart, 15 MB, sem bucket — o padrão do `scan-nutrition-label`; o import de
TREINO usa bucket porque guarda o arquivo para reprocessar, aqui ele é lido e
descartado) e devolve **o mesmo JSON que o import por texto já lê**.

⚠️ **A rota NÃO normaliza nada.** Devolve o JSON cru, e quem normaliza é
`importarDietaDeJson` no cliente — assim a tolerância, os tetos e a resolução de
macros valem de graça, e não nasce um segundo normalizador para divergir do
primeiro (o padrão que este repo já pagou caro em 14 renderers, 5 listas de
status e 3 cálculos de semana).

**O gate mora AQUI e só aqui** (`utils/vip/dietImportAccess.ts`): VIP, com a
primeira por nossa conta — mesma tese da ficha de treino. **O import por JSON
continua livre e sem limite**, porque não gasta IA nenhuma; há guard que reprova
se o caminho do texto passar a chamar `/api/ai/`.

Três decisões que o guard trava: o gate roda **antes** de ler o arquivo (travar
depois gastaria a banda do usuário para negar em seguida); o registro em
`audit_events` acontece **depois** da extração (leitura falha não queima a
demonstração gratuita); e falha ao CONTAR não vira acesso liberado, que seria
bypass por indisponibilidade do banco. A contagem sai de `audit_events`
(`action = 'diet_photo_import'`) para não exigir migration de um contador.

**O resultado cai no CAMPO DE TEXTO, não no salvamento.** A IA leu o papel da
pessoa; ela precisa conferir antes de aquilo substituir o plano dela.

**A primeira dieta REAL importada (29/08/2026) mostrou o que faltava.** O JSON
veio no formato que os assistentes de fato produzem, e nada nele funcionava:
**34 itens sem macro e ~700 kcal/dia abaixo das metas declaradas**. Três
correções, e os sete dias passaram a bater dentro de 1–5%:

1. **`semana` como OBJETO com o dia na CHAVE** (`{"segunda": {...}}`), não array.
2. **`quantidade_g` / `quantidade_ml` / `quantidade_unidades`** — as unidades
   viram gramas pela equivalência da PRÓPRIA base (`approx.unidade`), então
   "2 ovos" deixa de entrar com 0 g.
3. **Macros derivados da base local** quando o JSON não os traz — que é o caso
   comum: dieta de nutricionista dá "200 g de arroz" e a meta do dia, não macro
   por alimento. Sem isso o plano entra zerado, o que é pior que não entrar:
   parece importado e não soma nada. ⚠️ **Só quando NENHUM macro veio** — um
   plano que traz kcal e omite proteína está declarando zero, e completar seria
   inventar sobre o que o nutricionista escreveu.

⚠️ **O casamento é por TOKENS, não por substring** (`chaveDaBase`). O
`includes` falhava em "arroz **branco** cozido" (palavra no meio), "ovo**s**"
(plural) e "Doce de leite Tirol" (que casava com 'leite desnatado'). Exige que
TODOS os tokens da chave estejam no nome, vence a mais específica, e o empate
desempata pelo que aparece mais cedo — "feijão **preto** cozido" casa com
'feijao preto' e 'feijao cozido' com dois tokens cada, e é 'preto' que descreve
o feijão.

A base ganhou 9 entradas que essa dieta pediu (`legumes`, `legumes e salada`,
`kefir`, `doce de leite`, `coxa`, `sobrecoxa`, as duas de frango e a grafia
`muçarela`/`mucarela` — a base só tinha "mussarela").
