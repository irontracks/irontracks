import { createClient } from '@/utils/supabase/client';
import type { ActionResult } from '@/types/actions'

// Função para obter ou criar canal direto entre dois usuários
export async function getOrCreateDirectChannel(userId1: string, userId2: string): Promise<string> {
    const supabase = createClient();
    
    try {
        // Chamar a função SQL para obter ou criar canal
        const { data: channelId, error } = await supabase
            .rpc('get_or_create_direct_channel', {
                user1: userId1,
                user2: userId2
            });

        if (error) throw error;
        return channelId;
    } catch (error) {
        console.error('Erro ao obter/criar canal:', error);
        throw error;
    }
}

// Função para buscar conversas do usuário
export async function getUserConversations(userId: string): Promise<ActionResult<unknown[]>> {
    const supabase = createClient();
    
    try {
        const { data, error } = await supabase
            .rpc('get_user_conversations', { user_id: userId });

        if (error) throw error;
        return { ok: true, data: (data || []) as unknown[] };
    } catch (error) {
        console.error('Erro ao buscar conversas:', error);
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}

// Função para enviar mensagem
export async function sendDirectMessage(
    channelId: string,
    senderId: string,
    content: string,
): Promise<ActionResult<{ id: string }>> {
    const supabase = createClient();
    
    try {
        // Inserir mensagem
        const { data: message, error: messageError } = await supabase
            .from('direct_messages')
            .insert({
                channel_id: channelId,
                sender_id: senderId,
                content: content.trim()
            })
            .select()
            .single();

        if (messageError) throw messageError;

        // Atualizar timestamp da última mensagem no canal
        const { error: channelError } = await supabase
            .from('direct_channels')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', channelId);

        if (channelError) throw channelError;

        return { ok: true, data: { id: String(message?.id) } };
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}

// Função para buscar mensagens de um canal
export async function getDirectMessages(channelId: string, limit?: number): Promise<ActionResult<unknown[]>>
export async function getDirectMessages(channelId: string, limit = 50, beforeId: string | null = null): Promise<ActionResult<unknown[]>> {
    const supabase = createClient();
    
    try {
        let query = supabase
            .from('direct_messages')
            .select(`
                *,
                sender:sender_id(display_name, photo_url)
            `)
            .eq('channel_id', channelId)
            .order('created_at', { ascending: true })
            .limit(limit);

        if (beforeId) {
            query = query.lt('id', beforeId);
        }

        const { data, error } = await query;

        if (error) throw error;
        return { ok: true, data: (data || []) as unknown[] };
    } catch (error) {
        console.error('Erro ao buscar mensagens:', error);
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}

// Função para marcar mensagens como lidas
export async function markMessagesAsRead(channelId: string, userId: string): Promise<ActionResult> {
    const supabase = createClient();
    
    try {
        const { error } = await supabase
            .from('direct_messages')
            .update({ is_read: true })
            .eq('channel_id', channelId)
            .eq('sender_id', userId)
            .eq('is_read', false);

        if (error) throw error;
        return { ok: true, data: undefined };
    } catch (error) {
        console.error('Erro ao marcar mensagens como lidas:', error);
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
}
