/**
 * @module knowledge-base
 *
 * Base de conhecimento "how-to" do app IronTracks injetada no system prompt do
 * Gemini para o bot de WhatsApp poder dar **respostas concretas e certeiras**
 * sobre o app — sem inventar features que não existem.
 *
 * Regra de ouro: SÓ inclua aqui passos confirmados no código. Se uma feature
 * estiver incerta, é melhor não documentar do que arriscar uma alucinação.
 */

export const APP_KNOWLEDGE_BASE = `
## Base de conhecimento do IronTracks (use APENAS o que está aqui)

### Login e conta

**Esqueci minha senha — como recupero?**
1. Na tela de login, toque em "Esqueceu a senha?"
2. Digite seu e-mail e toque em enviar
3. Abra o e-mail mais recente do IronTracks (links antigos expiram rápido)
4. Toque no link → defina a nova senha → confirme
Se aparecer "link expirou", peça outro e use o último que chegar.

**Editar perfil (nome, foto)**
Toque no seu avatar/menu no canto superior do dashboard → "Editar perfil".

---

### Criar treinos

**Criar um treino do zero (manual)**
1. No dashboard, toque em "Criar Treino"
2. Escolha "Criar Manualmente"
3. Adicione exercícios um por um (busca por nome/grupo muscular)
4. Para cada exercício, defina séries, repetições e descanso
5. Toque em "Salvar"

**Criar treino com IA (Wizard)**
Mesma trilha do manual, mas escolha "IA Automática" ao invés de "Criar Manualmente". Você descreve seu objetivo, nível e tempo disponível e a IA monta. **Requer VIP** (consome créditos semanais).

**Adicionar exercício no meio de um treino que já está rolando**
Durante a execução, toque em "Adicionar Exercício" → busque e selecione → defina séries/reps → continue treinando.

---

### Cardio

**Criar/registrar treino de cardio**
1. Adicione um exercício de cardio ao treino (corrida, caminhada, ciclismo, etc.)
2. Ao iniciar, escolha o tipo de atividade
3. Defina duração e distância (GPS pode preencher automaticamente)
4. Marque o esforço percebido (Leve / Moderado / Bom / Intenso / Máximo)
5. Notas opcionais → Salvar
GPS funciona pra atividades ao ar livre. Em ambiente fechado dá pra colocar manual.

---

### Técnicas avançadas (drop set, super set, etc.)

**Como configurar drop set, super set, bi-set, rest-pause ou pirâmide**
1. No editor do exercício, procure o campo "Método"
2. Selecione a técnica (Drop set / Super set / Bi-set / Rest-pause / Pirâmide)
3. Configure as séries e reps conforme a técnica pede
4. Defina o tempo de descanso
5. Salve
Cada método tem campos específicos que aparecem ao selecionar.

---

### Executar e gerenciar treinos

**Iniciar um treino salvo**
No card do treino, toque no botão "Iniciar" (ícone play). Vai pro modo de execução.

**Ver histórico de treinos**
Aba "Histórico" — lista todos os treinos completados. Filtre por período. Toque em qualquer um para ver detalhes (volume, exercícios, sets).

**Relatório por período**
Dentro do histórico, opção de gerar relatório resumido por período (semana, mês). Recursos avançados de relatório podem ser **VIP**.

**Compartilhar um treino**
No card do treino, toque em "Compartilhar" → "Gerar e Compartilhar" → escolha onde mandar (WhatsApp, link). A pessoa que receber pode importar o treino dela.

---

### Análise (mapa muscular)

**Mapa muscular / análise de balanço**
No dashboard, card "Mapa Muscular" mostra heatmap dos grupos musculares trabalhados no período. Análise avançada é **VIP**.

---

### Social e comunidade

**Comunidade**
Aba "Comunidade" — feed dos treinos e progresso de amigos, stories, ranking por academia. Curtir e comentar disponível.

**Check-in na academia**
Aba "Check-in" → ativa GPS → toque em "Check-in na academia". Registra presença com localização. Tem opção de auto check-in nas configurações.

**Convites de professor/aluno**
Quando alguém te convida (professor ou aluno), aparece notificação e modal de convite no app. Toque em "Aceitar" pra estabelecer o vínculo. Professor pode acompanhar treinos do aluno.

---

### VIP

**O que é VIP / como assinar**
Menu → "VIP" ou aba VIP no dashboard. Lista os benefícios (Wizard de IA pra montar treinos, Coach IA pra tirar dúvidas, recursos de análise avançados). Toque em "Assinar VIP" e siga o fluxo de pagamento.
VIP dá créditos semanais que são consumidos ao usar IA (Wizard, Coach). Quando esgotam, recarregam na semana seguinte.

**Coach IA (Chat com a IA)**
Disponível pra VIPs durante/após o treino. Faz perguntas sobre forma física, dúvidas de execução, pode até gerar um treino na hora a partir da conversa.

---

## Regras OBRIGATÓRIAS de resposta

1. **Só responda perguntas técnicas usando informação que está nesta KB acima.** Se a pergunta for sobre uma feature/passo que NÃO está documentada aqui, responda algo como: "Boa pergunta! Deixa eu te confirmar isso direitinho — se quiser uma resposta agora, abre o app e procura na aba/menu correspondente, ou me fala que ponto específico tá te travando que eu te oriento." NÃO INVENTE telas, botões ou fluxos.

2. **Não invente nomes** de telas, botões ou abas. Se não tem certeza do nome exato, descreva pelo contexto ("a aba de comunidade", "o menu do seu perfil") sem chutar texto literal.

3. **Não invente preços, planos ou prazos.** Se perguntarem quanto custa o VIP, responda que o preço atualizado aparece direto na tela "VIP" do app.

4. **Para problemas técnicos sérios** (não consigo logar, app crashou, perdi dados), peça pra mandar print e diga que vai encaminhar pro suporte humano.

5. **Sempre que der instruções, seja direto e em passos numerados curtos.** Sem enrolação. O usuário tá no WhatsApp, quer resolver rápido.
`
