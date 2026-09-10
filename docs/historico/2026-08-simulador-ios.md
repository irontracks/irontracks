<!-- Movido do CLAUDE.md em 10/09/2026 pelo /enxugar.
     Motivo: era changelog. As regras VIVAS ficaram no CLAUDE.md; aqui está o registro completo. -->

## Teste no simulador iOS (o agente verifica sozinho, não o dono)
**Regra fixa: o agente testa no simulador — não pede pro dono virar QA.**

**Caminho do editor de Story** (leva tempo achar às cegas): menu do avatar → **Histórico** → abrir um treino → botão **STORY** no topo. O ícone de compartilhar do card de treino é export PDF/JSON, não é o composer.

**⚠️ DUAS CONTAS, E CONFUNDI-LAS JÁ PRODUZIU UM BUG INEXISTENTE.** Confirmado com o
dono em 09/08/2026 — **o simulador está logado em `djmkbrasil@gmail.com`, a conta de
TESTE**. (Esta linha já afirmou o contrário; a conta do simulador MUDA, então trate
como pista datada e **confirme antes de comparar tela × banco**.)

**Reconfirmado em 10/08/2026, e some com a dúvida em 5 s:** o SIMULADOR mostrava 6
treinos A–F, "Complete seu perfil 20%" e meta 2000 kcal (= teste); no mesmo dia, o
print do IPHONE do dono trazia 2279/2676 kcal (= oficial). Ou seja: **simulador =
teste, aparelho do dono = oficial** — quando ele mandar um screenshot, ele NÃO é da
mesma conta que você está vendo.

**Escrever na conta de teste é LIBERADO — inclusive finalizar treino** (decisão do
dono, 11/08/2026: "djmkbrasil é só para testes"). A regra antiga mandava sempre
descartar; ela existia porque se acreditava que finalizar poluiria o histórico do
dono, e isso é falso — o histórico dele está na `djmkapple`. A trava custava as
telas que só existem DEPOIS do treino: relatório, PDF, story e o autoload
recalculando a carga. Nada disso era verificável.

Continua valendo, e não é detalhe:
- **A conta oficial (`djmkapple`) segue intocável.** Nenhuma escrita, nunca.
- **A conta de teste vive no banco de PRODUÇÃO**, então treino finalizado pode
  aparecer no feed da comunidade para usuários reais. Não é motivo para não
  finalizar; é motivo para não fazer 20 seguidos nem inventar PR absurdo.
- **Limpar depois continua sendo boa educação**, não obrigação: apagar a sessão de
  teste evita que o histórico da conta vire lixo e que o autoload aprenda de
  números inventados.

### A conta de teste foi ESPELHADA na oficial em 11/08/2026

Decisão do dono, para acabar com "o print dele mostra uma coisa e o simulador
outra". O que foi copiado de `djmkapple` → `djmkbrasil`:

