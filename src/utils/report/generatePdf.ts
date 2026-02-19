interface AssessmentFormData {
  assessment_date?: string | null
  weight?: number | string | null
  height?: number | string | null
  age?: number | string | null
  gender?: string | null
  arm_circ?: number | string | null
  chest_circ?: number | string | null
  waist_circ?: number | string | null
  hip_circ?: number | string | null
  thigh_circ?: number | string | null
  calf_circ?: number | string | null
  triceps_skinfold?: number | string | null
  biceps_skinfold?: number | string | null
  subscapular_skinfold?: number | string | null
  suprailiac_skinfold?: number | string | null
  abdominal_skinfold?: number | string | null
  thigh_skinfold?: number | string | null
  calf_skinfold?: number | string | null
  observations?: string | null
}

interface BodyComposition {
  bodyFatPercentage?: number | null
  sumOfSkinfolds?: number | null
  leanMass?: number | null
  fatMass?: number | null
  bmi?: number | null
  bmr?: number | null
  tdee?: number | null
  [key: string]: unknown
}

interface AssessmentResults {
  bodyComposition?: BodyComposition | null
  bmr?: number | null
  bmi?: number | null
  leanMass?: number | null
  fatMass?: number | null
  bmiClassification?: string | null
  bodyFatClassification?: string | null
  [key: string]: unknown
}

