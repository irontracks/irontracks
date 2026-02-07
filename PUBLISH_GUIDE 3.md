# Guia de Publicação na App Store (iOS)

Parabéns por rodar no simulador! 🎉 Agora vamos transformar isso em um app na loja.

## Passo 1: Preparar os Ícones e Splash Screen
Antes de enviar, o app precisa de ícones bonitos.
1. Use um site como [AppIcon.co](https://appicon.co) para gerar os ícones.
2. Arraste os arquivos gerados para a pasta `ios/App/App/Assets.xcassets/AppIcon.appiconset` (ou faça isso visualmente dentro do Xcode na aba "Assets").

## Passo 2: Configurar o App Store Connect
1. Acesse [App Store Connect](https://appstoreconnect.apple.com).
2. Clique em **"Meus Apps"** (My Apps) -> **"+"** -> **"Novo App"**.
3. Preencha os dados:
   - **Plataforma:** iOS
   - **Nome:** IronTracks
   - **Idioma:** Português (Brasil)
   - **Bundle ID:** Escolha o `com.irontracks.app` (deve aparecer na lista se você registrou o Identificador no portal de desenvolvedor. Se não aparecer, vá em [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list) e crie um App ID com `com.irontracks.app`).
   - **SKU:** `irontracks-001` (pode ser qualquer código interno).

## Passo 3: Criar o "Archive" (O arquivo do app)
1. No Xcode, selecione **"Any iOS Device (arm64)"** no seletor de dispositivos (topo da janela, onde estava o simulador).
2. No menu superior, vá em **Product** -> **Archive**.
   - *Isso vai compilar o app em modo de produção. Pode demorar alguns minutos.*
3. Quando terminar, abrirá a janela "Organizer" com o seu arquivo.

## Passo 4: Enviar para a Apple (Upload)
1. Na janela Organizer, selecione o arquivo recém-criado e clique em **"Distribute App"**.
2. Escolha **"App Store Connect"** -> **"Upload"**.
3. Siga os passos (Next, Next, Next...). Deixe as opções padrão de "Manage Version and Build Number" marcadas.
4. Clique em **Upload**.
   - *Se der erro de assinatura (Signing), volte na configuração do projeto e verifique se "Automatically manage signing" está marcado e sua conta selecionada.*

## Passo 5: TestFlight (Testes Internos)
1. Após o upload, espere uns 15-30 minutos (a Apple processa o arquivo).
2. No App Store Connect, vá na aba **TestFlight**.
3. Você verá sua versão lá. Adicione você mesmo como testador interno.
4. Baixe o app **TestFlight** no seu iPhone e instale o IronTracks por lá.

## Passo 6: Publicar (Review)
1. Se o TestFlight funcionou bem, vá na aba **App Store**.
2. Preencha as informações da loja (descrição, screenshots, política de privacidade).
   - *Dica: Você precisará tirar screenshots do simulador (iPhone 6.5" e 5.5") para subir.*
3. Em "Build", selecione a versão que você enviou.
4. Clique em **"Adicionar para Análise"** (Submit for Review).
5. A Apple revisará o app (geralmente leva 24-48h). Se aprovado, ele vai para a loja!

---

### ⚠️ Possíveis Problemas (Troubleshooting)
- **Erro de Push Notification:** Se você não configurou Push Notifications no portal da Apple, desligue a capability "Push Notifications" no Xcode se ela estiver ativada sem uso.
- **Erro de Permissão:** Se o app pedir câmera/foto e fechar, verifique o arquivo `Info.plist` no Xcode. Você precisa adicionar chaves como `Privacy - Camera Usage Description` com um texto explicando o uso.
