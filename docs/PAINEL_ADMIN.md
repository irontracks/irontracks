# Painel de Controle e Área do Professor — o que a varredura de design achou

Extraído do `CLAUDE.md` em 31/08/2026: a seção passou de 130 linhas, e o
`CLAUDE.md` é lido inteiro em toda sessão. Abra este arquivo **antes de mexer
em qualquer tela do painel admin ou da Área do Professor**.

## Área administrativa — a sala que não tinha passado pela régua (28/08/2026)

Painel de Controle: **15 abas em 4 categorias** (`admin-panel/adminPanelTabs.ts`);
Área do Professor: **7 seções** que reusam os MESMOS componentes de aba numa
casca própria (`teacher-area/teacherAreaSections.ts`). A navegação é boa e a
decisão está documentada no próprio arquivo — o que faltava régua era o
conteúdo.

⚠️ **Lista fixa de categorias apodrece contra o banco.** O gráfico "Status dos
Alunos" tinha cinco colunas — Pago · Pendente · Atrasado · Cancelar · Outros — e
a tabela `students` tem **dois** status: `pago` (32) e `ativo` (24). Três colunas
permanentemente vazias, e **43% da base rotulada como "Outros"**, porque `ativo`
não estava na lista. Ninguém olhou o gráfico depois de escrevê-lo. Hoje as
categorias saem de `lib/admin/studentStatus.ts`, que agrupa pelos status que
APARECEM — status novo no banco ganha nome sozinho, e a tabela de conhecidos só
dá rótulo e cor melhores, **nunca filtra o que pode ser exibido** (senão o
próximo status volta a cair em "Outros").

Dois defeitos de vocabulário no mesmo lugar: **"Cancelar" é verbo** (rótulo de
botão, não de estado) e **aluno sem status virava "Pendente"**
(`String(raw || 'pendente')`), inventando categoria que o banco não tem — hoje é
"Sem status", que é a verdade e é acionável.

⚠️ **ABERTO — card e gráfico ainda contam "pendente" por regras diferentes.** O
card do dashboard exige `status === 'pendente'` e ignora vazio
(`DashboardTab.tsx:87`); o módulo novo trata vazio como "Sem status". Enquanto a
base estiver limpa os dois concordam; no dia em que entrar aluno sem status, o
painel se contradiz na mesma tela. A fonte única é trabalho de Sprint 2.

**Padding no topo de um container que hospeda bloco `sticky` vira FRESTA.** Os
chips de sub-aba são `sticky top-0` dentro do container de rolagem, e o `pt-2`
dele ficava ACIMA da zona de grude: na aba Alunos aparecia uma faixa com "Pago",
"MK" e dois ícones cortados ao meio, presa entre o cabeçalho e os chips, o tempo
todo em que se rolava. Parecia defeito de renderização. O respiro do conteúdo
mora no filho, que rola junto.

**O badge de pendentes só recontava ao NAVEGAR** (o efeito dependia de
`currentTab`) — e o caminho natural é abrir Solicitações e despachar várias sem
sair da aba. Hoje há `lib/admin/solicitacoesEvent.ts`. Badge que mente é pior
que badge nenhum: ele é a única razão de o admin abrir aquela aba.

**Jargão de métrica não é vocabulário de usuário.** A fila do coach abria com
"Coach Inbox" e quinze cartões "RISCO DE CHURN" em vermelho, com botões
"Enviar mensagem / Soneca / Feito" logo abaixo. Hoje "Sua fila" e **"Sumido"** —
que cobre os dois casos reais (parou de vir e nunca veio), o que "Parou de
treinar" não cobriria. `churnDays` continua sendo chave de API.

**O que está CERTO e não deve ser "corrigido":** a exclusão de aluno e de
professor pergunta antes, lista o que se perde e tem a polaridade correta
(`cancelText: 'Manter'`); o `overflow-x-hidden` do container é obrigatório (ver
o comentário no arquivo — a página inteira deslizava); e o `TabErrorBoundary`
por aba impede que uma aba quebrada derrube o painel.

**Sprint 2 — o vocabulário de status tinha CINCO donos (29/08/2026).** A mesma
decisão estava escrita em cinco lugares, com conteúdos diferentes: as opções do
`<select>` (`STATUS_OPTIONS`), o `switch` das classes do badge, os rótulos com
emoji do diálogo de confirmação, as labels do gráfico, e os chips de filtro.
Hoje tudo sai de `lib/admin/studentStatus.ts`.

