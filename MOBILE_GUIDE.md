# Guia Mobile (iOS) - IronTracks

Este guia explica como rodar e publicar a versão iOS do IronTracks usando Capacitor.

## 1. Configuração Inicial (Já feita)
O projeto foi configurado para usar o **Capacitor** em modo "Server URL".
Isso significa que o app nativo é um "container" que carrega o site de produção.

- **Vantagem:** Não precisa reescrever API routes. O app está sempre atualizado com o site.
- **Arquivo de Config:** `capacitor.config.ts`

## 2. Antes de abrir o Xcode
Verifique se a URL no arquivo `capacitor.config.ts` está correta:
```typescript
server: {
  url: 'https://irontracks.vercel.app', // <--- SUA URL DE PRODUÇÃO
  cleartext: true
}
```
Se você mudar a URL, rode no terminal:
```bash
npm run cap:sync
```

## 3. Abrindo no Xcode
Para iniciar o desenvolvimento nativo:
```bash
npm run cap:open
```
Isso abrirá o Xcode automaticamente.

## 4. Configurando Assinatura (Signing)
1. No Xcode, clique em **App** (ícone azul no topo da árvore de arquivos à esquerda).
2. Selecione a aba **Signing & Capabilities**.
3. Em **Team**, selecione sua conta de desenvolvedor Apple (agora aprovada! 🚀).
4. Certifique-se que o **Bundle Identifier** é `com.irontracks.app` (ou o que você definiu na Apple).

## 5. Rodando o App
1. Conecte seu iPhone via cabo (ou selecione um simulador no topo).
2. Clique no botão **Play (▶)** no topo esquerdo do Xcode.
3. O app será instalado e abrirá carregando seu site.

## Dicas Importantes
- **Safe Areas:** Se o topo ou rodapé ficarem cortados (notch), precisaremos ajustar o CSS do site (`padding-top: env(safe-area-inset-top)`).
- **Status Bar:** O Capacitor tenta gerenciar a cor, mas podemos forçar via plugin se necessário.
- **App Store:** Para enviar, use o menu **Product > Archive** no Xcode e siga o fluxo de distribuição (TestFlight/App Store Connect).
