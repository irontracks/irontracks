/**
 * A tela de controle do professor não pode voltar para "carregando" sozinha.
 *
 * INCIDENTE (12/09/2026, relatado pelo dono controlando um treino REAL): "aqui
 * a tela fica piscando a cada 5 segundos". A cadeia, medida no código:
 *
 *   1. o aluno (ou o próprio patch do professor) escreve na sessão;
 *   2. o Realtime avisa o `useTeacherStudentSessions`, que faz
 *      `setActiveMap(prev => ({ ...prev, [uid]: {...} }))` — objeto NOVO sempre;
 *   3. o `TeacherControlHost` re-renderiza e criava uma `getAuthHeaders` NOVA
 *      (nascia no corpo do componente, sem `useCallback`);
 *   4. essa identidade nova estava nas deps do efeito de CARGA do
 *      `useTeacherControl`, que re-executava e chamava `setIsLoading(true)`;
 *   5. a tela inteira do controle virava "carregando" e voltava.
 *
 * ⚠️ O `useTeacherControl` JÁ TINHA o padrão certo — ler a função por ref — num
 * outro efeito do mesmo arquivo. Era lapso, não desenho: o irmão que acertou
 * estava vinte linhas abaixo.
 *
 * Este guard trava as DUAS pontas. Uma sozinha corrige o sintoma de hoje e
 * deixa a armadilha viva para o próximo componente que passar uma função
 * instável — e função instável é o default em React, não a exceção.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const raiz = process.cwd()
const ler = (rel: string) => readFileSync(path.join(raiz, rel), 'utf8')

/** Comentário não é código: sem isto o guard acusa a própria explicação (jeito nº 2). */
const semComentarios = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const HOOK = 'src/hooks/useTeacherControl.ts'
const HOST = 'src/components/teacher/TeacherControlHost.tsx'

describe('o efeito de carga não reage à identidade da função de auth', () => {
    const hook = semComentarios(ler(HOOK))

    it('a carga depende SÓ do aluno', () => {
        // O efeito que chama `setIsLoading(true)` é o que apaga a tela. Se algo
        // além do aluno entrar nas deps dele, a tela volta a piscar.
        const i = hook.indexOf('setIsLoading(true)')
        expect(i, 'o efeito de carga sumiu do hook').toBeGreaterThan(0)
        const depoisDaCarga = hook.slice(i)
        const primeiraDep = depoisDaCarga.match(/\}, \[([^\]]*)\]\)/)
        expect(primeiraDep, 'não achei o array de deps do efeito de carga').toBeTruthy()
        expect(
            (primeiraDep?.[1] ?? '').trim(),
            'o efeito que mostra "carregando" só pode reagir à troca de ALUNO. ' +
            'Qualquer função vinda por prop tem identidade nova a cada render do pai, ' +
            'e isso faz a tela do controle voltar para o estado de carga sozinha.',
        ).toBe('studentUserId')
    })

    it('a auth é lida por REF dentro da carga', () => {
        expect(
            hook,
            'a carga precisa chamar `getAuthHeadersRef.current()` — chamar a prop direto ' +
            'obriga a pô-la nas deps, que é exatamente o defeito.',
        ).toMatch(/getAuthHeadersRef\.current\(\)/)
    })
})

describe('o host não cria função nova a cada render', () => {
    const host = semComentarios(ler(HOST))

    it('getAuthHeaders é memoizada', () => {
        expect(
            host,
            '`getAuthHeaders` sem useCallback nasce a cada render do host — e o host ' +
            're-renderiza a cada evento Realtime da sessão do aluno.',
        ).toMatch(/const getAuthHeaders = useCallback\(/)
    })

    it('e ela é declarada ACIMA do early return (Rules of Hooks)', () => {
        const hookPos = host.indexOf('const getAuthHeaders = useCallback(')
        const earlyReturn = host.indexOf('if (!controlTarget || !supabase) return null')
        expect(hookPos).toBeGreaterThan(0)
        expect(earlyReturn).toBeGreaterThan(0)
        expect(
            hookPos < earlyReturn,
            'hook depois de early return quebra a ordem dos hooks — armadilha que este ' +
            'repo já registrou e que eu repeti ao escrever esta própria correção.',
        ).toBe(true)
    })
})
