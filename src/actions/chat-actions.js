import { createClient } from '@/utils/supabase/client';

// Função para obter ou criar canal direto entre dois usuários
export async function getOrCreateDirectChannel(userId1, userId2) {
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
export async function getUserConversations(userId) {
    const supabase = createClient();
    
    try {
        const { data, error } = await supabase
            .rpc('get_user_conversations', { user_id: userId });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Erro ao buscar conversas:', error);
        throw error;
    }
}

// Função para enviar mensagem
export async function sendDirectMessage(channelId, senderId, content) {
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

        return message;
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        throw error;
    }
}

// Função para buscar mensagens de um canal
export async function getDirectMessages(channelId, limit = 50, beforeId = null) {
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
        return data || [];
    } catch (error) {
        console.error('Erro ao buscar mensagens:', error);
        throw error;
    }
}

// Função para marcar mensagens como lidas
export async function markMessagesAsRead(channelId, userId) {
    const supabase = createClient();
    
    try {
        const { error } = await supabase
            .from('direct_messages')
            .update({ is_read: true })
            .eq('channel_id', channelId)
            .eq('sender_id', userId)
            .eq('is_read', false);

        if (error) throw error;
        return true;
    } catch (error) {
        console.error('Erro ao marcar mensagens como lidas:', error);
        return false;
    }
}
