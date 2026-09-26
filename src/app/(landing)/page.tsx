import type { Metadata } from 'next'
import Landing from './_components/Landing'

export const metadata: Metadata = {
  title: 'IronTracks — O app de treino que funciona de verdade',
  description:
    'A IA monta o treino, o descanso corre sozinho e cada quilo vira progresso. Métodos avançados, cardio com GPS e plano alimentar. Grátis para baixar no iPhone, Android e navegador.',
  openGraph: {
    title: 'IronTracks — Pare de treinar feito amador.',
    description: 'Veja as 15 funções do app em ação. Grátis para baixar.',
    url: 'https://irontracks.com.br',
  },
}

export default function Page() {
  return <Landing />
}
