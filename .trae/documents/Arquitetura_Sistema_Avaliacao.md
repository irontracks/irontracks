# Arquitetura Técnica - Sistema de Avaliação Física

## Visão Geral da Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (React/Next.js)                   │
├─────────────────────────────────────────────────────────────────┤
│  Components UI  │  Utils/Calc  │  PDF Gen  │  Image Upload  │
│  • FormSteps     │  • Body Fat   │  • pdf-lib │  • Compress    │
│  • Measurements  │  • BMR/TDEE   │  • Charts  │  • Preview     │
│  • Skinfolds     │  • Lean Mass  │  • Layout  │  • Storage     │
└─────────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────┐
│                    API Layer (Next.js API)                    │
├─────────────────────────────────────────────────────────────────┤
│  • Assessment CRUD  │  • Image Processing  │  • PDF Service   │
│  • Validation       │  • Storage Upload    │  • Email Send    │
└─────────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Supabase)                         │
├─────────────────────────────────────────────────────────────────┤
│  PostgreSQL  │  Storage  │  Realtime  │  Row Level Security  │
│  • Tables    │  • Images │  • Subs    │  • RLS Policies     │
│  • Functions │  • PDFs   │  • Events  │  • Auth Rules       │
└─────────────────────────────────────────────────────────────────┘
```

## Stack Tecnológica

### Frontend

* **Framework:** Next.js 14 com App Router

* **UI Library:** React 18

* **Estilização:** Tailwind CSS + Headless UI

* **State Management:** Zustand

* **Validação:** React Hook Form + Zod

* **Charts:** Chart.js / Recharts

* **PDF Generation:** pdf-lib

* **Image Processing:** Browser Image Compression

### Backend

* **BaaS:** Supabase

* **Database:** PostgreSQL 15

* **Storage:** Supabase Storage

* **Realtime:** Supabase Realtime

* **Authentication:** Supabase Auth

* **File Processing:** Sharp (server-side)

## Estrutura de Dados

### Tabela: `assessments`

```sql
CREATE TABLE assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  trainer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  
  -- Dados Básicos
  assessment_date DATE NOT NULL,
  weight DECIMAL(5,2) NOT NULL, -- kg
  height DECIMAL(5,2) NOT NULL, -- cm
  age INTEGER NOT NULL,
  gender VARCHAR(1) CHECK (gender IN ('M', 'F')),
  
  -- Circunferências (cm)
  arm_circ DECIMAL(5,2),
  chest_circ DECIMAL(5,2),
  waist_circ DECIMAL(5,2),
  hip_circ DECIMAL(5,2),
  thigh_circ DECIMAL(5,2),
  calf_circ DECIMAL(5,2),
  
  -- 7 Dobras Cutâneas (mm)
  triceps_skinfold DECIMAL(4,1),
  biceps_skinfold DECIMAL(4,1),
  subscapular_skinfold DECIMAL(4,1),
  suprailiac_skinfold DECIMAL(4,1),
  abdominal_skinfold DECIMAL(4,1),
  thigh_skinfold DECIMAL(4,1),
  calf_skinfold DECIMAL(4,1),
  
  -- Cálculos (gerados automaticamente)
  body_fat_percentage DECIMAL(5,2),
  lean_mass DECIMAL(5,2), -- kg
  fat_mass DECIMAL(5,2), -- kg
  bmr DECIMAL(6,2), -- kcal/day
  tdee DECIMAL(6,2), -- kcal/day
  bmi DECIMAL(4,2),
  
  -- Metadados
  observations TEXT,
  photos JSONB DEFAULT '[]', -- Array de URLs das fotos
  pdf_url TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Tabela: `assessment_photos`

```sql
CREATE TABLE assessment_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  photo_type VARCHAR(20) CHECK (photo_type IN ('front', 'side', 'back')),
  file_size INTEGER, -- bytes
  mime_type VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Componentes do Frontend

### Estrutura de Pastas

```
src/
├── components/
│   ├── assessment/
│   │   ├── AssessmentForm.tsx          # Form principal
│   │   ├── MeasurementStep.tsx           # Medidas corporais
│   │   ├── SkinfoldStep.tsx             # 7 dobras
│   │   ├── PhotoUploadStep.tsx          # Upload fotos
│   │   ├── ResultsPreview.tsx           # Preview cálculos
│   │   └── AssessmentList.tsx           # Lista avaliações
│   ├── charts/
│   │   ├── BodyCompositionChart.tsx     # Gráfico pizza
│   │   ├── ProgressChart.tsx             # Gráfico linha evolução
│   │   └── MeasurementChart.tsx          # Gráfico barras
│   └── pdf/
│       ├── AssessmentPDF.tsx             # Componente PDF
│       └── PDFViewer.tsx                 # Visualizador
├── utils/
│   ├── calculations/
│   │   ├── bodyComposition.ts           # Cálculos composição
│   │   ├── bmrTdee.ts                     # Metabolismo
│   │   └── measurements.ts                # Validações
│   ├── pdf/
│   │   ├── generateAssessmentPDF.ts      # Geração PDF
│   │   └── templates.ts                   # Templates
│   └── image/
│       ├── compress.ts                    # Compressão imagem
│       └── upload.ts                      # Upload Supabase
├── hooks/
│   ├── useAssessment.ts                  # CRUD avaliações
│   ├── useCalculations.ts                # Cálculos realtime
│   └── usePhotoUpload.ts                 # Upload fotos
└── types/
    └── assessment.ts                      # TypeScript types
