import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

/**
 * `fetch` só rejeita em falha de REDE. Um 403, um 409, um 500 — todos resolvem
 * normalmente, e quem não confere `res.ok` trata erro como sucesso.
 *
 * Num app de treino isso não é abstrato: o "Feito" e o "Soneca" do Coach Inbox
 * mandavam o POST, ignoravam a resposta e recarregavam a lista. O item sumia da
 * tela e voltava no carregamento seguinte, sem nada dito ao professor — que
 * concluía que o app "esquece". No MESMO arquivo, o "Enviar mensagem" já
 * conferia `res.ok` e mostrava o erro: o defeito era de dois handlers, não do
 * padrão da casa. Corrigido em 27/08/2026.
 *
 * ⚠️ O que este guard NÃO é: uma varredura dos 432 `catch {}` do app. A maioria
 * deles é legítima — limpeza, `localStorage`, telemetria, coisas em que falhar
 * calado é o comportamento certo. O recorte aqui é estreito de propósito:
 * **escrita** (POST/PUT/PATCH/DELETE) cujo resultado ninguém olha. É a fatia em
 * que o silêncio custa dado do usuário.
 *
 * A lista abaixo é RATCHET: só encolhe. Ela congela o que existia quando o
 * guard nasceu, e nenhum caso NOVO entra. Não julguei os 10 um a um — vários
 * podem ser fire-and-forget legítimo (sync do relógio, telemetria). Quem for
 * mexer num deles decide, corrige e tira da lista.
 */
const CONGELADOS: Record<string, number> = {
  'components/settings/AvatarUploadModal.tsx': 2,
  // 'components/WatchSyncProvider.tsx' saiu da lista em 02/09/2026 (auditoria
  // do Watch, D-1/D-5/D-6): os três handlers (check-in, log-set, cardio-save)
  // agora conferem `res.ok`/status antes de comemorar ou desistir.
  'components/NotificationCenter.tsx': 1,
  'components/ExecutionVideoCapture.tsx': 1,
  'components/teacher/TeacherControlModal.tsx': 1,
  'components/teacher/TeacherStudentWorkout.tsx': 1,
  'components/VipHub.tsx': 1,
  'app/(app)/dashboard/schedule/ScheduleClient.tsx': 1,
}

const SRC = join(process.cwd(), 'src')

const listar = (dir: string): string[] =>
  readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? (e.name === '__tests__' ? [] : listar(`${dir}/${e.name}`))
      : /\.tsx$/.test(e.name) ? [`${dir}/${e.name}`] : [],
  )

const arquivos = [...listar('components'), ...listar('app')].map((f) => f.replace(/^\.?\//, ''))

/** Escritas cujo resultado não é conferido, num arquivo. */
const escritasCegas = (src: string): number => {
  let n = 0
  for (const m of src.matchAll(/await\s+fetch\(/g)) {
    const trecho = src.slice(m.index, m.index + 2000)
    if (!/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(trecho.slice(0, 600))) continue
    if (/\.ok\b|\.status\b|res\.json\(\)/.test(trecho.slice(0, 1200))) continue
    n++
  }
  return n
}

describe('escrita confere o resultado', () => {
  it('nenhum arquivo novo manda POST sem olhar a resposta', () => {
    const novos: string[] = []
    for (const rel of arquivos) {
      const n = escritasCegas(readFileSync(join(SRC, rel), 'utf8'))
      const teto = CONGELADOS[rel] ?? 0
      if (n > teto) novos.push(`${rel}: ${n} (teto ${teto})`)
    }
    expect(
      novos,
      '`fetch` só rejeita em falha de REDE — 4xx e 5xx resolvem normalmente. ' +
      'Confira `res.ok` e diga ao usuário quando não salvou.',
    ).toEqual([])
  })

  it('o ratchet só desce — teto que sobra vira dívida fantasma', () => {
    const folgados = Object.entries(CONGELADOS)
      .map(([rel, teto]) => {
        let real = 0
        try { real = escritasCegas(readFileSync(join(SRC, rel), 'utf8')) } catch { real = 0 }
        return { rel, teto, real }
      })
      .filter(({ teto, real }) => real < teto)
    expect(
      folgados.map(({ rel, teto, real }) => `${rel}: teto ${teto}, real ${real}`),
      'já corrigiram — baixe o teto (ou remova a entrada) para o ganho não ser desfeito depois',
    ).toEqual([])
  })
})
