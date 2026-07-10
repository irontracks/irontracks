import { ImageResponse } from 'next/og'

export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

// Logo servida via URL absoluta — o gerador de imagem (Satori) não lê arquivos
// locais de `public/`, só busca por HTTP(S). O arquivo já existe em
// public/logo-irontracks.png e é servido normalmente pelo Next.
const LOGO_URL = 'https://irontracks.com.br/logo-irontracks.png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          padding: 72,
          gap: 64,
          background: '#0a0a0a',
          color: '#ffffff',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        }}
      >
        <img
          src={LOGO_URL}
          alt="IronTracks"
          width={360}
          height={360}
          style={{ borderRadius: 32, flexShrink: 0 }}
        />

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 34, fontWeight: 900, color: '#fbbf24', letterSpacing: 1 }}>
            ALTA PERFORMANCE
          </div>
          <div style={{ marginTop: 22, fontSize: 32, color: '#d4d4d4', fontWeight: 600, maxWidth: 620 }}>
            Track your workouts and progress with IronTracks.
          </div>
          <div style={{ marginTop: 40, fontSize: 24, color: '#fbbf24', fontWeight: 900 }}>
            irontracks.com.br
          </div>
        </div>
      </div>
    ),
    size,
  )
}
