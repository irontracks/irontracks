import { isWorkoutToday } from '@/utils/workout/workoutDay'

/**
 * A mensagem do briefing das 7h — ago/2026.
 *
 * Até aqui o cron mandava a MESMA string para todo mundo: "Bom dia 🌅 / Vai
 * treinar hoje? Abra o app e responda". Uma pergunta que o app já sabia
 * responder — o treino de hoje está no título ("A - empurrar a (segunda)"),
 * a sequência sai das datas que o cron JÁ carregou para filtrar quem treinou.
 *
 * Notificação genérica é a que o usuário desliga. Esta usa o que já existe.
 *
 * Fica de fora, de propósito: HRV e frequência de repouso. O `RecoveryScore`
 * lê o HealthKit NO DEVICE e nada disso chega ao banco — o servidor não tem
 * como saber a prontidão de ninguém às 7h. Prometer "você está recuperado"
 * daqui seria chute com cara de dado.
 */

export type BriefingInput = {
    /** Títulos dos templates, na ordem do usuário (`sortWorkoutsByOrder`). */
    workoutTitles: string[]
    /** Dias inteiros desde o último treino. `null` = nunca treinou/sem dado. */
    daysSinceLastWorkout: number | null
    /** Sequência atual de dias treinados. */
    currentStreak: number
    /**
     * "Hoje" no fuso de São Paulo. O servidor da Vercel roda em UTC e o dia da
     * semana vira em horários diferentes — depois das 21h BRT, o UTC já está
     * no dia seguinte e o briefing anunciaria o treino errado. Mesma classe de
     * erro do `completed_at` no gerador de dieta.
     */
    now: Date
}

export type BriefingMessage = { title: string; message: string }

/** O que o cron mandava antes — vale quando não há nada de específico a dizer. */
export const BRIEFING_GENERICO: BriefingMessage = {
    title: 'Bom dia 🌅',
    message: 'Vai treinar hoje? Abra o app e responda — se for descansar, ajusto suas calorias do dia.',
}

const AUSENTE_DIAS = 7

/**
 * Converte um instante para uma Date cujo DIA DA SEMANA é o de São Paulo.
 *
 * `isWorkoutToday` compara com `getDay()`, que é o fuso de quem roda — UTC em
 * produção. Ancorar ao meio-dia do dia-calendário BRT dá 12h de folga para
 * qualquer fuso de servidor, então o dia da semana nunca escorrega.
 */
export function diaDaSemanaBrt(now: Date): Date {
    const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000)
    const chave = brt.toISOString().slice(0, 10)
    return new Date(`${chave}T12:00:00.000Z`)
}

export function buildBriefingMessage(input: BriefingInput): BriefingMessage {
    const titulos = (Array.isArray(input?.workoutTitles) ? input.workoutTitles : [])
        .map((t) => String(t || '').trim())
        .filter(Boolean)
    const streak = Number(input?.currentStreak) || 0
    const ausente = Number.isFinite(Number(input?.daysSinceLastWorkout))
        ? Number(input.daysSinceLastWorkout)
        : null

    // Sumido há uma semana vem PRIMEIRO: anunciar "hoje é dia de perna" para
    // quem não aparece há 12 dias ignora o que de fato aconteceu.
    if (ausente != null && ausente >= AUSENTE_DIAS) {
        return {
            title: 'Faz um tempo 👋',
            message: `Seu último treino foi há ${ausente} dias. Que tal voltar hoje, mesmo que leve?`,
        }
    }

    const hoje = diaDaSemanaBrt(input.now)
    const doDia = titulos.find((t) => isWorkoutToday(t, hoje))

    if (doDia) {
        return {
            title: `Hoje: ${doDia}`,
            message: streak >= 3
                ? `${streak} dias seguidos — um toque em Treinar agora mantém a sequência.`
                : 'Está no topo do app: um toque em Treinar agora e você começa.',
        }
    }

    if (streak >= 3) {
        return {
            title: `${streak} dias seguidos 🔥`,
            message: `Não deixe a sequência morrer${ausente === 1 ? ' — você treinou ontem' : ''}.`,
        }
    }

    // Sem treino nomeado por dia e sem sequência: dizer QUAL treino vem a
    // seguir ainda é melhor que perguntar se ele vai treinar.
    if (titulos.length) {
        return {
            title: 'Bom dia 🌅',
            message: `Próximo treino: ${titulos[0]}. Um toque em Treinar agora e você começa.`,
        }
    }

    return BRIEFING_GENERICO
}

/**
 * Sequência e dias-desde-o-último a partir das datas que o cron já buscou.
 * Sem query nova: as linhas de `workouts` dos últimos 30 dias já estão em
 * memória para o filtro de "quem treinou hoje".
 */
export function statsDeDatas(diasTreinados: string[], hojeKey: string): {
    currentStreak: number
    daysSinceLastWorkout: number | null
} {
    const dias = Array.from(new Set(diasTreinados.filter(Boolean))).sort().reverse()
    if (!dias.length) return { currentStreak: 0, daysSinceLastWorkout: null }

    const ms = (k: string) => new Date(`${k}T00:00:00.000Z`).getTime()
    const hoje = ms(hojeKey)
    const ultimo = ms(dias[0])
    const desde = Number.isFinite(hoje) && Number.isFinite(ultimo)
        ? Math.max(0, Math.round((hoje - ultimo) / 86_400_000))
        : null

    // A sequência só conta se vier de ontem ou de hoje: quem parou há 3 dias
    // não tem sequência viva, ainda que tenha treinado 10 dias seguidos antes.
    let streak = 0
    if (desde != null && desde <= 1) {
        let cursor = ultimo
        for (const dia of dias) {
            if (ms(dia) !== cursor) break
            streak += 1
            cursor -= 86_400_000
        }
    }
    return { currentStreak: streak, daysSinceLastWorkout: desde }
}
