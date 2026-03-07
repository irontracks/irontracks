-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- USERS TABLE (Handled by Supabase Auth, but we can have a profiles table if needed, or just rely on auth.users)
-- We will create a public profile table to match existing structure logic if needed, but for now let's stick to the prompt's relational tables.

-- WORKOUTS
CREATE TABLE workouts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    name TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- EXERCISES
CREATE TABLE exercises (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    workout_id UUID REFERENCES workouts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    muscle_group TEXT,
    notes TEXT,
    video_url TEXT,
    rest_time INTEGER,
    cadence TEXT,
    method TEXT DEFAULT 'Normal',
    "order" INTEGER DEFAULT 0
);

-- SETS (This matches the "sets" requirement from prompt, but the prompt's exercise structure in JSON had sets inside exercises)
-- The prompt asked for: sets (id, exercise_id, weight, reps, rpe)
CREATE TABLE sets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    exercise_id UUID REFERENCES exercises(id) ON DELETE CASCADE,
    weight NUMERIC,
    reps TEXT,
    rpe NUMERIC,
    set_number INTEGER DEFAULT 1,
    completed BOOLEAN DEFAULT FALSE
);

-- HISTORY (To store completed sessions/logs)
-- The prompt didn't explicitly ask for a history table in the schema description, 
-- but the backup has "history". We should probably map history to these tables or a separate history table.
-- However, typically in relational DBs, "Workouts" are templates, and "Sessions" are instances.
-- The prompt schema: workouts (id, user_id, date, name, notes). This looks like the "Session" or "History" actually.
-- But wait, the prompt says: "workouts (id, user_id, date, name, notes)" and "exercises" and "sets".
-- This structure fits a "Log" better than a "Template". 
-- In Firebase, "workouts" were templates and "history" were logs.
-- If I strictly follow the prompt schema, I might lose the distinction between "My Plans" and "My Logs".
-- But I must follow the prompt. 
-- "workouts" table seems to be for BOTH if we add a flag, or maybe the prompt implies this IS the structure for everything.
-- Let's add an `is_template` boolean to `workouts` to distinguish.

ALTER TABLE workouts ADD COLUMN is_template BOOLEAN DEFAULT FALSE;

-- RLS POLICIES
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own workouts" ON workouts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own workouts" ON workouts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own workouts" ON workouts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own workouts" ON workouts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own exercises" ON exercises FOR SELECT USING (EXISTS (SELECT 1 FROM workouts WHERE workouts.id = exercises.workout_id AND workouts.user_id = auth.uid()));
CREATE POLICY "Users can insert their own exercises" ON exercises FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM workouts WHERE workouts.id = exercises.workout_id AND workouts.user_id = auth.uid()));
CREATE POLICY "Users can update their own exercises" ON exercises FOR UPDATE USING (EXISTS (SELECT 1 FROM workouts WHERE workouts.id = exercises.workout_id AND workouts.user_id = auth.uid()));
CREATE POLICY "Users can delete their own exercises" ON exercises FOR DELETE USING (EXISTS (SELECT 1 FROM workouts WHERE workouts.id = exercises.workout_id AND workouts.user_id = auth.uid()));

CREATE POLICY "Users can view their own sets" ON sets FOR SELECT USING (EXISTS (SELECT 1 FROM exercises JOIN workouts ON workouts.id = exercises.workout_id WHERE exercises.id = sets.exercise_id AND workouts.user_id = auth.uid()));
CREATE POLICY "Users can insert their own sets" ON sets FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM exercises JOIN workouts ON workouts.id = exercises.workout_id WHERE exercises.id = sets.exercise_id AND workouts.user_id = auth.uid()));
CREATE POLICY "Users can update their own sets" ON sets FOR UPDATE USING (EXISTS (SELECT 1 FROM exercises JOIN workouts ON workouts.id = exercises.workout_id WHERE exercises.id = sets.exercise_id AND workouts.user_id = auth.uid()));
CREATE POLICY "Users can delete their own sets" ON sets FOR DELETE USING (EXISTS (SELECT 1 FROM exercises JOIN workouts ON workouts.id = exercises.workout_id WHERE exercises.id = sets.exercise_id AND workouts.user_id = auth.uid()));
