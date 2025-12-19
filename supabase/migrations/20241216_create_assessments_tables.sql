-- Migration: Sistema de Avaliação Física
-- Criação de tabelas para avaliações físicas com medidas corporais e 7 dobras

-- Tabela principal de avaliações físicas
CREATE TABLE assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  trainer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Dados Básicos
  assessment_date DATE NOT NULL,
  weight DECIMAL(5,2) NOT NULL, -- peso em kg
  height DECIMAL(5,2) NOT NULL, -- altura em cm
  age INTEGER NOT NULL,
  gender VARCHAR(1) CHECK (gender IN ('M', 'F')),
  
  -- Circunferências em cm
  arm_circ DECIMAL(5,2), -- braço
  chest_circ DECIMAL(5,2), -- peito
  waist_circ DECIMAL(5,2), -- cintura
  hip_circ DECIMAL(5,2), -- quadril
  thigh_circ DECIMAL(5,2), -- coxa
  calf_circ DECIMAL(5,2), -- panturrilha
  
  -- 7 Dobras Cutâneas em mm
  triceps_skinfold DECIMAL(4,1), -- tricipital
  biceps_skinfold DECIMAL(4,1), -- bicipital
  subscapular_skinfold DECIMAL(4,1), -- subescapular
  suprailiac_skinfold DECIMAL(4,1), -- suprailíaca
  abdominal_skinfold DECIMAL(4,1), -- abdominal
  thigh_skinfold DECIMAL(4,1), -- coxa
  calf_skinfold DECIMAL(4,1), -- panturrilha
  
  -- Cálculos (gerados automaticamente)
  body_fat_percentage DECIMAL(5,2), -- % gordura
  lean_mass DECIMAL(5,2), -- massa magra em kg
  fat_mass DECIMAL(5,2), -- massa gorda em kg
  bmr DECIMAL(6,2), -- taxa metabólica basal kcal/dia
  tdee DECIMAL(6,2), -- gasto energético total kcal/dia
  bmi DECIMAL(4,2), -- índice de massa corporal
  
  -- Metadados
  observations TEXT,
  pdf_url TEXT, -- URL do PDF gerado
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_assessments_student_id ON assessments(student_id);
CREATE INDEX idx_assessments_trainer_id ON assessments(trainer_id);
CREATE INDEX idx_assessments_date ON assessments(assessment_date);
CREATE INDEX idx_assessments_created ON assessments(created_at);

-- Tabela de fotos das avaliações
CREATE TABLE assessment_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  photo_type VARCHAR(20) CHECK (photo_type IN ('front', 'side', 'back')),
  file_size INTEGER, -- tamanho em bytes
  mime_type VARCHAR(50), -- tipo de arquivo
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para buscar fotos por avaliação
CREATE INDEX idx_assessment_photos_assessment_id ON assessment_photos(assessment_id);

-- Função para atualizar timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at
CREATE TRIGGER update_assessments_updated_at
  BEFORE UPDATE ON assessments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Função para calcular automaticamente os valores derivados
CREATE OR REPLACE FUNCTION calculate_assessment_metrics()
RETURNS TRIGGER AS $$
DECLARE
  sum_skinfolds DECIMAL(6,2);
  body_density DECIMAL(8,6);
BEGIN
  -- Soma das 7 dobras
  sum_skinfolds = COALESCE(NEW.triceps_skinfold, 0) + 
                  COALESCE(NEW.biceps_skinfold, 0) + 
                  COALESCE(NEW.subscapular_skinfold, 0) + 
                  COALESCE(NEW.suprailiac_skinfold, 0) + 
                  COALESCE(NEW.abdominal_skinfold, 0) + 
                  COALESCE(NEW.thigh_skinfold, 0) + 
                  COALESCE(NEW.calf_skinfold, 0);

  -- Calcular densidade corporal baseada na fórmula de Pollock
  IF NEW.gender = 'M' THEN
    -- Fórmula Pollock para homens
    body_density = 1.112 - (0.00043499 * sum_skinfolds) + 
                   (0.00000055 * POWER(sum_skinfolds, 2)) - 
                   (0.00028826 * NEW.age);
  ELSE
    -- Fórmula Pollock para mulheres
    body_density = 1.097 - (0.00046971 * sum_skinfolds) + 
                   (0.00000056 * POWER(sum_skinfolds, 2)) - 
                   (0.00012828 * NEW.age);
  END IF;

  -- Calcular % gordura
  NEW.body_fat_percentage = ROUND(((495 / body_density) - 450), 2);

  -- Calcular massa gorda
  NEW.fat_mass = ROUND((NEW.weight * NEW.body_fat_percentage / 100), 2);

  -- Calcular massa magra
  NEW.lean_mass = ROUND((NEW.weight - NEW.fat_mass), 2);

  -- Calcular IMC
  NEW.bmi = ROUND((NEW.weight / POWER(NEW.height / 100, 2)), 2);

  -- Calcular BMR (Harris-Benedict)
  IF NEW.gender = 'M' THEN
    NEW.bmr = ROUND((88.362 + (13.397 * NEW.weight) + (4.799 * NEW.height) - (5.677 * NEW.age)), 2);
  ELSE
    NEW.bmr = ROUND((447.593 + (9.247 * NEW.weight) + (3.098 * NEW.height) - (4.330 * NEW.age)), 2);
  END IF;

  -- TDEE será calculado no frontend baseado no nível de atividade
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para calcular métricas automaticamente
CREATE TRIGGER calculate_assessment_metrics_trigger
  BEFORE INSERT OR UPDATE ON assessments
  FOR EACH ROW
  EXECUTE FUNCTION calculate_assessment_metrics();

-- Habilitar RLS (Row Level Security)
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_photos ENABLE ROW LEVEL SECURITY;

-- Políticas de segurança para assessments
-- Alunos podem ver apenas suas próprias avaliações
CREATE POLICY "Students view own assessments" ON assessments
  FOR SELECT USING (
    auth.uid() = student_id AND 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'student'
    )
  );

-- Personal trainers podem ver e criar avaliações de seus alunos
CREATE POLICY "Trainers manage student assessments" ON assessments
  FOR ALL USING (
    trainer_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'trainer'
    )
  );

-- Alunos podem ver fotos de suas próprias avaliações
CREATE POLICY "Students view own assessment photos" ON assessment_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM assessments 
      WHERE id = assessment_id AND student_id = auth.uid()
    )
  );

-- Personal trainers podem gerenciar fotos das avaliações que criaram
CREATE POLICY "Trainers manage assessment photos" ON assessment_photos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM assessments 
      WHERE id = assessment_id AND trainer_id = auth.uid()
    )
  );

-- Conceder permissões necessárias
GRANT SELECT ON assessments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON assessments TO authenticated;
GRANT SELECT ON assessment_photos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON assessment_photos TO authenticated;

-- Habilitar Realtime para atualizações em tempo real
ALTER TABLE assessments REPLICA IDENTITY FULL;
ALTER TABLE assessment_photos REPLICA IDENTITY FULL;

-- Criar view para facilitar consultas com informações completas
CREATE VIEW assessment_complete_view AS
SELECT 
  a.*,
  s.name as student_name,
  s.email as student_email,
  t.name as trainer_name,
  t.email as trainer_email,
  COUNT(ap.id) as photo_count
FROM assessments a
LEFT JOIN profiles s ON a.student_id = s.id
LEFT JOIN profiles t ON a.trainer_id = t.id
LEFT JOIN assessment_photos ap ON a.id = ap.assessment_id
GROUP BY a.id, s.name, s.email, t.name, t.email;
