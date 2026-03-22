'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Zap, X, Heart, Flame, TrendingUp, Trophy } from 'lucide-react'

/* ──────────────────────────────────────────────────────────
 * MotivationalPushCard
 *
 * Feature 15: Push Motivacional AI
 * Shows contextual motivational messages based on user
 * activity patterns. Client-side for instant display.
 * ────────────────────────────────────────────────────────── */

interface MotivationalPushCardProps {
  daysSinceLastTraining: number
  weeklySessionCount: number
  currentStreak: number
  userName?: string
}

interface MotivationMessage {
  text: string
  emoji: string
  type: 'comeback' | 'streak' | 'goal' | 'celebrate'
  icon: React.ElementType
}

function getMotivation(
  days: number,
  weeklySessions: number,
  streak: number,
  name: string,
): MotivationMessage {
  const firstName = name.split(' ')[0] || 'Atleta'

  // Comeback messages (inactive)
  if (days >= 7) {
    return {
      text: `${firstName}, já faz ${days} dias desde o último treino. Seu corpo sente falta! Um treino hoje pode ser o recomeço. 💪`,
      emoji: '🔥',
      type: 'comeback',
      icon: Flame,
    }
  }
  if (days >= 4) {
    return {
      text: `${firstName}, ${days} dias off é muito! Lembre: consistência > intensidade. Bora voltar? 🎯`,
      emoji: '⚡',
      type: 'comeback',
      icon: Zap,
    }
  }
  if (days >= 3) {
    return {
      text: `Hey ${firstName}! 3 dias sem treinar. Um treino leve hoje mantém o ritmo. 🏃‍♂️`,
      emoji: '💪',
      type: 'comeback',
      icon: Heart,
    }
  }

  // Streak celebration
  if (streak >= 30) {
    return {
      text: `INCRÍVEL! ${streak} dias seguidos treinando. Você é uma máquina, ${firstName}! 🏆`,
      emoji: '🏆',
      type: 'celebrate',
      icon: Trophy,
    }
  }
  if (streak >= 14) {
    return {
      text: `${streak} dias de streak! Você está construindo algo épico, ${firstName}. Não pare agora!`,
      emoji: '🔥',
      type: 'streak',
      icon: Flame,
    }
  }
  if (streak >= 7) {
    return {
      text: `1 semana de streak! ${firstName}, isso já é hábito. Continue! 📈`,
      emoji: '📈',
      type: 'streak',
      icon: TrendingUp,
    }
  }

  // Weekly session encouragement
  if (weeklySessions >= 5) {
    return {
      text: `${weeklySessions} treinos essa semana! Descanse bem hoje, ${firstName}. Recuperação = ganhos. 💤`,
      emoji: '💪',
      type: 'goal',
      icon: Heart,
    }
  }
  if (weeklySessions >= 3) {
    return {
      text: `Boa semana, ${firstName}! ${weeklySessions} sessões. Mais uma e você fecha com chave de ouro! 🎯`,
      emoji: '⚡',
      type: 'goal',
      icon: Zap,
    }
  }

  // Default motivation
  return {
    text: `Cada treino conta. Bora, ${firstName}! O melhor momento pra treinar é agora. 🔥`,
    emoji: '🔥',
    type: 'goal',
    icon: Flame,
  }
}

export default function MotivationalPushCard({
  daysSinceLastTraining,
  weeklySessionCount,
  currentStreak,
  userName = 'Atleta',
}: MotivationalPushCardProps) {
  const [dismissed, setDismissed] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 300)
    return () => clearTimeout(timer)
  }, [])

  if (dismissed) return null

  const msg = getMotivation(daysSinceLastTraining, weeklySessionCount, currentStreak, userName)
  const IconComponent = msg.icon

  const bgGradient = msg.type === 'comeback'
    ? 'from-red-950/40 to-orange-950/30 border-red-500/20'
    : msg.type === 'celebrate'
      ? 'from-yellow-950/40 to-amber-950/30 border-yellow-500/20'
      : msg.type === 'streak'
        ? 'from-orange-950/40 to-amber-950/30 border-orange-500/20'
        : 'from-violet-950/40 to-blue-950/30 border-violet-500/20'

  return (
    <div
      className={`rounded-2xl bg-gradient-to-r ${bgGradient} border overflow-hidden transition-all duration-500 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <div className="w-10 h-10 rounded-xl bg-black/30 flex items-center justify-center shrink-0 text-lg">
          {msg.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-neutral-200 leading-relaxed">{msg.text}</p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-neutral-600 hover:text-white p-0.5 shrink-0"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}