```

## Algoritmos de Cálculo

### % Gordura - Fórmula de Pollock (7 dobras)

```typescript
// Masculino
const maleBodyFat = (age: number, sum7Skinfolds: number): number => {
  const density = 1.112 - 0.00043499 * sum7Skinfolds + 0.00000055 * Math.pow(sum7Skinfolds, 2) - 0.00028826 * age;
  return (495 / density) - 450;
};

// Feminino
const femaleBodyFat = (age: number, sum7Skinfolds: number): number => {
  const density = 1.097 - 0.00046971 * sum7Skinfolds + 0.00000056 * Math.pow(sum7Skinfolds, 2) - 0.00012828 * age;
  return (495 / density) - 450;
};
```

### Taxa Metabólica Basal (BMR)

```typescript
// Harris-Benedict
const calculateBMR = (weight: number, height: number, age: number, gender: 'M' | 'F'): number => {
  if (gender === 'M') {
    return 88.362 + (13.397 * weight) + (4.799 * height) - (5.677 * age);
  } else {
    return 447.593 + (9.247 * weight) + (3.098 * height) - (4.330 * age);
  }
};
```

### Gasto Energético Total (TDEE)

```typescript
const activityFactors = {
  sedentary: 1.2,      // Pouco ou nenhum exercício
  light: 1.375,        // Exercício leve 1-3 dias/semana
  moderate: 1.55,      // Exercício moderado 3-5 dias/semana
  active: 1.725,       // Exercício pesado 6-7 dias/semana
  veryActive: 1.9      // Exercício muito pesado diário
};

const calculateTDEE = (bmr: number, activityLevel: keyof typeof activityFactors): number => {
  return bmr * activityFactors[activityLevel];
};
```

## Fluxo de Dados

### Criar Nova Avaliação

```
1. User → AssessmentForm → Validação local
2. AssessmentForm → API Route → Supabase
3. Supabase → Confirmação → AssessmentForm
4. AssessmentForm → Cálculos → ResultsPreview
5. ResultsPreview → PhotoUpload (opcional)
6. PhotoUpload → Compress → Supabase Storage
7. AssessmentForm → Generate PDF → Supabase Storage
8. Supabase Storage → PDF URL → Update Assessment
```

### Visualizar Histórico

```
1. User → AssessmentList → API Route
2. API Route → Supabase → Lista avaliações
3. AssessmentList → Chart.js → Gráficos evolução
4. Chart.js → Render visualização
```

## Segurança e Permissões

### Row Level Security (RLS)

```sql
-- Alunos podem ver apenas suas próprias avaliações
CREATE POLICY "Students view own assessments" ON assessments
  FOR SELECT USING (
    auth.uid() = student_id AND 
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'student'
    )
  );

-- Personal trainers podem criar/editar avaliações de seus alunos
CREATE POLICY "Trainers manage student assessments" ON assessments
  FOR ALL USING (
    trainer_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'trainer'
    )
  );
```

### Validações

* Valores mínimos/máximos para medidas

* Validação de tipos de dados

* Sanitização de inputs

* Rate limiting em uploads

## Performance Optimization

### Frontend

* Lazy loading de componentes

* Memoização de cálculos pesados

* Compressão de imagens antes de upload

* Paginação em listas de avaliações

### Backend

* Índices em campos frequentemente consultados

* Cache de cálculos complexos

* Otimização de queries

* CDN para arquivos estáticos

## Tratamento de Erros

### Frontend

```typescript
try {
  const result = await createAssessment(data);
  showSuccess('Avaliação criada com sucesso!');
} catch (error) {
  if (error instanceof ValidationError) {
    showValidationErrors(error.fields);
  } else if (error instanceof NetworkError) {
    showError('Erro de conexão. Tente novamente.');
  } else {
    showError('Erro inesperado. Contate suporte.');
  }
}
```

### Backend

* Validação de dados antes de processamento

* Logs estruturados para debugging

* Respostas de erro padronizadas

* Retry mechanism para operações críticas

## Testes

### Unit Tests

* Cálculos de composição corporal

* Validações de formulário

* Conversões de unidades

### Integration Tests

* CRUD de avaliações

* Upload de imagens

* Geração de PDF

### E2E Tests

* Fluxo completo de criação

* Visualização de histórico

* Download de PDF

## Monitoramento

### Métricas

* Tempo de carregamento do formulário

* Tempo de geração de PDF

* Taxa de sucesso de uploads

* Performance dos cálculos

### Logs

* Auditoria de criações/edições

* Erros de validação

* Falhas de upload

* Performance bottlenecks

## Deployment

### Frontend

* Build otimizado com tree shaking

* Assets em CDN

* Lazy loading de rotas

### Backend

* Migrations automatizadas

* Backup do banco de dados

* Rollback strategy

* Health checks

## Manutenção

### Updates

* Atualização de dependências

* Correção de bugs de cálculo

* Melhorias de performance

* Novos recursos

### Suporte

* Documentação técnica

* FAQ para usuários

* Canais de suporte

* Troubleshooting guide

