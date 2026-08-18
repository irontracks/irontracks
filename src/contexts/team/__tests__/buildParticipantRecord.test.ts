import { describe, it, expect } from 'vitest'
import { buildParticipantRecord, normalizeParticipant } from '../types'

/**
 * O host da sessão em dupla era gravado com nome/foto undefined (o `user` do
 * treino em dupla é só {id, email}), aparecendo como "Parceiro" sem foto no
 * painel/chat. buildParticipantRecord centraliza a escrita no formato do banco
 * ({uid,name,photo}) com nome/foto reais do perfil.
 */
describe('buildParticipantRecord', () => {
  it('grava uid, nome e foto no formato do banco', () => {
    expect(buildParticipantRecord('u1', 'João Silva', 'https://x/p.jpg')).toEqual({
      uid: 'u1', name: 'João Silva', photo: 'https://x/p.jpg',
    })
  })

  it('foto vazia/ausente vira null (não string vazia)', () => {
    expect(buildParticipantRecord('u1', 'João', '').photo).toBeNull()
    expect(buildParticipantRecord('u1', 'João', undefined).photo).toBeNull()
    expect(buildParticipantRecord('u1', 'João', null).photo).toBeNull()
  })

  it('nome ausente vira string vazia (não "undefined")', () => {
    expect(buildParticipantRecord('u1', undefined, null).name).toBe('')
    expect(buildParticipantRecord('u1', null, null).name).toBe('')
  })

  it('faz trim de uid/nome/foto', () => {
    expect(buildParticipantRecord('  u1  ', '  João  ', '  p.jpg  ')).toEqual({
      uid: 'u1', name: 'João', photo: 'p.jpg',
    })
  })

  it('o resultado é lido de volta corretamente por normalizeParticipant', () => {
    const rec = buildParticipantRecord('u1', 'João', 'p.jpg')
    const norm = normalizeParticipant(rec)
    expect(norm.userId).toBe('u1')
    expect(norm.displayName).toBe('João')
    expect(norm.photoUrl).toBe('p.jpg')
  })
})
