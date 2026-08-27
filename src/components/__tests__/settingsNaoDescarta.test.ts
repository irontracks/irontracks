import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const src = readFileSync(join(process.cwd(), 'src/components/SettingsModal.tsx'), 'utf8')
const semComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const codigo = semComentarios(src)

/**
 * Configurações edita um `draft` local e só persiste no botão Salvar. Havia
 * CINCO saídas — Escape pelo focus trap, um listener de Escape próprio, o gesto
 * de voltar, a seta do cabeçalho e o "Fechar" do rodapé — e nenhuma checava se
 * havia alteração pendente.
 *
 * Quem mexia em meta, unidade ou notificação saía achando que salvou, e
 * descobria dias depois pelo comportamento errado do app. O achado da auditoria
 * falava em três saídas; ao contar no código eram cinco.
 */
describe('Configurações não descarta em silêncio', () => {
  it('existe uma porta única, e ela pergunta', () => {
    expect(codigo, 'sem `dirty`, o modal não sabe se há o que perder').toMatch(/const dirty = useMemo/)
    expect(codigo, 'a porta única precisa confirmar antes de fechar').toMatch(/tentarFechar[\s\S]{0,400}await confirm\(/)
  })

  it('a polaridade não devolve o dano no caminho do "fechar por fora"', () => {
    const porta = codigo.slice(codigo.indexOf('const tentarFechar'), codigo.indexOf('const tentarFechar') + 700)
    // `confirm` resolve false ao fechar por fora: DESCARTAR tem que ser o confirmText.
    expect(/confirmText:\s*'Descartar'/.test(porta), 'descartar precisa ser o confirmText').toBe(true)
    expect(/cancelText:\s*'[^']*[Dd]escartar/.test(porta), 'o cancelText é o caminho SEGURO').toBe(false)
    expect(porta, 'sem destructive o diálogo sai com o dourado de ação positiva').toMatch(/destructive:\s*true/)
  })

  it('NENHUMA saída chama onClose direto — porta que escapa descarta calada', () => {
    const diretos = [...codigo.matchAll(/props\?\.onClose\?\.\(\)/g)].length
    // Só os dois usos DENTRO da porta única (o caminho limpo e o pós-confirmação)
    // e o do Salvar, que fecha depois de persistir.
    expect(
      diretos,
      'apareceu um `onClose` direto novo: as saídas passam por `tentarFechar()`',
    ).toBeLessThanOrEqual(3)
    // ⚠️ Fatiar por TAMANHO FIXO pegava a linha seguinte: com 120 caracteres a
    // partir de `useFocusTrap(`, o `tentarFechar` do `useBackHandler` logo
    // abaixo satisfazia a asserção — o guard passava verde com o focus trap
    // fechando direto. Medido por mutação. Fatie pela LINHA.
    for (const gancho of ['useFocusTrap(', 'useBackHandler(']) {
      const i = codigo.indexOf(gancho)
      expect(i, `${gancho} sumiu do arquivo`).toBeGreaterThan(-1)
      const linha = codigo.slice(i, codigo.indexOf('\n', i))
      expect(linha, `${gancho} precisa passar pela porta única`).toMatch(/tentarFechar/)
    }
  })
})
