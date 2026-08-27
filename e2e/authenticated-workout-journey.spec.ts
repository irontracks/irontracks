import { test, expect, type Page } from '@playwright/test'

/**
 * JORNADA LOGADA DO TREINO — o teste que faltava.
 *
 * Em 15/08/2026 um teste MANUAL de 10 passos no simulador iOS achou três bugs
 * que passaram por 5.476 testes verdes: o teclado fechava a cada letra ao
 * renomear exercício, o "unilateral" não persistia no plano, e a barra do
 * descanso cobria o FINALIZAR (o treino não terminava sem pular o descanso).
 * Nenhum foi pego porque nenhum teste ANDAVA pelo app — os specs
 * `authenticated-workout*` existentes batem em API, não em tela.
 *
 * Este spec percorre a jornada pela INTERFACE, na ordem em que o usuário faz.
 *
 * Decisões que valem explicação (cada uma evita um jeito conhecido de escrever
 * teste frágil ou sujo):
 *
 *  - **Usa um treino que já existe na conta e NÃO cria dados.** Não há rota
 *    REST de criar/apagar treino (a criação é server action + RPC), então
 *    criar pela API não é possível e criar pela UI a cada caso tornaria o spec
 *    um teste do editor. O caso pega o primeiro card da lista, seja qual for.
 *  - **Cada caso DESCARTA a sessão no fim.** Sem isso o segundo caso encontra
 *    "CONTINUAR TREINO" em vez de "INICIAR", e a conta de teste acumula
 *    sessões abertas.
 *  - **Não finaliza treino.** Finalizar grava sessão de verdade na conta (que
 *    aparece no feed da comunidade) e não existe rota para limpar depois — a
 *    cada PR o CI deixaria lixo. O que importava do passo 10 é o FINALIZAR
 *    estar ALCANÇÁVEL com o descanso na tela, e isso é verificado sem gravar.
 *  - **Zero `waitForTimeout` como sincronização** — só `expect` com condição.
 *  - **Seletores por papel/rótulo acessível**: as classes CSS deste repo mudam
 *    toda semana (auditoria de design constante); os rótulos, não.
 */

/** O mesmo storageState que o projeto autenticado usa (playwright.config.ts). */
const STORAGE_STATE = 'e2e/.auth/user.json'

