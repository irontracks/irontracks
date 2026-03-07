# ADR 003 — Capacitor com webDir: 'out' (Next.js Static Export)

**Data**: 2025-03  
**Status**: Accepted  
**Autores**: Time IronTracks

---

## Contexto

O IronTracks é primariamente uma web app (Next.js 14 App Router), mas também
precisa ser distribuído como app nativo iOS e Android via Capacitor 6.

Para empacotar uma web app no Capacitor, é necessário apontar `webDir` no
`capacitor.config.ts` para a pasta que contém o build estático.

Foram consideradas duas opções:

1. **`webDir: 'public'`** — pasta padrão de assets estáticos do Next.js
2. **`webDir: 'out'`** — output do `next export` / `output: 'export'`

---

## Decisão

**`webDir: 'out'`** com `output: 'export'` no `next.config.ts`.

---

## Justificativa

O Next.js 14 App Router gera um build estático completo em `/out` quando
`output: 'export'` está configurado. Este build inclui:

- Todas as páginas pré-renderizadas como HTML estático
- Assets JS/CSS otimizados e com hash para cache busting
- Imagens processadas pelo `next/image` (com `unoptimized: true` para export)

A pasta `public/` contém apenas assets estáticos crus (ícones, fontes locais)
e **não** contém o build compilado — apontar `webDir` para ela resultaria em
um app nativo sem JavaScript algum.

---

## Configuração

**`capacitor.config.ts`**:
```ts
const config: CapacitorConfig = {
  webDir: 'out',   // ← output do next build + next export
}
```

**`next.config.ts`**:
```ts
const nextConfig = {
  output: 'export',
  // ...
}
```

**Script de build nativo** (`package.json`):
```bash
next build && npx cap sync
```

---

## Consequências

**Positivas**:
- Build nativo usa o mesmo output otimizado do build web
- Cache busting automático via hashes no bundle
- Compatível com App Router do Next.js 14

**Negativas / Trade-offs**:
- `output: 'export'` desabilita features que exigem servidor (Server Actions,
  API Routes dinâmicas) no contexto nativo — essas features precisam de URL
  apontando para o servidor web em produção
- O app nativo faz chamadas à API web em produção, não a um servidor local
  (configurado via `NEXT_PUBLIC_CAPACITOR_URL`)
- Hot reload no desenvolvimento mobile requer servidor local rodando

---

## Desenvolvimento Mobile Local

Para dev mobile apontar o Capacitor para o servidor Next.js local:

```env
# .env.local
NEXT_PUBLIC_CAPACITOR_URL=http://192.168.x.x:3000
```

Ver [MOBILE_GUIDE.md](../../MOBILE_GUIDE.md) para instruções completas.
