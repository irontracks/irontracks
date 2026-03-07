# PRD - Sistema de Avaliação Física

## Visão Geral
Sistema completo de avaliação física com medidas corporais, 7 dobras cutâneas, cálculos automáticos, geração de PDF e acompanhamento com gráficos.

## Objetivos
- Permitir avaliações físicas completas com medidas precisas
- Calcular automaticamente composição corporal (% gordura, massa magra, etc.)
- Gerar PDF profissional com resultados e gráficos
- Permitir anexo de fotos para documentação visual
- Fornecer histórico com gráficos de evolução

## Requisitos Funcionais

### Formulário de Avaliação
- **Medidas Corporais:** peso, altura, idade, circunferências (braço, peito, cintura, quadril, coxa, panturrilha)
- **7 Dobras Cutâneas:** tricipital, bicipital, subescapular, suprailíaca, abdominal, coxa, panturrilha
- **Dados Pessoais:** data da avaliação, observações
- **Interface Intuitiva:** formulário em abas ou seções organizadas

### Cálculos Automáticos
- **% Gordura:** Fórmula de Pollock (7 dobras) para homens e mulheres
- **Massa Magra:** peso total - (peso × % gordura / 100)
- **Peso Gordo:** peso × % gordura / 100
- **IMC:** peso / (altura²)
- **Taxa Metabólica Basal (BMR):** Fórmula de Harris-Benedict
- **Gasto Energético Total (TDEE):** BMR × fator de atividade

### Sistema de Fotos
- **Upload Direto:** permitir tirar foto com câmera ou selecionar da galeria
- **Multiplas Perspectivas:** frente, lado, costas (opcional)
- **Compressão:** otimizar tamanho das imagens antes de salvar
- **Visualização:** miniaturas e visualização ampliada

### Geração de PDF
- **Layout Profissional:** cabeçalho com logo, dados do aluno e personal
- **Seções Organizadas:** medidas, resultados calculados, gráficos, fotos
- **Gráficos Inclusos:** pizza de composição corporal, barras comparativas
- **Informações Completas:** todas as medidas, cálculos e observações
- **Download Imediato:** PDF gerado e disponibilizado para download

### Histórico e Gráficos
- **Lista de Avaliações:** data, resultados principais, status
- **Gráficos de Evolução:** linha para % gordura e massa magra ao longo do tempo
- **Comparação entre Avaliações:** visualizar mudanças entre datas
- **Exportar Dados:** opção para exportar histórico em Excel/PDF

## Requisitos Não Funcionais

### Performance
- Carregamento rápido do formulário (< 2 segundos)
- Cálculos em tempo real (< 100ms)
- Geração de PDF (< 5 segundos)

### Usabilidade
- Interface responsiva para mobile e desktop
- Validação de campos em tempo real
- Feedback visual para ações do usuário
- Acessibilidade (WCAG 2.1)

### Segurança
- Autenticação obrigatória para acessar avaliações
- Criptografia de dados sensíveis
- Controle de acesso por perfil (aluno/personal)

### Confiabilidade
- Validação de dados antes de salvamento
- Backup automático de avaliações
- Tratamento de erros amigável

## Casos de Uso

### Personal Trainer
1. Acessa perfil do aluno
2. Clica em "Nova Avaliação"
3. Preenche medidas corporais e dobras
4. Sistema calcula automaticamente resultados
5. Adiciona fotos (opcional)
6. Gera PDF da avaliação
7. Salva no perfil do aluno

### Aluno
1. Acessa seu perfil
2. Visualiza avaliações anteriores
3. Compara resultados através de gráficos
4. Baixa PDFs de avaliações
5. Acompanha evolução física

## Critérios de Aceitação

### Formulário
- [ ] Todos os campos de medidas são obrigatórios
- [ ] Validação de faixas de valores (ex: dobras 3-50mm)
- [ ] Cálculos automáticos funcionam corretamente
- [ ] Interface intuitiva e organizada

### PDF
- [ ] Layout profissional e completo
- [ ] Gráficos incluídos e legíveis
- [ ] Todas as informações presentes
- [ ] Download funciona em todos os dispositivos

### Fotos
- [ ] Upload funciona em mobile e desktop
- [ ] Imagens são comprimidas sem perder qualidade
- [ ] Visualização ampliada disponível
- [ ] Fotos são salvas corretamente

### Histórico
- [ ] Lista de avaliações ordenada por data
- [ ] Gráficos de evolução funcionam
- [ ] Comparação entre datas é clara
- [ ] Exportação de dados funciona

## Métricas de Sucesso
- Redução de 80% no tempo de avaliação
- 95% de satisfação dos usuários
- 0% de erros nos cálculos
- Tempo de geração de PDF < 5 segundos

## Riscos e Mitigação
- **Risco:** Cálculos incorretos
  - **Mitigação:** Testes extensivos e validação cruzada
- **Risco:** PDF não gerar corretamente
  - **Mitigação:** Biblioteca robusta (pdf-lib) e fallback
- **Risco:** Fotos muito grandes
  - **Mitigação:** Compressão automática e limites de tamanho

## Cronograma Estimado
- Fase 1 (1 semana): Formulário e cálculos
- Fase 2 (1 semana): PDF e fotos
- Fase 3 (1 semana): Histórico e gráficos
- Fase 4 (3 dias): Testes e ajustes