/** Entra no primeiro treino da lista. Devolve o nome, para o log de falha. */
async function iniciarPrimeiroTreino(page: Page): Promise<void> {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

    // Já existe sessão aberta? O app abre DIRETO no treino ativo e não há card
    // nenhum no dashboard. Acontece quando um caso anterior caiu por timeout
    // antes do afterEach — e também quando a sessão veio de OUTRO APARELHO.
    //
    // DESCARTA em vez de reaproveitar, e isso não é preferência de estilo. A
    // sessão ativa é sincronizada pelo SERVIDOR (`active_workout_sessions`),
    // então ela sobrevive entre execuções do CI e é compartilhada por todos os
    // clientes logados na conta de teste. Em 16/08/2026 um simulador ficou
    // horas com o app aberto reescrevendo essa linha; cada escrita voltava por
    // realtime para o navegador do CI, desfazia o valor que o teste tinha
    // acabado de digitar (esperava 42, encontrava 40) e re-renderizava a tela,
    // de modo que o "Voltar" nunca ficava `stable` e o caso morria por timeout.
    // Não era bug do app: era o sync multi-dispositivo funcionando.
    //
    // Reaproveitar herda logs que o teste não escreveu. Partir do zero é a
    // única forma de o caso medir o que ele diz medir.
    if (await emSessaoAtiva(page, 5_000)) {
        await descartarSessao(page)
    }

    // `exact: true` é obrigatório aqui: o CARD inteiro também é um <button>, e
    // o nome acessível dele contém "INICIAR TREINO" no meio do texto todo
    // ("SEG · Upper B … 30 séries INICIAR TREINO Ações do treino"). Sem exact,
    // o clique cai no card externo e a sessão nunca abre.
    const iniciar = page.getByRole('button', { name: 'INICIAR TREINO', exact: true }).first()
    const continuar = page.getByRole('button', { name: 'CONTINUAR TREINO', exact: true }).first()
    // Não escolha o alvo antes da hidratação: nesse instante ambos os locators
    // ainda podem estar invisíveis e o fallback para INICIAR abre indevidamente
    // o diálogo de troca quando já existe uma sessão ativa.
    await expect(
        iniciar.or(continuar).first(),
        'a lista de treinos precisa ter ao menos um card',
    ).toBeVisible({ timeout: 30_000 })
    // O bootstrap pode trocar CONTINUAR por INICIAR (ou o inverso) enquanto o
    // botão anima. O locator combinado se resolve de novo se o nó for trocado.
    await iniciar.or(continuar).first().click()

    // Se a sessão ativa pertence a outro card, INICIAR pede confirmação. Esse
    // é um estado válido da conta de teste e precisa ser resolvido pela UI.
    const trocarTreino = page.getByRole('heading', { name: /Trocar de treino\?/i })
    if (await trocarTreino.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await page.getByRole('button', { name: /^Confirmar$/i }).click()
    }

    // Check-in PRÉ-treino: aparece entre o toque e a sessão quando a conta tem
    // o prompt ligado (é o default). Um spec que não trate isso conclui que
    // "o treino não abriu" com o modal parado na frente — foi assim que a
    // primeira versão deste arquivo falhou.
    const pularCheckin = page.getByRole('button', { name: /^Pular$/i })
    if (await pularCheckin.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await pularCheckin.click()
    }

    // A sessão abriu quando o rodapé do treino ativo existe — hoje o marcador
    // é o FINALIZAR, única ação que sobrou lá.
    await expect(page.getByRole('button', { name: /Finalizar/i }).first()).toBeVisible({ timeout: 30_000 })
}

/** Há sessão de treino aberta? O rodapé do treino ativo mostra o FINALIZAR. */
async function emSessaoAtiva(page: Page, timeout = 3_000): Promise<boolean> {
    return page.getByRole('button', { name: /Finalizar/i }).first()
        .isVisible({ timeout }).catch(() => false)
}

/**
 * Descarta a sessão para o próximo caso começar do zero.
 *
 * ⚠️ Descartar MUDOU DE LUGAR em 18/08/2026: era um X no rodapé (mudo, colado
 * no "Finalizar") e passou a viver no menu "…" do cabeçalho, com rótulo por
 * extenso. Quem marca a presença de uma sessão ativa agora é o FINALIZAR — o
 * rodapé tem uma ação só.
 */
async function descartarSessao(page: Page): Promise<boolean> {
    // SEMPRE recarrega antes: o caso anterior pode ter terminado com um modal
    // aberto (editor completo) ou no meio da EXECUÇÃO de uma série — e nesse
    // estado o cabeçalho esconde as ações (opacity-0 + pointer-events-none),
    // então o menu "…" fica inalcançável. Recarregar não perde a sessão, que é
    // sincronizada pelo servidor.
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' }).catch(() => {})
    if (!(await emSessaoAtiva(page, 10_000))) return true // nada a descartar
    const menu = page.getByRole('button', { name: /Mais opções/i })
    if (!(await menu.isVisible({ timeout: 5_000 }).catch(() => false))) return false
    await menu.click()
    const x = page.getByRole('button', { name: /Descartar treino/i })
    if (!(await x.isVisible({ timeout: 5_000 }).catch(() => false))) return false
    await x.click()
    const confirmar = page.getByRole('button', { name: /^Descartar$/i })
    if (await confirmar.isVisible({ timeout: 5_000 }).catch(() => false)) await confirmar.click()
    return await page.getByRole('button', { name: 'INICIAR TREINO', exact: true }).first()
        .isVisible({ timeout: 20_000 }).catch(() => false)
}

