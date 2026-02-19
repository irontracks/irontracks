-- Tabela para contadores de rate limit
CREATE TABLE IF NOT EXISTS rate_limit_counters (
    key TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    reset_at TIMESTAMPTZ NOT NULL
);

-- Habilitar RLS (opcional, mas boa prática)
ALTER TABLE rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- Função atômica para checar rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_key TEXT,
    p_max INTEGER,
    p_window_ms INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
    v_reset_at TIMESTAMPTZ;
    v_now TIMESTAMPTZ := NOW();
    v_new_reset_at TIMESTAMPTZ;
    v_allowed BOOLEAN;
    v_remaining INTEGER;
    v_retry_after INTEGER;
BEGIN
    -- Tenta pegar o registro atual (bloqueando a linha para update)
    SELECT count, reset_at INTO v_count, v_reset_at
    FROM rate_limit_counters
    WHERE key = p_key
    FOR UPDATE;

    -- Se não existe ou expirou, reseta
    IF v_count IS NULL OR v_reset_at <= v_now THEN
        v_new_reset_at := v_now + (p_window_ms || ' milliseconds')::INTERVAL;
        v_count := 1;
        v_allowed := TRUE;
        v_remaining := GREATEST(0, p_max - 1);
        v_retry_after := CEIL(EXTRACT(EPOCH FROM (v_new_reset_at - v_now)))::INTEGER;

        INSERT INTO rate_limit_counters (key, count, reset_at)
        VALUES (p_key, v_count, v_new_reset_at)
        ON CONFLICT (key) DO UPDATE
        SET count = EXCLUDED.count,
            reset_at = EXCLUDED.reset_at;

        RETURN jsonb_build_object(
            'allowed', v_allowed,
            'remaining', v_remaining,
            'reset_at', EXTRACT(EPOCH FROM v_new_reset_at) * 1000,
            'retry_after_seconds', v_retry_after
        );
    END IF;

    -- Se existe e ainda é válido
    IF v_count >= p_max THEN
        -- Bloqueado
        v_allowed := FALSE;
        v_remaining := 0;
        v_retry_after := CEIL(EXTRACT(EPOCH FROM (v_reset_at - v_now)))::INTEGER;
        
        RETURN jsonb_build_object(
            'allowed', v_allowed,
            'remaining', v_remaining,
            'reset_at', EXTRACT(EPOCH FROM v_reset_at) * 1000,
            'retry_after_seconds', v_retry_after
        );
    ELSE
        -- Permitido (incrementa)
        v_count := v_count + 1;
        v_allowed := TRUE;
        v_remaining := GREATEST(0, p_max - v_count);
        v_retry_after := CEIL(EXTRACT(EPOCH FROM (v_reset_at - v_now)))::INTEGER;

        UPDATE rate_limit_counters
        SET count = v_count
        WHERE key = p_key;

        RETURN jsonb_build_object(
            'allowed', v_allowed,
            'remaining', v_remaining,
            'reset_at', EXTRACT(EPOCH FROM v_reset_at) * 1000,
            'retry_after_seconds', v_retry_after
        );
    END IF;
END;
$$;
