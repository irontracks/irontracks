'use client'

import Link from 'next/link'
import { useId, useState, type KeyboardEvent } from 'react'
import { motion } from 'framer-motion'
import {
  anualPorMes,
  formatarBRL,
  mesesGratis,
  porAluno,
  type PlanoVip,
  type PlanosPublicos,
  type TierProfessor,
} from '@/lib/planos/publicos'
import { APP } from './links'
import { ArrowIcon, CheckIcon, DashIcon } from './icons'
import { surgir } from './motion'
import SectionHeader from './SectionHeader'

/**
 * Seção de planos da landing.
 *
 * NENHUM valor é digitado aqui: nome, preço e linhas vêm de `planos`, lido de
 * `app_plans`/`teacher_tiers` por `lerPlanosPublicos` (guard:
 * `landingPrecosDoBanco.test.ts`). O que mora neste arquivo é só apresentação:
 * qual cartão leva destaque e o texto dos botões.
 *
 * Duas abas porque são dois públicos com dois preços: quem treina (VIP) e o
 * personal que atende alunos. O anual existe só na web — na App Store os
 * produtos são mensais (conferido em 30/09/2026) — e a nota abaixo diz isso.
 */

type Aba = 'vip' | 'professores'

const ABAS: readonly { id: Aba; rotulo: string }[] = [
  { id: 'vip', rotulo: 'Para treinar' },
  { id: 'professores', rotulo: 'Para professores' },
]

/** Destaque é decisão de apresentação, não dado de preço. */
const PROFESSOR_EM_DESTAQUE = 'pro'

export default function Pricing({ planos }: { planos: PlanosPublicos }) {
  const base = useId()
  const [aba, setAba] = useState<Aba>('vip')

  const aoTeclar = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    setAba((a) => (a === 'vip' ? 'professores' : 'vip'))
  }

  return (
    <section id="planos" className="relative scroll-mt-20 py-24 md:py-32">
      <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-24 h-80 w-[min(90vw,44rem)] -translate-x-1/2 rounded-full bg-gold/10 blur-[130px]" />
      <div className="relative mx-auto max-w-6xl px-5">
        <SectionHeader
          centralizar
          eyebrow="planos"
          titulo={
            <>
              Comece de graça. <span className="lp-gold-text">Evolua quando quiser.</span>
            </>
          }
          texto="Crie a conta e ganhe 14 dias de VIP Pro, sem cartão. Depois escolha o plano que cabe no seu treino."
        />

        <motion.div {...surgir} className="mt-10 flex justify-center">
          <div
            role="tablist"
            aria-label="Tipo de plano"
            onKeyDown={aoTeclar}
            className="relative inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1"
          >
            {ABAS.map((a) => {
              const ativa = aba === a.id
              return (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  id={`${base}-aba-${a.id}`}
                  aria-selected={ativa}
                  aria-controls={`${base}-painel-${a.id}`}
                  tabIndex={ativa ? 0 : -1}
                  onClick={() => setAba(a.id)}
                  className={`relative flex h-11 items-center rounded-full px-5 text-sm font-semibold transition-colors sm:px-7 ${
                    ativa ? 'text-black' : 'text-white/70 hover:text-white'
                  }`}
                >
                  {ativa && (
                    <motion.span
                      layoutId={`${base}-aba-ativa`}
                      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                      className="absolute inset-0 rounded-full bg-gold"
                    />
                  )}
                  <span className="relative">{a.rotulo}</span>
                </button>
              )
            })}
          </div>
        </motion.div>

        {aba === 'vip' ? (
          <div role="tabpanel" id={`${base}-painel-vip`} aria-labelledby={`${base}-aba-vip`}>
            <PainelVip vip={planos.vip} base={base} />
          </div>
        ) : (
          <div role="tabpanel" id={`${base}-painel-professores`} aria-labelledby={`${base}-aba-professores`}>
            <PainelProfessores tiers={planos.professores} />
          </div>
        )}
      </div>
    </section>
  )
}

