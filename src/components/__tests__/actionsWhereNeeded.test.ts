import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * "A ação mora onde a falta dela é percebida."
 *
 * O dono apontou o padrão em 04/08/2026 a partir da aba Periodizados ("crie na aba
 * VIP") e pediu a varredura completa. Cinco telas faziam o mesmo: mostravam que algo
 * faltava e mandavam o usuário procurar a solução em outro lugar, sem oferecer a
 * ação — em todos os casos a ação já existia e era reaproveitável.
 *
 * Este arquivo trava as cinco. Ele NÃO tenta proibir a frase genérica em todo o
 * repo: instrução de navegação é legítima em vários contextos (paywall VIP,
 * cancelamento de assinatura na Apple, tela de login sem self-service). O que se
 * trava é caso a caso, com o texto exato que estava lá.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

/** Invariante de fluxo se mede em código, não na prosa que o explica. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('1. Comunidade desativada — liga na própria tela', () => {
  const file = read('src/app/(app)/community/CommunityClient.tsx')

  it('não manda mais procurar em Configurações', () => {
    expect(code(file)).not.toContain('Ative em Configurações')
  })

  it('o botão liga o módulo ali mesmo', () => {
    expect(code(file)).toContain("updateSetting('moduleCommunity', true)")
  })
})

describe('2. Sem treino — o aluno pode criar o dele', () => {
  const file = read('src/components/dashboard/StudentDashboard.tsx')

  it('não diz mais só "peça ao seu professor"', () => {
    expect(code(file)).not.toContain('Peça ao seu professor para criar seu primeiro treino')
  })

  it('a criação usa a MESMA ação do botão principal', () => {
    // Extraída em vez de copiada: duas versões do fallback de loading divergem.
    expect(code(file)).toContain('const handleCreateWorkout = useCallback(')
    const cliques = code(file).match(/onClick=\{handleCreateWorkout\}/g) ?? []
    expect(cliques.length).toBe(2)
  })
})

describe('3. Professor sem conversas — o texto dizia o que não resolve', () => {
  const file = read('src/components/teacher-area/TeacherConversationsInbox.tsx')

  it('não manda mais "abrir um aluno" quando não há aluno nenhum', () => {
    // A rota devolve TODOS os alunos, com ou sem mensagem: a lista só vem vazia
    // quando o professor não tem aluno. Mandar abrir um aluno era impossível.
    expect(code(file)).not.toContain('Abra um aluno e toque')
  })

  it('leva ao cadastro de aluno', () => {
    expect(code(file)).toContain('onGoToStudents')
    expect(code(file)).toContain('Cadastrar aluno')
  })
})

describe('4. Desafios sem ninguém — escolher quem desafiar', () => {
  const panel = read('src/app/(app)/community/ChallengesPanel.tsx')
  const client = read('src/app/(app)/community/CommunityClient.tsx')

  it('o botão existe e a aba de amigos é ligada nele', () => {
    expect(code(panel)).toContain('Escolher quem desafiar')
    expect(code(client)).toContain("onFindFriends={() => setActiveTab('follow')}")
  })
})

describe('5. Financeiro sem alunos — cadastrar dali', () => {
  const billing = read('src/components/admin-panel/TeacherBillingTab.tsx')
  const area = read('src/components/teacher-area/TeacherArea.tsx')

  it('não manda mais "na aba de Alunos primeiro"', () => {
    expect(code(billing)).not.toContain('Adicione alunos na aba de Alunos')
  })

  it('a navegação está fiada de ponta a ponta', () => {
    expect(code(billing)).toContain('onGoToStudents')
    expect(code(read('src/components/admin-panel/FinanceTabUnified.tsx'))).toContain('onGoToStudents={onGoToStudents}')
    expect(code(area)).toContain("<FinanceTabUnified onGoToStudents={() => setTab('students')} />")
    expect(code(area)).toContain("<TeacherConversationsInbox onGoToStudents={() => setTab('students')} />")
  })
})
