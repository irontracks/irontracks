# Plano Final de Correção - Revisão Apple (IronTracks iOS)

## Objetivo: Aprovação na App Store
Resolver **todas** as pendências apontadas pela Apple (Guidelines 2.1, 2.2, 3.1.1, 4.8) e as solicitações adicionais do usuário (Versão 1.0, Esconder VIP).

---

## 1. Correções Críticas (Impedem Aprovação)

### ✅ A. Crash da Câmera (Guideline 2.1)
**Problema:** O app fecha ao tentar abrir a câmera porque faltam permissões no `Info.plist`.
**Solução:** Adicionar as chaves obrigatórias em `ios/App/App/Info.plist`:
1.  `NSCameraUsageDescription`: "Necessário para escanear QR Codes e tirar fotos de perfil."
2.  `NSPhotoLibraryUsageDescription`: "Necessário para escolher foto de perfil da galeria."
3.  `NSPhotoLibraryAddUsageDescription`: "Necessário para salvar imagens."
4.  `NSMicrophoneUsageDescription`: "Necessário para vídeos de execução."

### ✅ B. Erro no Login Apple (Guideline 4.8)
**Problema:** O fluxo atual via web retornou erro para o revisor. A Apple exige implementação nativa.
**Solução:**
1.  Instalar plugin `@capacitor-community/apple-sign-in`.
2.  Atualizar `src/components/LoginScreen.tsx` para detectar iOS nativo.
3.  Implementar chamada nativa `SignInWithApple.authorize()` que é mais robusta e aprovada pela Apple.
4.  Integrar resposta (ID Token) com `supabase.auth.signInWithIdToken`.

### ✅ C. Funcionalidades Incompletas/Beta (Guideline 2.2)
**Problema:** O app exibe "Beta" na tela de login e a Apple rejeita apps "beta" na loja.
**Solução:**
1.  Editar `src/lib/version.ts`: Alterar de `v4.0 Beta` para **`v1.0`**.
2.  Remover qualquer menção visual a "Beta" no app.

### ✅ D. Conteúdo Pago/VIP (Guideline 3.1.1)
**Problema:** A Apple rejeita apps que vendem conteúdo digital sem usar IAP (In-App Purchase).
**Solução:**
1.  Editar `src/components/dashboard/StudentDashboard3.tsx`.
2.  Adicionar verificação `Capacitor.getPlatform() === 'ios'`.
3.  Se for iOS, **forçar ocultação da aba VIP** e qualquer botão de upgrade. O app parecerá 100% gratuito/funcional para o revisor.

---

## 2. Ações do Usuário (Pós-Implementação)
*   **Gerar novo Build:** Após minhas correções, você precisará gerar um novo arquivo `.ipa` (Product > Archive no Xcode).
*   **Notas de Revisão:** No App Store Connect, forneça uma conta de teste válida (ex: `apple-test@irontracks.com.br` / `senha123`) para que o revisor consiga logar sem problemas.

---

## 3. Ordem de Execução
1.  Ajustar `version.ts` e `Info.plist` (Rápido).
2.  Ocultar VIP no Dashboard (Rápido).
3.  Implementar Login Apple Nativo (Complexo - requer instalação de pacote).
4.  Verificar e finalizar.