⚠️ **O `<select>` de status não oferecia `ativo` — o status de 24 alunos (43%).**
Um `<select>` cujo `value` não casa com nenhuma `<option>` não consegue exibir o
estado real: o navegador cai na primeira opção. Hoje `opcoesDeStatus(atual)`
sempre inclui o status atual, mesmo desconhecido — a classe do problema, não o
caso. Pelo mesmo motivo os chips de filtro passaram a sair dos DADOS: havia um
chip "Ativos" que filtrava `pago` e nenhum para `ativo`, então aqueles 24 alunos
não eram alcançáveis por filtro nenhum.

⚠️ **"Ativos" significava duas coisas na mesma tela.** O card do topo contava
`status = 'pago'` (28) e o gráfico, uma rolagem abaixo, mostrava `Ativo` (20).
O card virou **PAGANTES**. Guard de CLASSE: nenhuma contagem de status no
`DashboardTab` pode normalizar à mão — mirar em `|| 'pendente'` deixava passar
`String(u?.status || '').toLowerCase()`, que é a mesma decisão reescrita
(provado por mutação).

**Correção de um achado meu que estava ERRADO:** o relatório dizia que o
`Doughnut` "Status Geral" e o `Bar` "Status dos Alunos" desenhavam o mesmo dado
na MESMA tela. Não desenham — o Doughnut está sob `{isTeacher &&}` e as barras
sob `{isAdmin &&}`. O que era real e foi removido é o **"Distribuição por
Professor"**: 210px de gráfico para dois números que o card TOTAL ALUNOS já diz
em texto ("49" e "25 sem professor").

**Dado sujo conhecido, NÃO corrigido:** `teachers` tem **41 linhas para 7
e-mails distintos**. A UI já mostra 7 (o fetch deduplica), então não é bug de
tela — mexer nas linhas é decisão do dono.

**Sprint 3 (29/08/2026).** Três correções e uma investigação PARADA de
propósito.

**Um admin que também dá aula via "Coach" e nunca "Admin"** — o ternário testava
`isCoach` primeiro (`HeaderActionsMenu`). No IronTracks o admin normalmente
TAMBÉM atende alunos, então o papel de maior alcance ficava invisível justamente
para quem o tem. Hoje `lib/user/rotuloDePapel.ts` devolve os dois ("Admin ·
Coach"), com Admin primeiro — é ele que explica os itens a mais no menu.

⚠️ **O guard disto nasceu FALSO e proibia a forma CORRETA:** o regex
`isCoach\s*\?\s*'Coach'\s*:` casava com `isCoach ? 'Coach' : null`, que é o
conserto. Virou função pura com teste de comportamento; o source-guard ficou só
para travar a fiação. **Lógica de decisão não se guarda por regex.**

**O banner `DIAGNOSTIC MODE` despejava a exceção crua** (`setDebugError("Erro
Catch: " + msg)`), exibida com `break-all` no topo do painel. Mesma classe
varrida no resto do app em 27/08 — esta superfície ficou de fora porque a busca
mirou em `getErrorMessage`/`String(error)` e aqui a forma é outra. O detalhe
continua indo para `logError`.

**Os chips de sub-aba avisam que há mais.** Em "Mais" são oito e cabem três e
meia; o corte do quarto chip era a única pista. O overflow é medido no efeito
que já existia (`scrollWidth - clientWidth`), **sem `ResizeObserver`** — jsdom
não o tem, e as duas coisas que mudam a largura do trilho já disparam aquele
efeito.

⚠️ **Os ~65pt de preto morto no topo continuam SEM causa isolada — e não tente
adivinhar.** Duas hipóteses foram levantadas e as duas caíram na verificação:
(1) `pt-header-safe` (`safe-area + 60px`) explicaria o valor, mas é **código
morto** — está no `globals.css` e ninguém o usa; (2) `fixed` quebrado por
ancestral com `transform` — o painel é `fixed inset-0` dentro de outro `fixed
inset-0`, sem transform no caminho. A conta do header (`pt-safe` 59pt + `py-3`
12pt = 71pt) não fecha com os ~138pt medidos na tela. **Isolar exige medir o DOM
com o app logado**; mexer em safe-area por palpite quebra o topo em todo
aparelho.

**Aberto, do mesmo relatório** (`Relatorio/design-area-administrativa-2026-08-28.md`
— a pasta `Relatorio/` é ignorada pelo git, então o arquivo é local; o que
segue é o resumo que sobrevive):
os quinze cartões da fila continuam sem mostrar há quanto tempo o aluno sumiu
quando ele NUNCA treinou (a API não manda o dado — o que saiu foi a repetição
tripla); e há ~65pt de preto morto acima do cabeçalho — **medido na
tela, causa NÃO isolada** (o `pt-safe` do header sozinho não explica o valor).
