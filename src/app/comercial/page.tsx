import type { Metadata } from 'next'
import ComercialContent from './ComercialContent'

export const metadata: Metadata = {
  title: 'IronTracks — O app de treino que funciona de verdade',
  description: 'Treinos avançados, Coach IA, Cardio GPS, Diário Nutricional e comunidade. Gratuito para iOS, Android e Web.',
  openGraph: {
    title: 'IronTracks — Alta Performance. Resultados Reais.',
    description: 'Monitore cargas, bata recordes, treine com IA. Grátis na App Store e Google Play.',
    url: 'https://irontracks.com.br/comercial',
    images: [{ url: '/logo-irontracks.png' }],
  },
}

export default function ComercialPage() {
  return <ComercialContent />
}
