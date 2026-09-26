/**
 * Os 15 reels "IronTracks 15 Funções" (Instagram, set/2026), um por função.
 *
 * Os vídeos são os renders originais (4K, feitos com Remotion) convertidos para
 * a web: 540×960, H.264, SEM ÁUDIO — a trilha dos reels pode ser licenciada só
 * para o Instagram, e no site eles tocam mudos, em loop.
 *
 * Os textos descrevem o que cada reel mostra. Nada aqui promete o que o app não
 * faz: a periodização é VIP e diz isso no nome.
 */

export type Categoria = 'treino' | 'evolucao' | 'nutricao' | 'social'

export interface Reel {
  dia: number
  slug: string
  titulo: string
  resumo: string
  categoria: Categoria
}

export const REELS: Reel[] = [
  { dia: 1, slug: 'dia01', titulo: 'Treino montado por IA', resumo: 'Responda 4 perguntas e a IA monta o treino inteiro pra você.', categoria: 'treino' },
  { dia: 2, slug: 'dia02', titulo: 'Troca inteligente de exercício', resumo: 'Aparelho ocupado? O app sugere a troca que trabalha o mesmo músculo.', categoria: 'treino' },
  { dia: 3, slug: 'dia03', titulo: 'Calculadora de anilhas', resumo: 'Diga o peso e veja quais anilhas colocar de cada lado da barra.', categoria: 'treino' },
  { dia: 4, slug: 'dia04', titulo: 'Relatório pós-treino', resumo: 'Esforço, satisfação e dor entram no relatório, com dicas quando precisa.', categoria: 'evolucao' },
  { dia: 5, slug: 'dia05', titulo: 'Métodos avançados', resumo: 'Drop-set, rest-pause, cluster e bi-set com registro próprio de cada método.', categoria: 'treino' },
  { dia: 6, slug: 'dia06', titulo: 'Story do treino', resumo: 'Estilos de cor prontos, com os números do seu treino, pra postar.', categoria: 'social' },
  { dia: 7, slug: 'dia07', titulo: 'Cardio com GPS', resumo: 'Rota, distância e ritmo ao vivo no mapa, do começo ao fim.', categoria: 'social' },
  { dia: 8, slug: 'dia08', titulo: 'Avaliação física', resumo: 'Protocolo Jackson & Pollock de 7 dobras, medido em milímetros.', categoria: 'evolucao' },
  { dia: 9, slug: 'dia09', titulo: 'Descanso cronometrado', resumo: 'O descanso começa sozinho, com o tempo certo de cada exercício.', categoria: 'treino' },
  { dia: 10, slug: 'dia10', titulo: 'Iron Rank', resumo: 'Cada quilo conta: todo peso levantado soma no seu total.', categoria: 'evolucao' },
  { dia: 11, slug: 'dia11', titulo: 'Treino Express', resumo: 'De 15 a 45 minutos, corpo todo ou por grupo, na academia ou em casa.', categoria: 'treino' },
  { dia: 12, slug: 'dia12', titulo: 'Ficha de papel vira treino', resumo: 'Tire uma foto da ficha e ela vira treino dentro do app.', categoria: 'treino' },
  { dia: 13, slug: 'dia13', titulo: 'Chat do exercício', resumo: 'Toque no ? do exercício e tire dúvidas no meio do treino.', categoria: 'treino' },
  { dia: 14, slug: 'dia14', titulo: 'Plano alimentar', resumo: 'Calorias e proteína do dia, montadas com o que você já come.', categoria: 'nutricao' },
  { dia: 15, slug: 'dia15', titulo: 'Periodização VIP', resumo: 'Programas de 4, 6 ou 8 semanas, com progressão linear ou ondulatória.', categoria: 'evolucao' },
]

export const CATEGORIAS: { id: Categoria | 'todas'; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'treino', rotulo: 'Treino' },
  { id: 'evolucao', rotulo: 'Evolução' },
  { id: 'nutricao', rotulo: 'Nutrição' },
  { id: 'social', rotulo: 'Cardio & social' },
]

export const reelPorSlug = (slug: string): Reel => {
  const r = REELS.find((x) => x.slug === slug)
  if (!r) throw new Error(`reel desconhecido: ${slug}`)
  return r
}

export const videoDo = (slug: string) => `/landing/reels/${slug}.mp4`
export const capaDo = (slug: string) => `/landing/reels/${slug}.jpg`

/** Versão maior (720p) só para o destaque do topo. */
export const HERO_VIDEO = '/landing/reels/hero-dia01-720.mp4'
export const HERO_CAPA = '/landing/reels/hero-dia01-720.jpg'

export const diaRotulo = (dia: number) => `Dia ${String(dia).padStart(2, '0')}`
