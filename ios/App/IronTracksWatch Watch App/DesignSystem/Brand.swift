//
//  Brand.swift
//  IronTracksWatch
//
//  A identidade do IronTracks no pulso — fonte ÚNICA de cor, superfície e
//  tipografia do app do relógio.
//
//  Criado em 02/09/2026 depois de uma revisão de design que encontrou TRÊS
//  dourados diferentes convivendo em cinco telas: `Color(red: 0.95, green: 0.78,
//  blue: 0.30)` escrito à mão em dois arquivos (que é #F2C74D, um amarelo mais
//  lavado que o da marca), `Color.yellow` do sistema (#FFCC00 no watchOS) e o
//  gradiente montado caso a caso. Ao lado do iPhone, isso lia como app de outra
//  empresa — identidade não é o logo, é a cor chegando idêntica em toda superfície.
//
//  As superfícies também eram um problema: `Color.black.opacity(0.4)` sobre fundo
//  preto, repetido em dez lugares. Em OLED isso não separa card de fundo — só
//  produz banding em brilho baixo. A hierarquia de profundidade do app grande
//  (#0a0a0a → #0f0f0e → #151514 → #1a1a18) resolve isso e é o mesmo vocabulário.
//

import SwiftUI

enum Brand {

    // ─── Cor ────────────────────────────────────────────────────────────────
    // Os hex canônicos do design system do IronTracks. Não invente variação:
    // se precisar de um tom novo, ele nasce aqui e vale para o app inteiro.

    /// #eab308 — o dourado da marca, cor da AÇÃO primária.
    static let gold = Color(red: 0xEA / 255, green: 0xB3 / 255, blue: 0x08 / 255)
    /// #fbbf24 — o dourado claro, para realce e texto sobre superfície escura.
    static let goldLight = Color(red: 0xFB / 255, green: 0xBF / 255, blue: 0x24 / 255)
    /// #b45309 — o dourado profundo, base do gradiente.
    static let goldDeep = Color(red: 0xB4 / 255, green: 0x53 / 255, blue: 0x09 / 255)

    /// Gradiente da marca. Claro em cima, profundo embaixo — a luz vem de cima,
    /// como no app grande.
    static let goldGradient = LinearGradient(
        colors: [goldLight, goldDeep],
        startPoint: .top,
        endPoint: .bottom
    )

    // Status — os MESMOS hex do app grande, não os do sistema.
    /// #22c55e
    static let success = Color(red: 0x22 / 255, green: 0xC5 / 255, blue: 0x5E / 255)
    /// #ef4444 — vermelho é erro e ação destrutiva. Nada mais.
    static let danger = Color(red: 0xEF / 255, green: 0x44 / 255, blue: 0x44 / 255)
    /// #f97316 — alerta intermediário (fila pendente, sem conexão).
    static let warning = Color(red: 0xF9 / 255, green: 0x73 / 255, blue: 0x16 / 255)

    // ─── Superfície ─────────────────────────────────────────────────────────
    // Opacas, não pretas translúcidas: em OLED, preto sobre preto não separa.

    /// #0a0a0a — o chão.
    static let base = Color(red: 0x0A / 255, green: 0x0A / 255, blue: 0x0A / 255)
    /// #151514 — a superfície de card. É ela que faz o card EXISTIR.
    static let surface = Color(red: 0x15 / 255, green: 0x15 / 255, blue: 0x14 / 255)
    /// #1a1a18 — superfície elevada (tile dentro de card).
    static let surfaceRaised = Color(red: 0x1A / 255, green: 0x1A / 255, blue: 0x18 / 255)
    /// Borda ultra-sutil — o mesmo `rgba(255,255,255,0.06)` do app grande.
    static let hairline = Color.white.opacity(0.06)

    // ─── Tipografia ─────────────────────────────────────────────────────────
    //
    // ⚠️ PISO DE 11pt. O app tinha `.system(size: 8)` e `size: 9` em rótulo de
    // tile durante corrida — a 40 cm do olho, com o braço em movimento e a
    // frequência cardíaca em 160. A HIG da Apple põe 12pt como piso funcional
    // no watchOS; abaixo disso o texto vira textura. No iPhone 9px em eyebrow
    // label se defende; no pulso, não.

    /// Rótulo de tile/eyebrow. O menor tamanho que este app pode usar.
    static let labelFont = Font.system(size: 11, weight: .semibold)
    /// Valor numérico de tile.
    static let tileValueFont = Font.system(size: 20, weight: .bold, design: .rounded).monospacedDigit()
    /// A métrica herói (distância na corrida, cronômetro de descanso).
    static let heroFont = Font.system(size: 34, weight: .heavy, design: .rounded).monospacedDigit()
    /// Segunda métrica — existe para haver hierarquia, não empate.
    static let secondaryMetricFont = Font.system(size: 24, weight: .bold, design: .rounded).monospacedDigit()
}

// ─── Modificadores ──────────────────────────────────────────────────────────

extension View {
    /// A superfície de card do IronTracks: opaca, com borda hairline.
    /// Substitui os dez `Color.black.opacity(0.4)` espalhados pelas telas.
    func brandCard(cornerRadius: CGFloat = 10) -> some View {
        self
            .background(Brand.surface, in: RoundedRectangle(cornerRadius: cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(Brand.hairline, lineWidth: 1)
            )
    }

    /// Superfície de tile (dentro de um card) — um degrau acima.
    func brandTile(cornerRadius: CGFloat = 8) -> some View {
        self
            .background(Brand.surfaceRaised, in: RoundedRectangle(cornerRadius: cornerRadius))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius)
                    .stroke(Brand.hairline, lineWidth: 1)
            )
    }
}