/* ───────────────────────────── VIP ───────────────────────────── */

function PainelVip({ vip, base }: { vip: PlanoVip[]; base: string }) {
  const temAnual = vip.every((p) => p.anualCentavos != null)
  const [anual, setAnual] = useState(false)
  const modoAnual = temAnual && anual
  const desconto = temAnual ? Math.min(...vip.map((p) => mesesGratis(p.mensalCentavos, p.anualCentavos))) : 0
  const usoJusto = vip.some((p) => p.usoJusto)

  return (
    <div>
      {temAnual && (
        <div className="mt-8 flex justify-center">
          <div role="group" aria-label="Periodicidade" className="relative inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
            {[
              { valor: false, rotulo: 'Mensal' },
              { valor: true, rotulo: desconto > 0 ? `Anual · ${desconto} meses grátis` : 'Anual' },
            ].map((o) => {
              const ativo = anual === o.valor
              return (
                <button
                  key={o.rotulo}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setAnual(o.valor)}
                  className={`relative flex h-11 items-center rounded-full px-4 text-[13px] font-semibold transition-colors sm:px-5 ${
                    ativo ? 'text-black' : 'text-white/70 hover:text-white'
                  }`}
                >
                  {ativo && (
                    <motion.span
                      layoutId={`${base}-periodo-ativo`}
                      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                      className="absolute inset-0 rounded-full bg-white"
                    />
                  )}
                  <span className="relative">{o.rotulo}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <ul className={`${temAnual ? 'mt-8' : 'mt-12'} grid gap-5 md:grid-cols-3`}>
        {vip.map((p, i) => (
          <CartaoVip key={p.tier} plano={p} anual={modoAnual} ordem={i} />
        ))}
      </ul>

      <div className="mx-auto mt-8 max-w-2xl space-y-2 text-center text-[13px] leading-relaxed text-white/60">
        {usoJusto && <p>* Uso ilimitado sujeito à política de uso justo.</p>}
        {temAnual && (
          <p>No iPhone a assinatura é mensal, cobrada pela App Store. O plano anual é contratado pela web.</p>
        )}
      </div>
    </div>
  )
}

function CartaoVip({ plano, anual, ordem }: { plano: PlanoVip; anual: boolean; ordem: number }) {
  const destaque = plano.destaque
  const valor = anual && plano.anualCentavos != null ? plano.anualCentavos : plano.mensalCentavos
  const preco = formatarBRL(valor, anual)

  return (
    <motion.li
      initial={{ opacity: 0, y: 36 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1], delay: ordem * 0.09 }}
      className={`relative flex flex-col rounded-[28px] p-7 ${
        destaque ? 'lp-gold-border' : 'border border-white/10 bg-ink-2'
      }`}
    >
      {destaque && (
        <p className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-3.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-black">
          Mais escolhido
        </p>
      )}

      <h3 className="font-display text-xl font-bold tracking-[-0.01em]">{plano.nome}</h3>

      <div className="mt-5 flex items-baseline gap-1.5">
        <motion.span
          key={preco}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28 }}
          className={`font-display text-[2.6rem] font-bold leading-none tracking-[-0.03em] ${destaque ? 'lp-gold-text' : ''}`}
        >
          {preco}
        </motion.span>
        <span className="text-sm text-white/60">{anual ? '/ano' : '/mês'}</span>
      </div>
      <p className="mt-2 min-h-5 text-[13px] text-white/60">
        {anual && plano.anualCentavos != null
          ? `equivale a ${formatarBRL(anualPorMes(plano.anualCentavos))} por mês`
          : plano.anualCentavos != null
            ? `ou ${formatarBRL(plano.anualCentavos, true)} por ano`
            : ''}
      </p>

      <ul className="mt-6 space-y-3 border-t border-white/10 pt-6">
        {plano.linhas.map((l) => (
          <li key={l.rotulo} className={`flex items-start gap-3 text-[15px] ${l.incluido ? 'text-white/90' : 'text-white/55'}`}>
            {l.incluido ? (
              <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-gold" />
            ) : (
              <DashIcon className="mt-1 h-4 w-4 shrink-0 text-white/55" />
            )}
            <span>
              {l.rotulo}
              {l.valor && <span className="text-white/60">{' · '}{l.valor}</span>}
              {!l.incluido && <span className="sr-only"> (não incluso)</span>}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-8">
        <Link
          href={APP}
          className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-semibold transition-transform hover:-translate-y-0.5 ${
            destaque ? 'bg-gold text-black' : 'border border-white/15 bg-white/[0.04] text-white hover:bg-white/10'
          }`}
        >
          {destaque ? 'Testar 14 dias grátis' : 'Criar conta grátis'}
          <ArrowIcon className="h-4 w-4" />
        </Link>
      </div>
    </motion.li>
  )
}

/* ─────────────────────────── Professores ─────────────────────────── */

function PainelProfessores({ tiers }: { tiers: TierProfessor[] }) {
  return (
    <div>
      <p className="mx-auto mt-8 max-w-2xl text-center text-lg leading-relaxed text-white/70">
        Prescreva treinos, acompanhe a execução em tempo real e cobre seus alunos no mesmo lugar. O plano cresce com a
        sua carteira.
      </p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {tiers.map((t, i) => (
          <CartaoProfessor key={t.chave} tier={t} ordem={i} destaque={t.chave === PROFESSOR_EM_DESTAQUE} />
        ))}
      </ul>

      <p className="mt-6 flex flex-wrap items-center justify-center gap-x-1 text-[13px] text-white/60">
        Valores mensais.
        <Link
          href="/para-professores"
          className="inline-flex min-h-11 items-center px-2 font-semibold text-gold underline-offset-4 hover:underline"
        >
          Conhecer a área do professor
        </Link>
      </p>
    </div>
  )
}

function CartaoProfessor({ tier, ordem, destaque }: { tier: TierProfessor; ordem: number; destaque: boolean }) {
  const gratis = tier.precoCentavos === 0
  const porCabeca = porAluno(tier)

  return (
    <motion.li
      initial={{ opacity: 0, y: 32 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: ordem * 0.07 }}
      className={`relative flex flex-col rounded-3xl p-6 ${destaque ? 'lp-gold-border' : 'border border-white/10 bg-ink-2'}`}
    >
      {destaque && (
        <p className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-gold px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-black">
          Mais popular
        </p>
      )}
      <h3 className="font-display text-lg font-bold">{tier.nome}</h3>

      <p className={`mt-4 font-display text-[2rem] font-bold leading-none tracking-[-0.03em] ${destaque ? 'lp-gold-text' : ''}`}>
        {gratis ? 'Grátis' : formatarBRL(tier.precoCentavos, true)}
        {!gratis && <span className="ml-1 font-sans text-sm font-normal tracking-normal text-white/60">/mês</span>}
      </p>

      <p className="mt-5 flex items-center gap-2.5 text-[15px] font-semibold text-white/90">
        <CheckIcon className="h-4 w-4 shrink-0 text-gold" />
        {tier.maxAlunos == null ? 'Alunos ilimitados' : `Até ${tier.maxAlunos} alunos`}
      </p>
      <p className="mt-2 min-h-5 text-[13px] text-white/60">
        {porCabeca != null ? `${formatarBRL(porCabeca)} por aluno com o plano cheio` : ''}
      </p>
      {tier.descricao && <p className="mt-4 text-sm leading-relaxed text-white/60">{tier.descricao}</p>}

      <div className="mt-auto pt-6">
        <Link
          href={APP}
          className={`inline-flex h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold transition-transform hover:-translate-y-0.5 ${
            destaque ? 'bg-gold text-black' : 'border border-white/15 bg-white/[0.04] text-white hover:bg-white/10'
          }`}
        >
          {gratis ? 'Começar grátis' : 'Começar'}
        </Link>
      </div>
    </motion.li>
  )
}
