import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LAB_PROTOCOL_RESPONSE_SCHEMA, labProtocolGenerationConfig, PROTOCOL_MAX_OUTPUT_TOKENS } from '../protocolContract'
import { LabProtocolSchema } from '@/schemas/labExam'

/**
 * Bug real (01/08/2026): o dono tocou em "Gerar protocolo" e recebeu
 * `protocol_failed`. O log mostrava um JSON que COMEÇAVA perfeito e o
 * `safeParse` reprovando.
 *
 * Causa, documentada dentro do próprio `utils/ai/gemini.ts`: o 2.5 Pro não
 * permite desligar o thinking, os tokens de raciocínio consomem o budget de
 * saída ANTES da resposta, e o JSON vem cortado. A chamada era
 * `getGeminiModel(apiKey, modelId)` — sem `responseSchema`, sem
 * `maxOutputTokens`.
 *
 * Cada tentativa custa uma chamada ao Pro cruzando 4 fontes.
 */
const ROUTE = readFileSync('src/app/api/ai/lab-exam-protocol/route.ts', 'utf8')

describe('structured output do protocolo', () => {
    it('a rota passa responseSchema e teto de saída ao modelo', () => {
        expect(ROUTE).toMatch(/getGeminiModel\(apiKey, env\.gemini\.modelId, labProtocolGenerationConfig\(\)\)/)
        const cfg = labProtocolGenerationConfig()
        expect(cfg.responseMimeType).toBe('application/json')
        expect(cfg.responseSchema).toBe(LAB_PROTOCOL_RESPONSE_SCHEMA)
        expect(cfg.maxOutputTokens).toBe(PROTOCOL_MAX_OUTPUT_TOKENS)
    })

    it('o teto de saída comporta um protocolo completo', () => {
        // Apertar aqui reproduz exatamente o truncamento que causou o bug.
        expect(PROTOCOL_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(8000)
    })

    it('o responseSchema cobre TODOS os campos que o Zod exige', () => {
        // Divergência entre os dois é como o bug volta: o modelo entrega o que o
        // responseSchema pede, e o Zod reprova pelo que ele NÃO pediu.
        const zodKeys = Object.keys(LabProtocolSchema.shape).sort()
        const schemaKeys = Object.keys(LAB_PROTOCOL_RESPONSE_SCHEMA.properties).sort()
        expect(schemaKeys).toEqual(zodKeys)
        expect([...LAB_PROTOCOL_RESPONSE_SCHEMA.required].sort()).toEqual(zodKeys)
    })

    it('os enums batem com os do Zod', () => {
        const sup = LAB_PROTOCOL_RESPONSE_SCHEMA.properties.supplementation.items.properties
        expect([...sup.priority.enum]).toEqual(['high', 'medium', 'low'])
        const alerta = LAB_PROTOCOL_RESPONSE_SCHEMA.properties.medicalAlerts.items.properties
        expect([...alerta.severity.enum]).toEqual(['urgent', 'moderate', 'watch'])
    })

    it('objetos aninhados declaram required — senão o modelo omite campo', () => {
        const t = LAB_PROTOCOL_RESPONSE_SCHEMA.properties.trainingProtocol
        expect([...t.required]).toContain('adjustments')
        const n = LAB_PROTOCOL_RESPONSE_SCHEMA.properties.nutritionProtocol
        expect([...n.required]).toContain('foodSuggestions')
        const f = LAB_PROTOCOL_RESPONSE_SCHEMA.properties.followUp
        expect([...f.required]).toContain('markersToWatch')
    })

    it('a falha registra ONDE quebrou, não só o começo da resposta', () => {
        // O log antigo tinha só `rawPreview` (300 chars) — não dava para separar
        // "veio truncado" de "campo inválido" sem gastar outra chamada ao Pro.
        expect(ROUTE).toMatch(/issues: validated\.error\.issues/)
        expect(ROUTE).toMatch(/rawLength: rawText\.length/)
    })
})
