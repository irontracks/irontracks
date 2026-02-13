-- 1. PERFIL PÚBLICO (Essencial para Busca de Amigos e Admin)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    display_name TEXT,
    photo_url TEXT,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    role TEXT DEFAULT 'user'
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- Qualquer um pode ver perfis (para buscar amigos)
CREATE POLICY "Public profiles are viewable by everyone" ON profiles FOR SELECT USING (true);
-- Apenas o dono pode editar
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);


-- 2. AVALIAÇÃO FÍSICA (StudentEvolution)
CREATE TABLE IF NOT EXISTS assessments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    weight NUMERIC,
    bf NUMERIC,
    waist NUMERIC,
    arm NUMERIC,
    sum7 NUMERIC,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own assessments" ON assessments USING (auth.uid() = user_id);


-- 3. FOTOS DE PROGRESSO (StudentEvolution)
CREATE TABLE IF NOT EXISTS photos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own photos" ON photos USING (auth.uid() = user_id);


-- 4. CHAT GLOBAL (ChatScreen)
CREATE TABLE IF NOT EXISTS messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Everyone can read messages" ON messages FOR SELECT USING (true);
CREATE POLICY "Users can insert messages" ON messages FOR INSERT WITH CHECK (auth.uid() = user_id);


-- 5. CONVITES DE TREINO (InviteManager)
CREATE TABLE IF NOT EXISTS invites (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    from_uid UUID REFERENCES auth.users(id),
    to_uid UUID REFERENCES auth.users(id),
    workout_data JSONB,
    team_session_id UUID,
    status TEXT DEFAULT 'pending', -- pending, accepted, rejected
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
-- Usuário vê convites que enviou ou recebeu
CREATE POLICY "Users manage invites" ON invites USING (auth.uid() = from_uid OR auth.uid() = to_uid);


-- 6. SESSÃO DE EQUIPE (TeamContext)
CREATE TABLE IF NOT EXISTS team_sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    host_uid UUID REFERENCES auth.users(id),
    status TEXT DEFAULT 'active',
    participants JSONB, -- Armazena lista simples de nomes/emails para exibição rápida
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE team_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view team sessions" ON team_sessions FOR SELECT USING (true);
CREATE POLICY "Hosts manage sessions" ON team_sessions FOR ALL USING (auth.uid() = host_uid);
