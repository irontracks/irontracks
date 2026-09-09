'use client'

import React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

/**
 * As mensagens de status do editor de story — e por que elas precisam ser FIXAS
 * em mobile.
 *
 * Relato do dono (09/09/2026): "quando clico em salvar ele não avisa nada; você
 * pode pensar que não aconteceu nada e clicar mais vezes, e cada clicada salva
 * uma foto". O aviso EXISTIA — `shareImage` grava "Imagem salva no rolo!" desde
 * sempre. O que faltava era ele estar onde o olho está.
 *
 * O mecanismo é o mesmo defeito de 01/09 (relato do Diogo), na outra metade:
 * em mobile a barra de ações é `fixed` no rodapé, mas este bloco continuava no
 * FLUXO do painel, acima dela — ou seja, abaixo da dobra, atrás da prévia que
 * ocupa quase a tela inteira e captura o arraste. O usuário tocava em SALVAR,
 * a confirmação nascia fora da vista, e ele tocava de novo. Cada toque, um
 * arquivo novo no rolo.
 *
 * Por isso o toast é `fixed` logo ACIMA da barra, com z maior que ela. No
 * desktop nada muda: segue empilhado no fim da coluna, que ali está visível.
 *
 * ⚠️ Componente único para os DOIS painéis (`StoryControlPanel` e
 * `NutritionStoryControlPanel`, que serve nutrição, cardio e métricas). O bloco
 * estava duplicado, e foi a duplicação que fez a correção de 01/09 alcançar só
 * um dos dois — está escrito no comentário do próprio painel de nutrição.
 */
export function StoryStatusMessages({ info, error }: { info: string; error: string }) {
    const caixa =
        'max-lg:fixed max-lg:inset-x-3 max-lg:z-[2650] max-lg:bottom-[calc(88px+env(safe-area-inset-bottom))] max-lg:shadow-2xl'

    return (
        <AnimatePresence mode="wait">
            {info && (
                <motion.div
                    role="status"
                    aria-live="polite"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`p-4 rounded-xl bg-emerald-500/10 max-lg:bg-emerald-950/95 max-lg:backdrop-blur border border-emerald-500/20 flex items-center gap-3 ${caixa}`}
                >
                    <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
                    <p className="text-xs font-bold text-emerald-200">{info}</p>
                </motion.div>
            )}
            {error && (
                <motion.div
                    role="alert"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`p-4 rounded-xl bg-red-950/40 max-lg:bg-red-950/95 max-lg:backdrop-blur border border-red-900/50 flex items-center gap-3 ${caixa}`}
                >
                    <AlertCircle size={18} className="text-red-400 shrink-0" />
                    <p className="text-xs font-bold text-red-200">{error}</p>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
