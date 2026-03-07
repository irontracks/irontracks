## Diagnóstico
- O preview do WhatsApp/Telegram não usa `favicon`/`manifest` como prioridade. Ele usa principalmente **Open Graph** (`og:image`, `og:title`, `og:description`).
- No projeto já existe ícone (`/public/icone.png`) e `metadata.icons` no [layout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/layout.js), mas **não existe `openGraph`/`twitter`** no `metadata`, então o WhatsApp está caindo num placeholder (no seu print aparece o triângulo da Vercel).

## O que vou implementar
### 1) Adicionar Open Graph e Twitter metadata
- Em [layout.js](file:///Users/macmini/Documents/Projetos%20programação%20(trae)/App%20IronTracks/src/app/layout.js):
  - `metadataBase: new URL('https://irontracks.com.br')`
  - `openGraph: { title, description, url, siteName, type: 'website', images: ['/icone.png'] }`
  - `twitter: { card: 'summary_large_image', title, description, images: ['/icone.png'] }`

### 2) (Opcional recomendado) Criar uma imagem OG 1200x630
- Se você quiser um preview mais bonito (retângulo padrão do WhatsApp), vou adicionar `public/og.png` (1200x630) com branding IronTracks e trocar `images` para `['/og.png']`.

### 3) Garantir atualização do cache do WhatsApp
- WhatsApp cacheia o preview por URL. Depois de subir as metas, para “forçar” atualização:
  - usar uma URL com query (ex.: `https://irontracks.com.br/?v=2`) ou
  - rodar o re-scrape pelo Sharing Debugger do Meta.

## Validação
- Conferir o HTML gerado na home contém `og:image` apontando para `https://irontracks.com.br/icone.png` (ou `og.png`).
- Testar o link no WhatsApp com `?v=2` e confirmar que a miniatura agora é do IronTracks.