| | Copiado? | Observação |
|---|---|---|
| Templates de treino | **sim** (5, 39 exercícios, 128 séries) | os 6 antigos (A–F) foram **arquivados**, não apagados |
| Sessões concluídas | **12 mais recentes** | o bastante para autoload/deload lerem histórico de verdade |
| Meta de nutrição | **sim** (2676 kcal) | |
| Perfil / objetivo / fase | **sim** | antropometria, `fitnessGoal`, `nutritionPhase`, `autoLoad`, `plateInventory` |
| Plano alimentar | **sim**, desde 31/08/2026 | "Dieta Semanal MK", 7 dias / 41 refeições, clonada como plano PRÓPRIO (editável) |
| Avaliações corporais + fotos | **não** | dado corporal e arquivos no storage; o ganho não paga |
| Resto do histórico (117 sessões) | **não** | 1,5 MB de JSON, e faria a conta de teste aparecer no **ranking e na comunidade** com 2,4 M kg falsos |
| Telefone, cidade, academia, notificações, feature flags | **não** | na época, `featureTeamworkV2` ligaria uma feature sem tabelas; hoje nem a flag existe (#436) nem a feature está desligada (#859) |

**Os IDs dos clones são determinísticos** — `md5(<id de origem> || ':clone-teste-v1')::uuid`.
Isso torna a cópia idempotente (rodar de novo não duplica) e o rollback exato:

```sql
-- desfaz o clone inteiro e devolve os templates A–F
with c as (select md5(id::text||':clone-teste-v1')::uuid nid from workouts
           where user_id='d04bfcef-54ea-4360-9e3d-e174a9ace503')
delete from workouts w where w.user_id='6cb619ba-1484-41f2-b60c-b67aaea06307'
  and w.id in (select nid from c);
update workouts set archived_at=null
 where user_id='6cb619ba-1484-41f2-b60c-b67aaea06307' and is_template;
```

**⚠️ O espelho ENVELHECE.** É uma foto de 11/08/2026, não uma sincronização: nada
mantém as duas contas iguais. Mudou treino ou meta na conta oficial depois dessa
data e elas divergem de novo — agora com cara de sincronizadas, que é pior.
**A regra de confirmar qual conta está na tela continua valendo**; o espelho só
reduz a frequência do problema.

| | `djmkbrasil` (TESTE, no simulador) | `djmkapple` (OFICIAL, o dono treina nela) |
|---|---|---|
| `user_id` | `6cb619ba-1484-41f2-b60c-b67aaea06307` | `d04bfcef-54ea-4360-9e3d-e174a9ace503` |
| Templates ativos | 5 (SEG/TER/QUA/QUI/SEX) + 6 arquivados | 5 (SEG/TER/QUA/QUI/SEX) |
| Sessões concluídas | **13** (12 clonadas + 1 vazia antiga) | **129** |
| Meta em `nutrition_goals` | 2676 kcal | 2676 kcal · P208 C295 G74 |
| Plano alimentar ativo | Dieta Semanal MK (clone, 31/08) | Dieta Semanal MK (original) |
| Fase / perfil | CUT, perfil preenchido | CUT, perfil completo |

**Como identificar rápido, agora que as telas são parecidas:** a de teste tem o
chip **"ARQUIVADOS (6)"** na lista de treinos e um histórico de 13 sessões; a
oficial não tem arquivados e tem 129. O aviso "Complete seu perfil" **não serve
mais** — sumiu da conta de teste quando o perfil foi copiado. O peso do check-in
nunca serviu.

**O erro concreto, para não se repetir:** em 09/08/2026 um agente leu "0kg levantados"
e "Meta: 2000 kcal" na tela do simulador, consultou o banco de `djmkapple` (2,4 M kg,
2676 kcal) e concluiu que havia dois bugs graves. **Não havia nenhum**: a conta de teste
tem 1 sessão vazia e zero metas salvas, então os dois números estavam CERTOS. Custou uma
investigação inteira de RLS, RPC e policies atrás de fantasma. Ler a tela de uma conta
contra o banco de outra não é imprecisão — inverte a conclusão.

**A página `/dashboard/nutrition` NÃO é alcançável dentro do app nativo.** A aba NUTRIÇÃO do dashboard abre o `NutritionOverlay`, que é outro componente; o `VipHub` até tem `router.push('/dashboard/nutrition')`, mas só quando `onOpenNutrition` não é passado — e no dashboard ele é. A página é a superfície WEB. Mexeu nela? A conferência visual pelo simulador não existe: valide pelo overlay (irmão que exibe os mesmos números) ou pelos dados, e **diga que a prova foi numérica, não visual**.

**A suíte verde não vê o que só existe na TELA — dois casos em 27/08/2026, com
6.7 mil testes passando.** (1) A Central de Notificações ganhou navegação e os
cards continuavam inertes: o `.map()` que monta a lista reconstrói cada item
campo a campo e não copiava `metadata`, então o destino nunca era encontrado. A
lista fica IDÊNTICA — some só o clique. (2) A tela de login passou a exibir
"V6DC5E30D" no lugar de "v1.21", porque a correção deu precedência a
`NEXT_PUBLIC_APP_VERSION`, que na Vercel é o SHA do commit (é o buster de cache
do service worker, nunca a versão pública).

O padrão dos dois: **o guard media a ponta certa e a fiação errada** — o
componente isolado estava correto, o dado é que não chegava nele. Depois de
mexer em algo que aparece, abra a tela; e para o que a tela não alcança (a
página web da nutrição), diga que a prova foi numérica.

**Teste de canvas NÃO prova rendering.** jsdom não implementa `canvas.getContext('2d')`, então `measureText`/matrizes caem em fallback e o teste passa verde com o desenho quebrado. Foi assim que a legenda do Story subiu com 23 guards verdes e o texto invisível no aparelho. Em qualquer coisa que DESENHE, o guard cobre o algoritmo e a fiação; o resultado na tela é conferência visual — declare o limite no próprio arquivo de teste.

**REGRA DO DONO (03/08/2026): toda mudança que precise de verificação VISUAL termina
no simulador iOS — abrir, navegar até a tela e conferir com screenshot.** Não vale
entregar UI descrevendo o que deveria aparecer, nem substituir a conferência por
mock/teste de render (eles provam comportamento, não o resultado na tela). **Device
padrão: iPhone 17 Pro Max** — é o aparelho do dono; só usar outro se ele pedir.

**O simulador aponta para onde você mandar — inclusive o `npm run dev` (19/08/2026).**
`capacitor.config.ts` fixa `url: process.env.CAPACITOR_SERVER_URL || 'https://irontracks.com.br'`,
então o default continua sendo PRODUÇÃO. O que mudou é o custo de sair dele:

```bash
npm run dev          # servidor local na 3000 (deixe rodando)
npm run sim:local    # aponta o simulador para http://localhost:3000 e relança
npm run sim:prod     # devolve para produção ao terminar
npm run sim:status   # para onde está apontando agora
```

⚠️ **A porta 3000 desta máquina NÃO é necessariamente o IronTracks (27/08/2026).**
Medido: quem escuta `127.0.0.1:3000` é o `Instagram/mk-dashboard`, servido em
standalone — e ele **respawna sozinho** segundos depois de ser derrubado (tem
supervisor). Como o `npm run dev` daqui fixa `--port 3000`, os dois convivem em
pilhas diferentes (um em IPv4, outro em `[::1]`) e o simulador pode carregar o
app ERRADO sem nenhum aviso. Diagnóstico em duas linhas:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -p <pid> | awk '$4=="cwd"{print $NF}'
```

Saída: subir este repo em outra porta (`npx next dev --webpack --port 3010`) e
apontar o simulador para ela — **`sim:local` aceita porta ou URL inteira**:
`npm run sim:local 3010`.

`scripts/sim-server.mjs` reescreve o `server.url` do `capacitor.config.json` **dentro
do bundle já instalado** (o bundle do simulador é um diretório no disco do Mac, sem
assinatura para invalidar) e relança o app. Leva menos de um segundo: nada de
`cap sync`, `out/` ou Xcode. **Hot reload funciona** — editar um `.tsx` aparece na
tela do simulador em segundos, sem relançar (provado em 19/08 mudando um texto do
LoginScreen).

Isso muda o fluxo padrão: **verificação visual passa a ser ANTES do commit**. O
caminho antigo (mergear → esperar deploy → olhar) custava PR + CI + deploy por
rodada, e três correções seguidas de UI pagaram esse pedágio em 19/08.

Duas coisas para não tropeçar:
- **Em local você precisa LOGAR de novo.** `localhost:3000` é outra origem, então
  cookie e storage não vêm de produção. O agente não digita senha — quem loga é o
  dono, uma vez; a sessão fica no simulador enquanto ele estiver apontado para local.
- **Termine com `npm run sim:prod`.** Esquecer deixa o app preso no seu localhost:
  na próxima abertura, sem `npm run dev` no ar, ele não carrega.

Continua valendo: `.app` já instalado serve para qualquer mudança **web/JS** — só
código NATIVO (Swift/plugin) exige build nova. E, depois do merge, apontar para
produção segue sendo a conferência final.

⚠️ **O teclado do simulador corrige para o INGLÊS.** Medido em 25/08/2026:
"peixe grelhado com batata doce" virou "Price grew Haro com Batista doce" e
"cozido" virou "cozies". Some-se a isto que o campo de nome de refeição
capitaliza cada palavra. **Digitar texto livre em português no simulador não
prova nada** — para conferir a TELA, injete o dado na conta de teste por SQL;
para conferir o MODELO de IA, chame a API direto. (Campos de identificador do
app já desligam a autocorreção — ver `utils/ui/textFieldProps.ts`; o que sobra
são os de texto livre, onde ela ajuda no aparelho real.)

⚠️ **Copiar o container de dados entre simuladores NÃO leva a sessão logada**
(testado nas duas direções em 01/09/2026): o cookie do WKWebView não mora no
container do app. Deslogou o simulador, a conferência visual PARA — o agente não
digita senha, e só o dono entra de novo. E o toque cego no menu do avatar é como
isso acontece: "Sair" fica poucos pixels abaixo de "Configurações".

**Acesso ao device é concedido pelo dono**, uma vez por aparelho, no link
"Let Claude use it" do painel. Se `attach`/`launch` responder que falta permissão,
peça — não fique tentando em loop.

**O caminho do bundle MUDA a cada launch.** Pegue com
`xcrun simctl get_app_container <UDID> com.irontracks.app`; não reaproveite o path
de antes (falha com `No such file or directory`). Para copiar o app entre
simuladores: `xcrun simctl install <UDID-destino> "$(xcrun simctl get_app_container
<UDID-origem> com.irontracks.app)"`.

Build p/ simulador (só quando precisar de código nativo novo):
```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,id=<UDID>' -derivedDataPath /tmp/itsim-dd \
  CODE_SIGNING_ALLOWED=NO build
```
Depois instala o `.app` de `/tmp/itsim-dd/Build/Products/Debug-iphonesimulator/App.app`.

**Finalizar treino no simulador é PERMITIDO desde 11/08/2026** — a conta do
simulador é a de teste, e o histórico do dono não é tocado (ver a seção das duas
contas). Sem isso, relatório, PDF, story e o recálculo do autoload não eram
verificáveis por ninguém. Use o **X → Descartar** quando a sessão não interessa,
e finalize quando o que você precisa ver está do outro lado. **A conta oficial
continua sem escrita, sempre.**

**Limitação conhecida:** com `CODE_SIGNING_ALLOWED=NO` a extensão do widget não registra as `ActivityConfiguration` — o log mostra `activitykit … Fetched descriptors for content states: []` e **a Live Activity não renderiza no simulador**. Isso é do build, NÃO é regressão. Não tire conclusão sobre a Ilha Dinâmica a partir do simulador.