/**
 * O que sobra quando o descarte não deu certo — e por que ele precisa GRITAR.
 *
 * A limpeza é feita pela UI, e é justamente quando um caso FALHA que a página
 * fica em estado ruim: modal aberto, hidratação incompleta, botão que não
 * estabiliza. Ou seja, o descarte tem menos chance de funcionar exatamente
 * quando é mais necessário — e a linha de `active_workout_sessions` fica no
 * servidor, compartilhada por todos os clientes da conta de teste.
 *
 * O run seguinte então abre o app DENTRO de um treino, não acha card nenhum e
 * morre em "a lista de treinos precisa ter ao menos um card". Aconteceu três
 * vezes em 26/08/2026 (PRs #937 duas vezes e #940), e nas três a investigação
 * começou pelo diff do PR — que não tinha nada a ver. Uma delas chegou a ser
 * dividida em dois PRs para bisseccionar um culpado que não existia.
 *
 * O `.catch(() => {})` que embrulhava isto tornava a falha invisível. Agora ela
 * aparece no log do CI com a instrução de como resolver, e o `afterAll` tenta
 * uma última vez com uma PÁGINA NOVA — fora do estado que derrubou o caso.
 */
function avisarSessaoOrfa(origem: string): void {
    console.warn(
        `\n⚠️  [E2E] Não consegui descartar a sessão de treino (${origem}).\n` +
        '    A linha de `active_workout_sessions` da conta de teste ficou no servidor\n' +
        '    e vai derrubar o PRÓXIMO run em "a lista de treinos precisa ter ao menos\n' +
        '    um card" — que parecerá bug do outro PR, e não é.\n' +
        '    Para destravar:  delete from active_workout_sessions where user_id = <conta de teste>;\n',
    )
}

