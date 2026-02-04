export type VipPlaybook = {
  id: string
  title: string
  description: string
  mode: 'coach' | 'planner' | 'diagnostic'
  prompt: string
}

export const vipPlaybooks: VipPlaybook[] = [
  {
    id: 'hypertrophy-4x',
    title: 'Hipertrofia 4x/sem',
    description: 'Bloco de 4 semanas com progressão simples e sustentável.',
    mode: 'planner',
    prompt: 'Crie um bloco de 4 semanas para hipertrofia (4x/semana). Use progressão e um deload opcional.',
  },
  {
    id: 'strength-3x',
    title: 'Força 3x/sem',
    description: 'Foco em força com volume controlado e recuperação.',
    mode: 'planner',
    prompt: 'Crie um bloco de 6 semanas para força (3x/semana) com progressão e deload.',
  },
  {
    id: 'plateau-fix',
    title: 'Destravar platô',
    description: 'Diagnóstico de causa raiz e plano de ação em 3 passos.',
    mode: 'diagnostic',
    prompt: 'Meu progresso travou nas últimas 4 semanas. Gere 3 hipóteses e um plano de ação priorizado.',
  },
  {
    id: 'fatigue-management',
    title: 'Gestão de fadiga',
    description: 'Ajustes de volume/intensidade sem perder performance.',
    mode: 'diagnostic',
    prompt: 'Estou com fadiga alta. Ajuste meu volume semanal e escolha um protocolo de deload se necessário.',
  },
  {
    id: 'today-workout',
    title: 'Treino de hoje',
    description: 'Sugestão prática do que executar hoje.',
    mode: 'coach',
    prompt: 'Sugira meu treino de hoje com base no que fiz por último e nos meus check-ins.',
  },
  {
    id: 'warmup-template',
    title: 'Aquecimento inteligente',
    description: 'Aquecimento específico para o treino do dia.',
    mode: 'coach',
    prompt: 'Crie um aquecimento completo e específico para o meu treino de hoje (mobilidade + séries de aproximação).',
  },
]

