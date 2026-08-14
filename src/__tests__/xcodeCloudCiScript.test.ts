/**
 * Guard do Xcode Cloud (14/08/2026): o workflow 'App | Default' falhou em TODOS
 * os commits desde que foi criado porque o grafo SPM resolve os plugins
 * Capacitor por caminho dentro de node_modules e o runner clona sem Node.
 * O conserto é o ci_post_clone.sh — e este repo JÁ perdeu arquivo essencial em
 * reescrita de histórico (middleware, tabelas de team): o script não pode
 * sumir em silêncio.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SCRIPT = path.resolve(__dirname, '../../ios/App/ci_scripts/ci_post_clone.sh')

describe('ci_post_clone.sh do Xcode Cloud (14/08/2026)', () => {
  it('existe ao lado do .xcodeproj — é onde a Apple procura', () => {
    expect(fs.existsSync(SCRIPT)).toBe(true)
  })

  it('é executável — sem o bit, o Xcode Cloud ignora em silêncio', () => {
    const mode = fs.statSync(SCRIPT).mode
    expect(mode & 0o111, 'chmod +x perdido').toBeGreaterThan(0)
  })

  it('instala as dependências que o Package.swift referencia por path', () => {
    const src = fs.readFileSync(SCRIPT, 'utf8')
    expect(src).toContain('npm ci')
    expect(src).toContain('CI_PRIMARY_REPOSITORY_PATH')
  })
})