test.describe('Jornada do treino (UI autenticada)', () => {
    // Jornada tem mais passos que um teste de unidade: iniciar sessão (que
    // carrega o bootstrap), abrir editor, adicionar exercício, digitar tecla a
    // tecla. Os 30 s padrão do projeto estouram no caso mais longo.
    //
    // `mode: 'default'` NÃO é redundante — o config tem `fullyParallel: true`,
    // que faz os testes DESTE arquivo rodarem concorrentes em `workers: 2`. E
    // eles não podem: os quatro disputam a MESMA conta e a MESMA linha de
    // `active_workout_sessions`, que é sincronizada pelo servidor. Dois casos
    // em voo significam um chamando `descartarSessao()` na sessão que o outro
    // acabou de abrir.
    //
    // 'default' e não 'serial': os dois rodam em ordem num worker só, mas o
    // 'serial' PULA os casos seguintes quando um falha — esconderia um segundo
    // defeito atrás do primeiro, e este spec existe justamente porque bug de
    // jornada passa despercebido. Com 'default', cada caso é retentado por
    // conta própria.
    test.describe.configure({ mode: 'default', timeout: 90_000 })

    // VIEWPORT MOBILE — não é detalhe: o app é usado no celular, e um dos bugs
    // (a barra do descanso cobrindo o FINALIZAR) SÓ existe aqui. No desktop a
    // barra é centralizada (`max-w-md`) e o botão fica à direita, fora dela:
    // o mesmo caso passa verde com o bug presente numa viewport larga
    // (medido em 15/08/2026).
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

    test.afterEach(async ({ page }) => {
        const ok = await descartarSessao(page).catch(() => false)
        if (!ok) avisarSessaoOrfa('afterEach')
    })

    /**
     * Última chance, com PÁGINA NOVA. O `afterEach` herda a página do caso que
     * acabou — e se ele falhou, ela está no estado que o derrubou. Um contexto
     * limpo não tem modal aberto nem hidratação pela metade, e costuma
     * conseguir o que o afterEach não conseguiu.
     */
    test.afterAll(async ({ browser }) => {
        const contexto = await browser.newContext({ storageState: STORAGE_STATE })
        try {
            const pagina = await contexto.newPage()
            if (!(await descartarSessao(pagina).catch(() => false))) avisarSessaoOrfa('afterAll')
        } finally {
            await contexto.close()
        }
    })

    test('concluir série registra e mantém o FINALIZAR alcançável durante o descanso', async ({ page }) => {
        await iniciarPrimeiroTreino(page)

        const peso = page.getByLabel(/Peso em kg – série 1/i).first()
        await expect(peso).toBeVisible({ timeout: 20_000 })
        await peso.fill('40')

        await page.getByRole('button', { name: /^Concluir$/ }).first().click()
        // A série virou "Feito": o app registrou de verdade.
        await expect(page.getByRole('button', { name: /^Feito$/ }).first()).toBeVisible({ timeout: 20_000 })

        // BUG DE 15/08: com o descanso na tela, a barra ficava POR CIMA do
        // rodapé e o FINALIZAR era inalcançável — dava para ver, não para
        // clicar. `toBeVisible` não pega isso (o elemento existe e está
        // pintado); o que pega é a "actionability" do Playwright, que exige o
        // elemento ser o alvo real no ponto — se algo estiver por cima, falha
        // por interceptação de ponteiro.
        const finalizar = page.getByRole('button', { name: /Finalizar/i }).last()
        await expect(finalizar).toBeVisible()
        await expect(finalizar).toBeEnabled()
        // `click({ trial: true })` roda TODAS as checagens de actionability
        // (visível, estável, habilitado e — o que importa aqui — recebendo
        // eventos de ponteiro) e NÃO clica. `hover` não serve: ele move o mouse
        // sem exigir que o alvo receba o evento, e passava verde com a barra do
        // descanso por cima (medido).
        await finalizar.click({ trial: true, timeout: 10_000 })
    })

    test('renomear exercício no EDITOR COMPLETO: o campo não perde o foco a cada tecla', async ({ page }) => {
        await iniciarPrimeiroTreino(page)

        // O caminho do relato: "cê vai adicionar treino, daí vai editar o nome".
        // É o EDITOR COMPLETO (botão "Editar treino" do topo), não o modal
        // rápido de exercício — a primeira versão deste caso mirou o modal, que
        // nunca teve o defeito, e por isso passava verde com o bug reposto.
        await page.getByTitle(/Editar treino \(exercícios/i).click()

        // ADICIONA um exercício antes de digitar. É essencial: exercício vindo
        // do treino salvo tem `id` do banco, e a key do card usa o id — a
        // instabilidade não aparece nele. O defeito era no exercício RECÉM
        // ADICIONADO (sem id), que é exatamente o caminho do relato
        // ("cê vai adicionar treino, daí vai editar o nome").
        await page.getByRole('button', { name: /Adicionar Exercício/i }).click()

        const nome = page.getByLabel(/Nome do exercício/i).last()
        await expect(nome).toBeVisible({ timeout: 20_000 })

        // BUG DE 15/08: a key do card derivava do NOME; cada tecla trocava a
        // key, o React DESMONTAVA o card e o input era destruído e recriado —
        // e o teclado do iOS fecha junto com o campo que ele servia.
        //
        // A verificação é a IDENTIDADE DO NÓ, não o valor: o Playwright
        // re-resolve o locator a cada tecla e o estado do React repõe o texto,
        // então digitar e conferir o valor passa verde COM o bug presente
        // (medido). O que não sobrevive ao remount é o nó original continuar
        // conectado ao documento.
        await nome.click()
        await nome.fill('')
        const noOriginal = await nome.elementHandle()

        const textoFinal = 'Supino renomeado E2E'
        let textoAcumulado = ''
        for (const caractere of textoFinal) {
            await nome.pressSequentially(caractere)
            textoAcumulado += caractere
            await expect(nome).toHaveValue(textoAcumulado)
            await expect(nome).toBeFocused()
            const aindaNoDocumento = await noOriginal!.evaluate((el) => el.isConnected)
            expect(
                aindaNoDocumento,
                'o input foi destruído durante a digitação — é isso que fecha o teclado no iOS',
            ).toBe(true)
        }

        // Sai sem salvar — o caso não altera o plano da conta.
        await page.getByRole('button', { name: /Fechar editor/i }).click()
        const confirmar = page.getByRole('button', { name: /^(Sim|Confirmar|Descartar)$/i }).first()
        if (await confirmar.isVisible({ timeout: 4_000 }).catch(() => false)) await confirmar.click()
    })

    test('campo numérico: digitar SUBSTITUI o valor em vez de concatenar', async ({ page }) => {
        await iniciarPrimeiroTreino(page)

        const peso = page.getByLabel(/Peso em kg – série 1/i).first()
        await expect(peso).toBeVisible({ timeout: 20_000 })
        await peso.fill('20')
        await expect(peso).toHaveValue('20')

        // Tira o foco ANTES de voltar ao campo — é o que o usuário faz (registra
        // a série, mexe em outra coisa, depois volta para corrigir a carga). Sem
        // este passo o campo continua focado do `fill` acima e um segundo clique
        // não gera novo `focusin`: o teste mediria um cenário que não existe.
        // (era o X do rodapé; ele foi para o menu "…" em 18/08/2026)
        await page.getByRole('button', { name: /Finalizar/i }).first().focus()
        await expect(peso).not.toBeFocused()

        // BUG DE 15/08: ao voltar, tocar posicionava o cursor e a tecla INSERIA
        // — "20" com "5" digitado virava "205". Carga errada gravada no
        // histórico, que é a base lida pelo motor de carga automática.
        await peso.tap()

        // Espera a SELEÇÃO acontecer antes de digitar. Isso não é maquiagem de
        // teste: a seleção é adiada um frame de propósito (no iOS o WebKit
        // ainda está posicionando o cursor durante o onFocus, e selecionar ali
        // não pega). Um dedo humano leva ~100 ms entre tocar e digitar; o
        // `keyboard.type` do Playwright dispara em ~1 ms e passaria na frente
        // do frame. O invariante que importa é "ao focar, o conteúdo fica
        // selecionado" — é isso que faz a próxima tecla substituir.
        await expect.poll(
            async () => peso.evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!),
            { message: 'o conteúdo do campo deveria estar selecionado após o foco', timeout: 5_000 },
        ).toBe(2)

        await page.keyboard.type('5')
        await expect(peso).toHaveValue('5')
    })

    test('sair do treino e voltar preserva a sessão e as séries feitas', async ({ page }) => {
        await iniciarPrimeiroTreino(page)

        const peso = page.getByLabel(/Peso em kg – série 1/i).first()
        await expect(peso).toBeVisible({ timeout: 20_000 })
        await peso.fill('42')
        await page.getByRole('button', { name: /^Concluir$/ }).first().click()
        await expect(page.getByRole('button', { name: /^Feito$/ }).first()).toBeVisible({ timeout: 20_000 })

        // Sai SEM descartar (o "Voltar" do topo).
        await page.getByRole('button', { name: /^Voltar$/i }).first().click()
        await expect(page.getByRole('button', { name: 'CONTINUAR TREINO', exact: true }).first())
            .toBeVisible({ timeout: 30_000 })

        // Volta: a série feita continua feita, o peso continua lá.
        await page.getByRole('button', { name: 'CONTINUAR TREINO', exact: true }).first().click()
        await expect(page.getByRole('button', { name: /^Feito$/ }).first()).toBeVisible({ timeout: 30_000 })
        await expect(page.getByLabel(/Peso em kg – série 1/i).first()).toHaveValue('42')
    })
})
