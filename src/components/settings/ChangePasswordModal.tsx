'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Lock, Eye, EyeOff, Loader2, Check, X } from 'lucide-react'

interface ChangePasswordModalProps {
  isOpen: boolean
  onClose: () => void
  userEmail: string
}

export default function ChangePasswordModal({ isOpen, onClose, userEmail }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  if (!isOpen) return null

  const handleSubmit = async () => {
    setError('')
    const cur = currentPassword.trim()
    const np = newPassword.trim()
    const cp = confirmPassword.trim()

    if (!cur) { setError('Digite sua senha atual.'); return }
    if (np.length < 6) { setError('A nova senha deve ter pelo menos 6 caracteres.'); return }
    if (np !== cp) { setError('As senhas não coincidem.'); return }

    setSaving(true)
    try {
      const supabase = createClient()

      // Verify current password
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: cur,
      })
      if (signInError) {
        setError('Senha atual incorreta.')
        setSaving(false)
        return
      }

      // Update to new password
      const { error: updateError } = await supabase.auth.updateUser({ password: np })
      if (updateError) {
        setError(updateError.message || 'Erro ao atualizar senha.')
        setSaving(false)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        onClose()
      }, 1500)
    } catch {
      setError('Erro inesperado. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (saving) return
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setError('')
    setSuccess(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[1400] flex items-center justify-center p-4">
      <button type="button" aria-label="Fechar" onClick={handleClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm border-0 cursor-default" />
      <div role="dialog" aria-modal="true" aria-label="Trocar senha" className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-500/10 rounded-full flex items-center justify-center">
              <Lock size={18} className="text-yellow-500" />
            </div>
            <h2 className="text-lg font-black text-white">Trocar Senha</h2>
          </div>
          <button type="button" onClick={handleClose} className="text-neutral-500 hover:text-white p-1">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-14 h-14 bg-emerald-500/15 rounded-full flex items-center justify-center">
              <Check size={24} className="text-emerald-400" />
            </div>
            <p className="text-emerald-300 font-bold text-sm">Senha alterada com sucesso!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Current Password */}
            <div>
              <label htmlFor="cp-current" className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Senha Atual</label>
              <div className="relative">
                <input
                  id="cp-current"
                  aria-label="Senha atual"
                  type={showPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-yellow-500/50 pr-10"
                  placeholder="Digite sua senha atual"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label htmlFor="cp-new" className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Nova Senha</label>
              <input
                id="cp-new"
                aria-label="Nova senha"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-yellow-500/50"
                placeholder="Mínimo 6 caracteres"
                autoComplete="new-password"
              />
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="cp-confirm" className="block text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1.5">Confirmar Nova Senha</label>
              <input
                id="cp-confirm"
                aria-label="Confirmar nova senha"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-neutral-800 border border-neutral-700 rounded-xl text-white text-sm focus:outline-none focus:border-yellow-500/50"
                placeholder="Repita a nova senha"
                autoComplete="new-password"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <p className="text-red-300 text-xs font-medium">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="w-full py-3 rounded-xl font-black text-sm text-black bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : null}
              {saving ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
