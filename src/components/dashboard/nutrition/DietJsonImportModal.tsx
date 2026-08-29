'use client'

/**
 * DietJsonImportModal — trazer a dieta do nutricionista sem gastar IA.
 *
 * É a porta de entrada GRÁTIS da dieta: o parsing é local (`importDietJson.ts`),
 * então o app não paga nada e o recurso não precisa de gate VIP — decisão do
 * dono em 29/08/2026. Ler o PDF pelo nosso Gemini seria outra história, e é por
 * isso que este caminho existe: a pessoa pede a conversão para o assistente que
 * ela já usa e cola o resultado aqui.
 *
 * O gate é mais frouxo que o de GERAR de propósito: gerar exige meta salva e o
 * dia de hoje; importar não depende de nenhum dos dois.
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { ClipboardPaste, Check, AlertTriangle, Copy } from 'lucide-react'
import { FullscreenPortal } from '@/components/stories/FullscreenPortal'
import { useFocusTrap } from '@/hooks/useFocusTrap'
import { useBackHandler } from '@/hooks/useBackHandler'
import { backdropProps, dialogProps } from '@/utils/a11y/backdrop'
import { codeFieldProps } from '@/utils/ui/textFieldProps'
import { importarDietaDeJson, resumoDoImport, type PayloadDeImport, type TabelaDeAlimentos } from '@/lib/nutrition/importDietJson'
import { loadTacoFoods } from '@/lib/nutrition/sources/taco-source'
import { createClient } from '@/utils/supabase/client'

/** O texto que a pessoa leva ao assistente dela. É o produto tanto quanto o parser. */
export const PROMPT_DE_CONVERSAO = `Converta a dieta em anexo para JSON EXATAMENTE neste formato, sem texto em volta e sem crases:

{
  "planName": "Dieta do nutricionista",
  "meals": [
    {
      "name": "Café da manhã",
      "time": "07:00",
      "items": [
        { "food": "Ovo mexido", "grams": 120, "calories": 180, "protein": 13, "carbs": 1, "fat": 13 }
      ]
    }
  ]
}

Se a dieta tiver dias diferentes, troque "meals" por "days":
[{ "weekday": 1, "meals": [...] }] — 0 é domingo, 1 segunda, e assim por diante.
Use gramas e macros por porção. Se algum macro não estiver no documento, use 0.`

interface Props {
    open: boolean
    onClose: () => void
    /** Chamado após salvar, para a tela recarregar o plano. */
    onImported: () => void
}

