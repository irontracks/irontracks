/**
 * As seis correções do painel de controle do professor (12/09/2026), travadas
 * cada uma pelo invariante que a motivou.
 *
 * Contexto: depois de conferir a tela num treino real, o dono pediu revisão do
 * painel inteiro. Os seis achados viraram este arquivo — e a maioria deles é
 * source-guard porque o modal exige supabase + Realtime + auth para montar:
 * renderizá-lo mediria o harness, não o produto. Onde havia decisão pura, ela
 * foi extraída para `lib/workout/` e é testada por comportamento
 * (`resumoDoControle.test.ts`, `ultimaVezDoAluno.test.ts`).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ler = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')
const semComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const MODAL = 'src/components/teacher/TeacherControlModal.tsx'
const src = ler(MODAL)
const codigo = semComentarios(src)

describe('1. a barra do descanso continua alcançável com a lista rolada', () => {
    it('a barra é STICKY — não rola para fora junto com os exercícios', () => {
        // O defeito: a barra nascia no topo do contêiner rolável, então concluir
        // a série do 8º exercício abria o descanso fora da tela — e o START
        // ficava inalcançável justamente enquanto o aluno esperava parado.
        const i = codigo.indexOf('function BarraDeDescansoRemoto')
        const fim = codigo.indexOf('function ResumoDoControle')
        expect(i, 'a barra sumiu').toBeGreaterThan(0)
        const barra = codigo.slice(i, fim > i ? fim : i + 4000)
        expect(barra, 'a barra precisa grudar no topo da rolagem').toMatch(/className="sticky top-0/)
    })

    it('⚠️ e NÃO é `fixed` — faixa fixa aqui ancoraria no modal animado', () => {
        // O modal é um `motion.div` com `transform`, que cria containing block:
        // `fixed` viajaria com a animação e cobriria o cabeçalho. É a mesma
        // classe de defeito das faixas do topo do treino ativo, que já custou
        // três correções geométricas em 12/09/2026.
        const i = codigo.indexOf('function BarraDeDescansoRemoto')
        const fim = codigo.indexOf('function ResumoDoControle')
        const barra = codigo.slice(i, fim > i ? fim : i + 4000)
        expect(barra).not.toMatch(/className="[^"]*\bfixed\b/)
    })

    it('o scroller não tem padding no topo — senão vira FRESTA acima da barra', () => {
        // Padding no topo de um contêiner que hospeda `sticky` deixa o conteúdo
        // rolar à vista naqueles pixels, entre o cabeçalho e a barra grudada.
        expect(codigo).toMatch(/flex-1 overflow-y-auto overflow-x-hidden px-4"/)
        expect(codigo, 'o `py-4` do scroller voltou — a fresta volta com ele').not.toMatch(
            /flex-1 overflow-y-auto[^"]*py-4/,
        )
    })

    it('a sangria `-mx-4` vem acompanhada de `overflow-x-hidden`', () => {
        // Sem isso a sangria vira rolagem horizontal da tela inteira.
        const i = codigo.indexOf('function BarraDeDescansoRemoto')
        const barra = codigo.slice(i, i + 4000)
        if (/-mx-4/.test(barra)) {
            expect(codigo).toMatch(/overflow-y-auto overflow-x-hidden/)
        }
    })

    it('o fundo da barra é OPACO — translúcido deixaria os cards legíveis por baixo', () => {
        const i = codigo.indexOf('function BarraDeDescansoRemoto')
        const fim = codigo.indexOf('function ResumoDoControle')
        const barra = codigo.slice(i, fim > i ? fim : i + 4000)
        const alpha = /background: 'rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\)'/.exec(barra)
        expect(alpha, 'a barra perdeu o fundo declarado').not.toBeNull()
        expect(Number(alpha?.[1] ?? 0)).toBeGreaterThanOrEqual(0.9)
    })
})

describe('2. o professor vê o que o aluno fez da última vez', () => {
    it('o placeholder do peso é o peso da última vez, não um "Kg" genérico', () => {
        expect(codigo).toMatch(/placeholder=\{ultimaVez\?\.weight != null \? String\(ultimaVez\.weight\) : 'Kg'\}/)
    })

    it('o histórico vem RESUMIDO do servidor, nunca o `notes` cru', () => {
        // 1,9 MB no aluno mais antigo. A rota nova resume no servidor.
        expect(codigo).toMatch(/\/api\/teacher\/student-history\//)
        expect(codigo, 'a rota de admin devolve notes cru e teto de 200 sessões').not.toMatch(
            /\/api\/admin\/workouts\/history/,
        )
    })

    it('a busca não é refeita a cada tecla — a chave é a LISTA de exercícios', () => {
        // `session.workout` é recriado a cada patch de série; usá-lo como
        // dependência metralharia a rota enquanto o professor anota.
        expect(codigo).toMatch(/const chave = exercises\.map\(/)
    })

    it('a resposta da rota é CONFERIDA, e a falha vira sinal', () => {
        const i = codigo.indexOf('function useUltimaVezDoAluno')
        expect(i).toBeGreaterThan(0)
        const hook = codigo.slice(i, i + 2500)
        expect(hook).toMatch(/if \(!res\.ok\)/)
        expect(hook).toMatch(/logWarnRemote\(/)
    })
})

describe('3. progresso, tempo e exercício da vez', () => {
    it('o resumo sai da decisão pura, não de uma conta local', () => {
        expect(codigo).toMatch(/resumoDoControle\(session, agora\)/)
    })

    it('⚠️ o ticker do resumo bate de MINUTO, não de segundo', () => {
        // O número só muda a cada minuto; acordar a cada segundo seria 60× de
        // render para nada, nesta tela que já saiu de um bug de piscar.
        const i = codigo.indexOf('function ResumoDoControle')
        expect(i).toBeGreaterThan(0)
        const bloco = codigo.slice(i, i + 2000)
        // ⚠️ `[^)]*` NÃO serve: ele para no `)` de `Date.now()` e o guard nasce
        // vermelho com o código correto — a mesma armadilha de janela que já
        // pegou os guards do `toggleDone`. Janela limitada em vez de classe negada.
        expect(bloco).toMatch(/setInterval\([\s\S]{0,80}?60_000\)/)
    })

    it('a contagem de séries é a MESMA do app do aluno', () => {
        // `Number(ex.sets) || 0` ignorava série acrescentada no meio da sessão.
        expect(codigo).toMatch(/return setsCountOfExercise\(ex\)/)
        expect(codigo).not.toMatch(/return Number\(ex\.sets\) \|\| 0/)
    })
})

describe('4. o método da série é dito, não adivinhado', () => {
    it('o rótulo vem da montagem única compartilhada com o card do aluno', () => {
        expect(codigo).toMatch(/rotuloDoMetodoDaSerie\(/)
    })

    it('⚠️ o rótulo lê o log CRU — o reconstruído perde `per_set_method`', () => {
        // `getLog` monta um objeto só com done/weight/reps/rpe. Passá-lo faria a
        // série que o aluno escolheu como Drop aparecer como Normal.
        const i = codigo.indexOf('const metodo = rotuloDoMetodoDaSerie(')
        expect(i, 'o cálculo do método sumiu').toBeGreaterThan(0)
        const chamada = codigo.slice(i, i + 260)
        expect(chamada).toMatch(/session\?\.logs\?\.\[`\$\{exIdx\}-\$\{setIdx\}`\]/)
        expect(chamada, 'o log reconstruído não serve aqui').not.toMatch(/\(\s*ex,\s*setIdx,\s*log\s*,/)
    })
})

describe('5 e 6. o chrome para de competir com o sinal', () => {
    it('a faixa "você está no controle" saiu da primeira dobra', () => {
        expect(codigo, 'a faixa voltou — era a 4ª vez que o app dizia o mesmo fato').not.toMatch(
            /Você está no controle/i,
        )
    })

    it('⚠️ VERDE só onde a série está CONCLUÍDA', () => {
        // O modal gastava o mesmo #22c55e como decoração de modo (moldura,
        // borda do cabeçalho, ícone, título) e como sinal de série feita: o
        // olho perdia a conclusão no meio do verde de enfeite.
        const linhasVerdes = codigo
            .split('\n')
            .filter(l => /34,\s*197,\s*94|#22c55e|text-green-/.test(l))
        expect(linhasVerdes.length, 'nenhuma linha verde sobrou — o sinal de concluído sumiu junto').toBeGreaterThan(0)
        const semCondicao = linhasVerdes.filter(l => !/log\.done/.test(l))
        expect(
            semCondicao,
            'verde fora de `log.done` é decoração: ou vira neutro, ou o sinal de concluído deixa de saltar',
        ).toEqual([])
    })

    it('a moldura continua existindo (é o que marca o modo), agora neutra', () => {
        expect(codigo).toMatch(/boxShadow: 'inset 0 0 0 2px rgba\(255,255,255/)
    })

    it('o modal continua sendo tela cheia — o ratchet de janelas conta com isso', () => {
        expect(codigo).toMatch(/fixed inset-0/)
    })
})
