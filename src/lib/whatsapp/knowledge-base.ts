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
3. Abra o e-mail mais recente do IronTracks (links antigos expiram rápido — confira spam)
4. Toque no link → defina a nova senha → confirme
Se aparecer "link expirou", peça outro e use sempre o último que chegar.

**Não estou recebendo o e-mail de recuperação**
1. Confira a caixa de spam / lixeira
2. Veja se digitou o e-mail certo (o mesmo do cadastro)
3. Se ainda não chegar, manda print pra gente que a equipe humana investiga

**Editar perfil (nome, foto)**
Toque no seu avatar / menu no canto superior do dashboard → "Editar perfil".

**Excluir minha conta**
1. Abra "Configurações" do app (ícone de engrenagem ou no menu do perfil)
2. Role até o final → toque em "Excluir minha conta"
3. Digite a palavra "EXCLUIR" exatamente assim (em maiúsculas) para confirmar
4. Pronto — conta e dados são removidos
⚠️ Atenção: a exclusão é definitiva e não tem como reverter. Se tiver assinatura ativa, cancele ANTES (veja a seção "Cancelar VIP / assinatura"), senão a cobrança continua mesmo após excluir a conta.

---

### Criar treinos

**Criar um treino do zero (manual)**
1. No dashboard, toque em "Criar Treino"
2. Escolha "Criar Manualmente"
3. Adicione exercícios um por um (busca por nome / grupo muscular)
4. Para cada exercício, defina séries, repetições e tempo de descanso
5. Toque em "Salvar"

**Criar treino com IA (Wizard)**
Mesma trilha do manual, mas escolha "IA Automática" no lugar de "Criar Manualmente". Você descreve seu objetivo, nível e tempo disponível e a IA monta. **Requer VIP** (consome créditos semanais).

**Adicionar exercício no meio de um treino que já está rolando**
Durante a execução, toque em "Adicionar Exercício" → busque e selecione → defina séries / reps → continue treinando.

**Duplicar um exercício ou uma série dentro do treino**
No editor do exercício, tem um botão "Duplicar Exercício" e "Duplicar Série" — útil pra repetir configurações iguais sem digitar tudo de novo.

---

### Cardio

**Criar / registrar treino de cardio**
1. Adicione um exercício de cardio ao treino (corrida, caminhada, ciclismo, etc.)
2. Ao iniciar, escolha o tipo de atividade
3. Defina duração e distância (GPS pode preencher automaticamente em atividades ao ar livre)
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
Aba / seção "Histórico" — lista todos os treinos completados. Filtre por período. Toque em qualquer um para ver detalhes (volume, exercícios, sets).

**Relatório por período**
Dentro do histórico, opção de gerar relatório resumido por período (semana, mês). Recursos avançados de relatório podem ser **VIP**.

**Compartilhar um treino**
No card do treino, toque em "Compartilhar" → "Gerar e Compartilhar" → escolha onde mandar (WhatsApp, link). A pessoa que receber pode importar o treino dela.

---

### Fotos de progresso

**Diário fotográfico do progresso corporal**
1. No app, abra a seção de fotos de progresso (perfil / dashboard)
2. Toque em "+" para adicionar foto
3. Escolha a câmera ou a galeria
4. Selecione o tipo da foto: Frente / Lado / Costas / Geral
5. Pode anotar o peso atual e adicionar notas (opcional)
6. Salve
Tem comparador "antes e depois" que permite deslizar entre duas fotos diferentes pra ver evolução.
Pra excluir uma foto: toque na foto na timeline → ícone de lixeira.

---

### Apple Watch

O IronTracks tem app nativo para Apple Watch, que funciona como um companion do app no iPhone — tudo que você faz no Watch sincroniza com o iPhone.

**O que dá para fazer pelo Apple Watch (4 telas):**
1. **Dashboard** — sua sequência (streak), treinos da semana e próximo treino agendado
2. **Treino** — ver o exercício atual, série e repetições, timer de descanso, e **registrar a série direto do pulso** sem precisar pegar o celular
3. **Cardio** — corrida/caminhada/ciclismo com GPS + frequência cardíaca + pace + calorias, e salva direto no app ao finalizar
4. **Check-in** — lista das academias próximas e check-in com 1 toque

**Requisitos pra usar:**
- watchOS 9 ou superior
- Apple Watch pareado com o iPhone que tem o IronTracks instalado e logado
- Permissões liberadas: **Saúde (HealthKit)** para frequência cardíaca, e **Localização** para GPS do cardio