export default function DietJsonImportModal({ open, onClose, onImported }: Props) {
    const [texto, setTexto] = useState('')
    const [erro, setErro] = useState<string | null>(null)
    const [salvando, setSalvando] = useState(false)
    const [copiado, setCopiado] = useState(false)
    // A TACO (590 alimentos no banco) complementa a base local (~200, curada).
    // Sem ela, alimento fora da base local entra com macro zerado — e a base
    // local existe para o que o brasileiro digita, não para cobrir tudo.
    const [taco, setTaco] = useState<TabelaDeAlimentos | undefined>()
    const focusTrapRef = useFocusTrap(open, onClose)
    useBackHandler(open, onClose)
    const areaId = useId()
    const timerCopia = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        if (!open) { setTexto(''); setErro(null); setSalvando(false) }
    }, [open])

    // Carrega uma vez, ao abrir. Falha aqui não impede o import: sem a TACO o
    // parser usa só a base local, que é o comportamento anterior.
    useEffect(() => {
        if (!open || taco) return
        let cancelado = false
        void (async () => {
            try {
                const tabela = await loadTacoFoods(createClient())
                if (!cancelado && Object.keys(tabela).length) setTaco(tabela)
            } catch {
                /* segue com a base local */
            }
        })()
        return () => { cancelado = true }
    }, [open, taco])

    useEffect(() => () => { if (timerCopia.current) clearTimeout(timerCopia.current) }, [])

    // A prévia é derivada do texto — nada de estado paralelo que envelhece
    // quando a pessoa edita o JSON depois de conferir.
    const analise = useMemo(() => (texto.trim() ? importarDietaDeJson(texto, taco) : null), [texto, taco])
    const payload: PayloadDeImport | null = analise?.ok ? analise.payload : null
    const resumo = payload ? resumoDoImport(payload) : null

    const copiarPrompt = async () => {
        try {
            await navigator.clipboard.writeText(PROMPT_DE_CONVERSAO)
            setCopiado(true)
            if (timerCopia.current) clearTimeout(timerCopia.current)
            timerCopia.current = setTimeout(() => setCopiado(false), 2000)
        } catch {
            // Sem permissão de área de transferência: o texto está na tela e
            // pode ser selecionado à mão. Não é motivo para alarme.
        }
    }

    const salvar = async () => {
        if (!payload || salvando) return
        setSalvando(true)
        setErro(null)
        try {
            const res = await fetch('/api/nutrition/diet-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            })
            const json = await res.json().catch(() => null)
            if (!res.ok || !json?.ok) {
                setErro(
                    json?.error === 'rate_limited'
                        ? 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'
                        : 'Não consegui salvar o plano. Confira o JSON e tente de novo.',
                )
                return
            }
            onImported()
            onClose()
        } catch {
            setErro('Sem conexão para salvar agora. Tente de novo em instantes.')
        } finally {
            setSalvando(false)
        }
    }

    if (!open) return null

    return (
        // Portal obrigatório: a Nutrição é um overlay `fixed ... z-[25]` e quem
        // nasce dentro dela herda o stacking context (o z-[1600] vale 25) e o
        // containing block (o `fixed` rola junto e o topo sai da tela). Guard em
        // `__tests__/overlayPrecisaDePortal.test.ts`, que pegou este modal.
        <FullscreenPortal>
        <div className="fixed inset-0 z-[1600] flex items-end justify-center sm:items-center" {...dialogProps('Importar dieta por JSON')}>
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" {...backdropProps(onClose)} />
            <div
                ref={focusTrapRef}
                className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl border border-white/[0.08] bg-neutral-950 p-4 pb-safe sm:rounded-3xl"
            >
                <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                        <h2 className="text-base font-bold text-white">Importar dieta</h2>
                        <p className="mt-0.5 text-xs text-neutral-400">
                            Cole o JSON da sua dieta. Não usa IA do app — é de graça.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="tap-44 shrink-0 rounded-xl border border-white/[0.08] px-3 py-2 text-xs font-semibold text-neutral-300 hover:text-white"
                    >
                        Fechar
                    </button>
                </div>

                {/* O prompt pronto vem ANTES do campo: quem abre isto normalmente
                    ainda não tem o JSON — tem o PDF do nutricionista. */}
                <div className="mb-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-neutral-300">
                            Não tem o JSON? Leve isto ao ChatGPT com a sua dieta
                        </span>
                        <button
                            type="button"
                            onClick={copiarPrompt}
                            className="tap-44 flex shrink-0 items-center gap-1.5 rounded-lg border border-yellow-500/30 px-2.5 py-1.5 text-[11px] font-bold text-yellow-400"
                        >
                            {copiado ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                            {copiado ? 'Copiado' : 'Copiar'}
                        </button>
                    </div>
                </div>

                <label htmlFor={areaId} className="mb-1.5 block text-xs font-semibold text-neutral-300">
                    JSON da dieta
                </label>
                <textarea
                    id={areaId}
                    value={texto}
                    onChange={(e) => { setTexto(e.target.value); setErro(null) }}
                    placeholder='{"meals":[{"name":"Café da manhã","items":[...]}]}'
                    rows={7}
                    // JSON é código: a autocorreção do teclado renomearia os
                    // campos e quebraria o parse (ver utils/ui/textFieldProps).
                    {...codeFieldProps}
                    className="w-full rounded-2xl border border-white/[0.08] bg-black/40 p-3 font-mono text-xs text-neutral-200 outline-none focus:border-yellow-500/40"
                />

                {/* Diagnóstico: erro do parser, ou a prévia do que vai entrar. */}
                {analise && !analise.ok && (
                    <p className="mt-2 flex items-start gap-2 text-xs text-red-300">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                        {analise.erro}
                    </p>
                )}

                {analise?.ok && resumo && (
                    <div className="mt-3 rounded-2xl border border-green-500/20 bg-green-500/[0.06] p-3">
                        <p className="text-xs font-bold text-green-300">
                            {resumo.dias > 1 ? `${resumo.dias} dias` : '1 dia'} · {resumo.refeicoes} refeições · {resumo.alimentos} alimentos
                        </p>
                        <p className="mt-1 text-xs text-neutral-300">
                            Média de <strong className="text-white">{resumo.kcal} kcal</strong> por dia.
                        </p>
                        {analise.avisos.map((a) => (
                            <p key={a} className="mt-1.5 text-[11px] text-yellow-200">{a}</p>
                        ))}
                        {/* A rota ARQUIVA o plano próprio ativo antes de inserir.
                            Quem está trocando de dieta precisa saber disso antes
                            de tocar, não depois. */}
                        <p className="mt-2 text-[11px] text-neutral-400">
                            Isto substitui o seu plano atual. O anterior fica no histórico.
                        </p>
                    </div>
                )}

                {erro && <p className="mt-2 text-xs text-red-300">{erro}</p>}

                <button
                    type="button"
                    onClick={salvar}
                    disabled={!payload || salvando}
                    className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-yellow-500 text-sm font-bold text-black transition active:scale-[0.98] disabled:opacity-40"
                >
                    <ClipboardPaste size={16} aria-hidden="true" />
                    {salvando ? 'Salvando…' : 'Usar esta dieta'}
                </button>
            </div>
        </div>
        </FullscreenPortal>
    )
}
