import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * O INICIAR da semana de descarga mora no menu "…" do header.
 *
 * Origem (10/09/2026): o controle vivia no `SessionDeloadBanner`, atrás de
 * `emCiclo || autoLoadEnabled`. O dono treina com a carga automática DESLIGADA —
 * sem ciclo e sem autoload, os dois lados eram falsos, e o botão para COMEÇAR um
 * ciclo só existiria se já houvesse um ciclo. Ele procurou no app e não achou.
 *
 * Guard de FORMA porque montar o `WorkoutHeader` exigiria os contextos de
 * workout, timer e team — mediria o harness, não o componente. Ele trava as duas
 * propriedades que a correção precisa manter: o item existe no menu, e sua
 * visibilidade NÃO depende da carga automática.
 */
const src = readFileSync(join(process.cwd(), 'src/components/workout/WorkoutHeader.tsx'), 'utf8')
const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('semana de descarga no menu do header', () => {
  it('o item existe no menu "…"', () => {
    expect(semComentarios).toMatch(/Semana de Deload/)
    expect(semComentarios).toMatch(/startDeloadCycle\?\.\(/)
    expect(semComentarios).toMatch(/endDeloadCycle\?\.\(\)/)
  })

  it('oferece as três durações', () => {
    expect(semComentarios).toMatch(/\[3,\s*5,\s*7\]/)
  })

  it('em ciclo, o item vira encerrar', () => {
    expect(semComentarios).toMatch(/emCicloDeDescarga\s*\?/)
    expect(semComentarios).toMatch(/Encerrar Deload/)
  })

  // O CORAÇÃO DO GUARD: o CICLO de semana não pode olhar para autoLoad. Se
  // alguém reintroduzir o acoplamento, o botão volta a ficar inalcançável para
  // quem treina com a carga automática desligada.
  //
  // ⚠️ Escopado ao BLOCO do item "Semana de Deload/Encerrar Deload" — não ao
  // arquivo inteiro. Desde 19/09/2026 o header TEM outro item que depende de
  // autoLoadEnabled DE PROPÓSITO ("Descarga automática: Ligada/Desligada", que
  // só faz sentido perguntar com o motor ligado). Mirar no arquivo todo
  // reprovaria esse uso legítimo — jeito nº 8 da lista de guards falsos deste
  // repo (largo demais).
  it('o item do CICLO de semana não condiciona a autoLoad', () => {
    const inicio = semComentarios.indexOf('if (emCicloDeDescarga) endDeloadCycle')
    const fim = semComentarios.indexOf('</button>', inicio)
    expect(inicio, 'o botão do ciclo de semana sumiu ou mudou de forma').toBeGreaterThan(-1)
    const blocoDoCiclo = semComentarios.slice(inicio, fim)
    expect(blocoDoCiclo).not.toMatch(/autoLoadEnabled/)
  })

  it('o status é lido pelo lado positivo, não por !== inactive', () => {
    expect(semComentarios).toMatch(/deloadCycleStatus === 'active' \|\| deloadCycleStatus === 'ends_today'/)
    expect(semComentarios).not.toMatch(/deloadCycleStatus !== 'inactive'/)
  })
})

/**
 * "Aplicar descarga agora" — o gatilho MANUAL, que saiu do topo da tela para
 * cá em 19/09/2026 (pedido do dono, ver o cabeçalho do arquivo). Guard de
 * FORMA pelo mesmo motivo dos casos acima.
 */
describe('aplicar descarga agora, no menu do header', () => {
  it('o item existe e abre o modal com status "manual"', () => {
    expect(semComentarios).toMatch(/Aplicar descarga agora/)
    expect(semComentarios).toMatch(/aplicarDescargaAgora/)
    expect(semComentarios).toMatch(/status: 'manual'/)
  })

  it('marca TODOS os exercícios de saída — é "aplicar no treino", com opt-out', () => {
    // O modal já sabe desmarcar (ver SessionDeloadBanner); abrir vazio faria
    // quem clica "Aplicar" sem mexer em nada não aplicar em ninguém.
    const inicio = semComentarios.indexOf('const aplicarDescargaAgora')
    const fim = semComentarios.indexOf('}, [exercises, setSessionDeloadModal])', inicio)
    expect(inicio, 'a função aplicarDescargaAgora sumiu ou mudou de forma').toBeGreaterThan(-1)
    const corpo = semComentarios.slice(inicio, fim)
    expect(corpo).toMatch(/selected:\s*\[\.\.\.idxs\]/)
  })

  it('some quando o treino não tem exercício nenhum', () => {
    expect(semComentarios).toMatch(/if \(!idxs\.length\) return/)
  })
})
