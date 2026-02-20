-- Tabela para rastrear uso diário de features VIP
CREATE TABLE IF NOT EXISTS vip_usage_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL, -- 'chat', 'wizard', 'insights'
    day DATE NOT NULL DEFAULT CURRENT_DATE,
    usage_count INTEGER DEFAULT 1,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Garante apenas um registro por feature por dia por usuário
    UNIQUE(user_id, feature_key, day)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_vip_usage_user_day ON vip_usage_daily(user_id, day);
CREATE INDEX IF NOT EXISTS idx_vip_usage_feature_day ON vip_usage_daily(feature_key, day);

-- Habilitar RLS
ALTER TABLE vip_usage_daily ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
-- Usuário pode ver seu próprio uso
CREATE POLICY "Users can view own usage" 
ON vip_usage_daily FOR SELECT 
USING (auth.uid() = user_id);

-- Usuário pode inserir/atualizar seu próprio uso (via API server-side, mas ok deixar aqui se precisar)
-- Geralmente incrementamos via Service Role na API, mas para leitura o RLS é essencial.
-- Se a API rodar com Service Role, o RLS não impede.
