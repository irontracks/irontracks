'use client'

export type TourStep = {
  id: string
  emoji: string
  image?: string
  title: string
  body: string
}

const BASE_STEPS: TourStep[] = [
  {
    id: 'welcome',
    emoji: '🏋️',
    image: '/onboarding-welcome.png',
    title: 'Bem-vindo ao IronTracks!',
    body: 'O app de alta performance para atletas que levam o treino a sério.\n\nEm 60 segundos vamos te mostrar tudo que você pode fazer aqui.',
  },
  {
    id: 'workouts',
    emoji: '💪',
    image: '/onboarding-workout.png',
    title: 'Seus Treinos',
    body: 'Crie fichas personalizadas com exercícios, séries e cargas.\n\nOrganize exatamente do jeito que seu treino precisa.',
  },
  {
    id: 'start',
    emoji: '▶️',
    title: 'Treine em Tempo Real',
    body: 'Toque em "Iniciar treino" para começar. Registre cada série ao vivo — o app conta o descanso automaticamente entre os exercícios.',
  },
  {
    id: 'history',
    emoji: '📈',
    image: '/onboarding-progress.png',
    title: 'Sua Evolução',
    body: 'Cada treino fica salvo no histórico. Veja cargas, volume total e tempo — tudo registrado para você sempre superar o que já fez.',
  },
  {
    id: 'muscle-map',
    emoji: '🦾',
    image: '/onboarding-muscles.png',
    title: 'Mapa Muscular',
    body: 'Visualize quais grupos musculares você treinou essa semana. Identifique grupos esquecidos e equilibre seu volume de treino.',
  },
  {
    id: 'stories',
    emoji: '📸',
    title: 'Stories de Treino',
    body: 'Compartilhe fotos e vídeos das suas sessões. Veja o que outros atletas estão fazendo e se inspire.',
  },
]

const COMMUNITY_STEP: TourStep = {
  id: 'community',
  emoji: '🤝',
  title: 'Iron Lounge',
  body: 'Conecte-se com outros atletas. Curta conquistas, troque experiências e faça parte de uma comunidade de alta performance.',
}

const COACH_STEPS: TourStep[] = [
  {
    id: 'coach-panel',
    emoji: '🎮',
    title: 'Painel de Coach',
    body: 'Sua central de operações. Gerencie todos os seus alunos, crie treinos personalizados e acompanhe a evolução de cada um.',
  },
  {
    id: 'coach-schedule',
    emoji: '📅',
    title: 'Agenda',
    body: 'Organize seus horários e consultas com alunos. Controle sua rotina de personal trainer em um só lugar.',
  },
  {
    id: 'coach-wallet',
    emoji: '💰',
    title: 'Carteira',
    body: 'Recebimentos e status de assinatura dos seus alunos VIP. Visibilidade total sobre o financeiro da sua operação.',
  },
]

const FINAL_STEP: TourStep = {
  id: 'ready',
  emoji: '🚀',
  image: '/onboarding-ready.png',
  title: 'Tudo Pronto!',
  body: 'Agora você conhece o IronTracks.\n\nUse o menu para explorar tudo — e bons treinos! 💪',
}

export function getTourSteps({
  role,
  hasCommunity,
}: {
  role?: unknown
  hasCommunity?: unknown
}): TourStep[] {
  const r = String(role || '').toLowerCase()
  const isCoach = r === 'teacher' || r === 'admin'
  const withCommunity = Boolean(hasCommunity)

  const middle = withCommunity
    ? [...BASE_STEPS.slice(0, 5), COMMUNITY_STEP, BASE_STEPS[5]]
    : BASE_STEPS

  return isCoach
    ? [...middle, ...COACH_STEPS, FINAL_STEP]
    : [...middle, FINAL_STEP]
}