export async function generateAssessmentPdf(
  formData: AssessmentFormData,
  results: AssessmentResults,
  studentName: string
): Promise<Blob> {
  try {
    const data = formData && typeof formData === 'object' ? formData : {};
    const metrics = results && typeof results === 'object' ? results : {};

    const name = String(studentName || 'Aluno').trim() || 'Aluno';
    const dateRaw = data?.assessment_date ?? new Date().toISOString().split('T')[0];
    const date = typeof dateRaw === 'string' && dateRaw ? dateRaw : new Date().toISOString().split('T')[0];

    const weight = Number.parseFloat(String(data?.weight ?? '0').replace(',', '.')) || 0;
    const height = Number.parseFloat(String(data?.height ?? '0').replace(',', '.')) || 0;
    const age = Number.parseInt(String(data?.age ?? '0'), 10) || 0;
    const gender = String(data?.gender || '').toUpperCase();

    const bodyComposition = (metrics?.bodyComposition && typeof metrics.bodyComposition === 'object'
      ? metrics.bodyComposition
      : {}) as BodyComposition;

    const bodyFatPercentage = Number(bodyComposition?.bodyFatPercentage ?? 0) || 0;
    const sumOfSkinfolds = Number(bodyComposition?.sumOfSkinfolds ?? 0) || 0;

    const bmr = Number(metrics?.bmr ?? 0) || 0;
    const bmi = Number(metrics?.bmi ?? 0) || 0;
    const bmiClassification = String(metrics?.bmiClassification || '');
    const bodyFatClassification = String(metrics?.bodyFatClassification || '');
    const leanMass = Number(metrics?.leanMass ?? 0) || 0;
    const fatMass = Number(metrics?.fatMass ?? 0) || 0;

    const observations = String(data?.observations || '');

    const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Avaliação Física • ${name}</title>
    <style>
      *{box-sizing:border-box} body{margin:0;background:#fff;color:#000;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
      .container{max-width:840px;margin:0 auto;padding:32px}
      .header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:4px solid #000;padding-bottom:16px;margin-bottom:24px}
      .brand{font-weight:900;font-size:32px;letter-spacing:-1px}
      .brand .muted{color:#555;font-style:italic}
      .subtitle{font-size:12px;text-transform:uppercase;color:#666;font-weight:700;letter-spacing:2px}
      .title{font-size:20px;font-weight:800}
      .date{font-size:12px;color:#666}
      .section{margin-bottom:24px}
      .section h2{font-size:16px;margin:0 0 8px;font-weight:800;text-transform:uppercase;letter-spacing:1px}
      .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}
      .card{background:#f7f7f7;border:1px solid #ddd;border-radius:12px;padding:12px;font-size:13px}
      .label{font-size:11px;text-transform:uppercase;color:#555;font-weight:700;letter-spacing:1px;margin-bottom:4px}
      .value{font-size:14px;font-weight:700}
      .footer{margin-top:32px;padding-top:12px;border-top:1px solid #ddd;text-align:center;font-size:11px;color:#666;text-transform:uppercase;letter-spacing:2px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
      th,td{border-bottom:1px solid #eee;padding:6px 4px;text-align:left}
      th{color:#666;text-transform:uppercase;font-weight:700;font-size:11px}
      .muted{color:#666;font-size:12px}
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div>
          <div class="brand">IRON<span class="muted">TRACKS</span></div>
          <div class="subtitle">Avaliação Física</div>
        </div>
        <div style="text-align:right">
          <div class="title">${name}</div>
          <div class="date">${date}</div>
        </div>
      </div>

      <div class="section">
        <h2>Dados básicos</h2>
        <div class="grid">
          <div class="card">
            <div class="label">Peso</div>
            <div class="value">${weight ? `${weight.toFixed(1)} kg` : '-'}</div>
          </div>
          <div class="card">
            <div class="label">Altura</div>
            <div class="value">${height ? `${height.toFixed(2)} m` : '-'}</div>
          </div>
          <div class="card">
            <div class="label">Idade</div>
            <div class="value">${age || '-'}</div>
          </div>
          <div class="card">
            <div class="label">Gênero</div>
            <div class="value">${gender || '-'}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>Composição corporal</h2>
        <div class="grid">
          <div class="card">
            <div class="label">% Gordura</div>
            <div class="value">${bodyFatPercentage ? `${bodyFatPercentage.toFixed(1)}%` : '-'}</div>
          </div>
          <div class="card">
            <div class="label">Soma das dobras</div>
            <div class="value">${sumOfSkinfolds ? `${sumOfSkinfolds.toFixed(1)} mm` : '-'}</div>
          </div>
          <div class="card">
            <div class="label">Massa magra</div>
            <div class="value">${leanMass ? `${leanMass.toFixed(1)} kg` : '-'}</div>
          </div>
          <div class="card">
            <div class="label">Massa gorda</div>
            <div class="value">${fatMass ? `${fatMass.toFixed(1)} kg` : '-'}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>Metabolismo e índices</h2>
        <div class="grid">
          <div class="card">
            <div class="label">BMR</div>
            <div class="value">${bmr ? `${bmr.toFixed(0)} kcal/dia` : '-'}</div>
          </div>
          <div class="card">
            <div class="label">BMI</div>
            <div class="value">${bmi ? `${bmi.toFixed(1)} kg/m²` : '-'}</div>
          </div>
          <div class="card">
            <div class="label">Classificação BMI</div>
            <div class="value">${bmiClassification || '-'}</div>
          </div>
          <div class="card">
            <div class="label">Classificação Gordura</div>
            <div class="value">${bodyFatClassification || '-'}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <h2>Dobras cutâneas</h2>
        <table>
          <thead>
            <tr>
              <th>Região</th>
              <th>Valor (mm)</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>Tríceps</td><td>${data?.triceps_skinfold ?? '-'}</td></tr>
            <tr><td>Bíceps</td><td>${data?.biceps_skinfold ?? '-'}</td></tr>
            <tr><td>Subescapular</td><td>${data?.subscapular_skinfold ?? '-'}</td></tr>
            <tr><td>Supra-ilíaca</td><td>${data?.suprailiac_skinfold ?? '-'}</td></tr>
            <tr><td>Abdominal</td><td>${data?.abdominal_skinfold ?? '-'}</td></tr>
            <tr><td>Coxa</td><td>${data?.thigh_skinfold ?? '-'}</td></tr>
            <tr><td>Panturrilha</td><td>${data?.calf_skinfold ?? '-'}</td></tr>
          </tbody>
        </table>
      </div>

      ${observations ? `<div class="section"><h2>Observações</h2><p class="muted">${observations}</p></div>` : ''}

      <div class="footer">IronTracks System • ${date}</div>
    </div>
  </body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    return blob;
  } catch (error) {
    console.error('Erro ao montar HTML da avaliação', error);
    const fallback = '<!doctype html><html><body><p>Não foi possível gerar o PDF da avaliação.</p></body></html>';
    return new Blob([fallback], { type: 'text/html' });
  }
}
