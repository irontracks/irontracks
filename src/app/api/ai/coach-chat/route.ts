import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { requireUser } from '@/utils/auth/route';
import { createClient } from '@/utils/supabase/server';
import { checkVipFeatureAccess, incrementVipUsage } from '@/utils/vip/limits';

export const dynamic = 'force-dynamic';

const MODEL_ID = process.env.GOOGLE_GENERATIVE_AI_MODEL_ID || 'gemini-2.0-flash-exp';

const formatSession = (session: any): string => {
    if (!session) return 'Nenhum dado disponível.';
    
    let summary = `Título: ${session.workoutTitle || 'Treino sem nome'}\n`;
    summary += `Data: ${new Date(session.date || Date.now()).toLocaleDateString('pt-BR')}\n`;
    summary += `Duração: ${Math.round((session.totalTime || 0) / 60)} min\n`;
    
    const exercises = Array.isArray(session.exercises) ? session.exercises : [];
    const logs = session.logs || {};
    
    summary += 'Exercícios:\n';
    exercises.forEach((ex: any, idx: number) => {
        summary += `${idx + 1}. ${ex.name} (${ex.sets} séries, Método: ${ex.method || 'Normal'}, RPE: ${ex.rpe || '-'}, Descanso: ${ex.restTime || '-'}s)\n`;
        // Add logs detail
        for (let s = 0; s < (ex.sets || 0); s++) {
            const key = `${idx}-${s}`;
            const log = logs[key];
            if (log) {
                summary += `   - Série ${s + 1}: ${log.weight}kg x ${log.reps} reps\n`;
            }
        }
    });
    
    return summary;
};

export async function POST(req: Request) {
    try {
        const auth = await requireUser();
        if (!auth.ok) return auth.response;
        const user = auth.user;
        const supabase = auth.supabase;

        // Check VIP Limits
        const { allowed, currentUsage, limit, tier } = await checkVipFeatureAccess(supabase, user.id, 'chat_daily');
        if (!allowed) {
            return NextResponse.json({ 
                error: 'Limit Reached', 
                message: `Você atingiu o limite diário de ${limit} mensagens do seu plano ${tier}. Faça upgrade para continuar.`,
                upgradeRequired: true
            }, { status: 403 });
        }

        const body = await req.json();
        const { messages, context } = body;

        if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
            return NextResponse.json({ error: 'API Key missing' }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
        const model = genAI.getGenerativeModel({ model: MODEL_ID });

        const currentWorkout = formatSession(context?.session);
        const previousWorkout = formatSession(context?.previousSession);

        const isGeneralMode = !context?.session && !context?.previousSession;

        const systemPrompt = `
Você é o Iron Coach, um treinador de força e condicionamento físico de elite e especialista em biomecânica.
Sua missão é analisar os dados do treino do usuário e responder perguntas, fornecer feedbacks técnicos e motivar.

${isGeneralMode ? `
MODO GERAL (SEM TREINO ESPECÍFICO):
O usuário está na área VIP e quer tirar dúvidas gerais sobre treino, nutrição ou estratégia.
Use seu conhecimento para guiar o usuário. Se ele perguntar sobre um treino específico, peça para ele abrir o relatório daquele treino.
` : `
DADOS DO TREINO ATUAL (ACABOU DE FINALIZAR):
${currentWorkout}

DADOS DO TREINO ANTERIOR (REFERÊNCIA):
${previousWorkout}
`}

DIRETRIZES DE PERSONALIDADE:
1. Fale como um treinador experiente: direto, técnico mas acessível, e focado em resultados.
2. Use Português do Brasil.
3. Seja conciso. Evite textos longos e genéricos. Vá direto ao ponto.
4. Use emojis ocasionalmente para manter o tom leve (💪, 🔥, 🚀).

REGRAS DE ANÁLISE:
1. Se o usuário perguntar sobre um grupo muscular ou exercício, analise os números (carga, reps). Compare com o treino anterior se disponível.
2. Se houve queda de rendimento, pergunte a causa (dor, sono, estresse) e valide a decisão de reduzir carga para priorizar técnica.
3. Se houve progresso, parabenize especificamente (ex: "Aumentou 2kg no Supino, excelente!").
4. Se o usuário falar sobre dor ou desconforto, sugira ajustes de execução ou descanso, mas lembre que não é médico.

RESUMO DA CONVERSA ATÉ AGORA:
(O usuário e você já trocaram as mensagens abaixo. Continue a conversa naturalmente.)
`;

        // Convert messages to Gemini format
        // Gemini expects: { role: 'user' | 'model', parts: [{ text: ... }] }
        // Our messages: { role: 'user' | 'assistant', content: ... }
        const history = (messages || []).map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        // We use generateContent with system instruction if supported, or prepend it.
        // gemini-1.5-pro supports systemInstruction. 
        // For broad compatibility, we'll prepend the context to the first message or use a chat session.
        
        const chat = model.startChat({
            history: [
                {
                    role: 'user',
                    parts: [{ text: systemPrompt + "\n\nEntendi o contexto. Estou pronto para analisar o treino." }]
                },
                {
                    role: 'model',
                    parts: [{ text: "Ótimo. Estou com os dados do seu treino em mãos. O que gostaria de saber ou discutir sobre sua performance de hoje?" }]
                },
                ...history
            ]
        });

        // The last message is usually the trigger, but in 'chat' mode we just send the last user input?
        // Actually, the `messages` array includes the latest user message.
        // So we should pop it to send it as `sendMessage`.
        
        const lastMsg = history.length > 0 && history[history.length - 1].role === 'user' 
            ? history.pop() 
            : { parts: [{ text: "Pode fazer uma análise geral?" }] };

        // Re-initialize chat with history excluding the last message
        const finalChat = model.startChat({
            history: [
                {
                    role: 'user',
                    parts: [{ text: systemPrompt + "\n\nEntendi o contexto. Estou pronto." }]
                },
                {
                    role: 'model',
                    parts: [{ text: "Certo. Vamos lá." }]
                },
                ...history
            ]
        });

        const result = await finalChat.sendMessage(lastMsg.parts[0].text);
        const responseText = result.response.text();

        // Increment Usage
        await incrementVipUsage(supabase, user.id, 'chat');

        return NextResponse.json({ 
            role: 'assistant', 
            content: responseText 
        });

    } catch (error: any) {
        console.error('Coach Chat Error:', error);
        return NextResponse.json({ 
            error: 'Failed to process chat', 
            details: error?.message ?? String(error) 
        }, { status: 500 });
    }
}