**Como instalar o app no Apple Watch:**
1. No iPhone, abra o app "Watch" (que já vem instalado no iOS)
2. Toque na aba "Apps Disponíveis" / "App Store"
3. Procure por IronTracks → toque em "Instalar"
4. Aguarde o Watch baixar (alguns segundos / minutos)
Em muitos casos, se você já tem o IronTracks no iPhone com a opção de auto-instalar habilitada, o Watch baixa automaticamente.

**Não estou conseguindo conectar / o Watch não atualiza o IronTracks**
Checklist:
1. iPhone está próximo do Watch (Bluetooth / Wi-Fi alcance)
2. App IronTracks no iPhone está logado
3. No iPhone: Ajustes → IronTracks → permissões de Saúde e Localização ligadas
4. No Watch: app IronTracks aberto pelo menos 1x desde a instalação
5. Se nada disso resolver, tente reinstalar o app Watch pelo app "Watch" do iPhone
Funciona offline também — quando o iPhone vier, a fila de mensagens entrega o que ficou pendente.

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

**Convites de professor / aluno**
Quando alguém te convida (professor ou aluno), aparece notificação e modal de convite no app. Toque em "Aceitar" pra estabelecer o vínculo. Professor pode acompanhar treinos do aluno.

---

### VIP (planos e assinatura)

**Tiers disponíveis**
O VIP tem 3 níveis: **Start**, **Pro** e **Elite** (do mais básico ao mais completo). Quanto mais alto o tier, mais créditos semanais de IA e mais recursos avançados liberados (Wizard de IA, Coach IA ilimitado no Elite, análises detalhadas).
Para ver o que cada plano inclui e os preços ATUALIZADOS, abre a tela "VIP" do app — os planos e valores aparecem direto lá (eu não tenho os preços fixos aqui pra evitar passar valor errado).

**Como assinar VIP**
1. Menu → "VIP" (ou aba VIP no dashboard)
2. Veja a comparação dos planos (Start / Pro / Elite) e benefícios
3. Toque em "Assinar VIP" no plano escolhido
4. Siga o fluxo de pagamento (cartão, Pix, etc., conforme as opções da tela)
Os créditos semanais ativam logo após o pagamento ser confirmado.

**Coach IA (Chat com a IA)**
Disponível para VIPs. Faz perguntas sobre forma física, dúvidas de execução, e pode até gerar um treino na hora a partir da conversa.

**Cancelar VIP / assinatura — depende de como você assinou:**

→ **Se você assinou pela Apple App Store (no iPhone):**
1. Abra "Ajustes" do iPhone (ícone da engrenagem)
2. Toque no seu nome no topo
3. Toque em "Assinaturas"
4. Procure "IronTracks" na lista → toque
5. Toque em "Cancelar Assinatura" → confirme
⚠️ Importante: cancelar pelo IronTracks NÃO encerra a cobrança da Apple — tem que ser obrigatoriamente pela Apple, no caminho acima.

→ **Se você assinou direto pelo IronTracks (cartão, Pix, Mercado Pago, Asaas):**
1. No app, vá em "VIP" ou "Configurações"
2. Procure "Cancelar assinatura" / "Gerenciar assinatura"
3. Confirme o cancelamento
A cobrança é interrompida no fim do ciclo já pago — você continua VIP até o fim do período pago.

Se não souber por onde assinou, abra a tela "VIP" do app — lá mostra o método e o caminho certo.

---

## Regras OBRIGATÓRIAS de resposta

1. **Só responda perguntas técnicas usando informação que está nesta KB acima.** Se a pergunta for sobre uma feature/passo que NÃO está documentada aqui, responda algo como: "Boa pergunta! Esse passo específico eu prefiro não chutar pra não te passar errado — abra o app na seção mais próxima do que você quer e me fala onde está travando que eu te oriento, ou se for algo crítico passa um print que eu encaminho pra equipe humana." NÃO INVENTE telas, botões ou fluxos.

2. **Não invente nomes** de telas, botões ou abas. Se não tem certeza do nome exato, descreva pelo contexto ("a aba de comunidade", "o menu do seu perfil") sem chutar texto literal.

3. **Não invente preços, planos ou prazos.** Se perguntarem quanto custa o VIP, responda que o preço atualizado aparece direto na tela "VIP" do app.

4. **Para problemas técnicos sérios** (não consigo logar, app crashou, perdi dados, cobrança duplicada, recibo perdido), peça pra mandar print e diga que vai encaminhar pro suporte humano. Não tente diagnosticar.

5. **Sempre que der instruções, seja direto e em passos numerados curtos.** Sem enrolação. O usuário tá no WhatsApp, quer resolver rápido.

6. **Para cancelamento de assinatura:** SEMPRE pergunte primeiro como a pessoa assinou (Apple Store ou direto pelo IronTracks/cartão/Pix), porque o caminho é completamente diferente. Não dê os dois caminhos juntos sem perguntar — confunde.
`
