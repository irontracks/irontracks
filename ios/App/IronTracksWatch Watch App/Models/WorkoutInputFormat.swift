//
//  WorkoutInputFormat.swift
//  IronTracksWatch
//
//  Formatação e parsing dos campos de carga/reps. Só Foundation — sem SwiftUI —
//  justamente pra poder ser exercitado isoladamente.
//

import Foundation

enum WorkoutInputFormat {

    /// Carga pra exibição, em pt-BR: 7.5 → "7,5 kg" · 20 → "20 kg" · 0 → "—".
    ///
    /// O formato antigo era `Int(peso)`, que truncava: 7,5 kg aparecia como "7".
    /// Como os incrementos são de 2,5 em 2,5, metade dos valores possíveis era
    /// exibida errada.
    static func weight(_ kg: Double) -> String {
        guard kg > 0 else { return "—" }
        let rounded = (kg * 10).rounded() / 10
        if rounded == rounded.rounded() {
            return "\(Int(rounded)) kg"
        }
        return String(format: "%.1f", rounded).replacingOccurrences(of: ".", with: ",") + " kg"
    }

    /// mm:ss a partir de segundos.
    static func time(_ seconds: Int) -> String {
        let safe = max(0, seconds)
        return String(format: "%d:%02d", safe / 60, safe % 60)
    }

    /// Primeiro inteiro de uma string de repetições ("8-12" → 8, "12" → 12, "até a falha" → nil).
    static func firstInt(in text: String) -> Int? {
        let runs = text.split(whereSeparator: { !$0.isNumber })
        guard let first = runs.first else { return nil }
        return Int(first)
    }

    /// Primeiro decimal de uma sugestão de carga ("22,5kg" → 22.5, "20kg" → 20, "corporal" → nil).
    static func firstDouble(in text: String) -> Double? {
        var digits = ""
        var separatorUsed = false
        for ch in text {
            if ch.isNumber {
                digits.append(ch)
            } else if ch == "," || ch == "." {
                // Só o PRIMEIRO separador conta; o segundo encerra o número
                // ("1.234.5" não pode virar um decimal maluco).
                if separatorUsed { break }
                if digits.isEmpty { continue }
                separatorUsed = true
                digits.append(".")
            } else if !digits.isEmpty {
                break // acabou o número, o resto é unidade ("kg")
            }
        }
        if digits.hasSuffix(".") { digits.removeLast() }
        return digits.isEmpty ? nil : Double(digits)
    }
}
