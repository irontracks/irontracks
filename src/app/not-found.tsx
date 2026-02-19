"use client";

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-neutral-900 text-white flex items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-neutral-800 border border-neutral-700 rounded-2xl p-6">
        <h1 className="text-5xl font-black mb-2">404</h1>
        <h2 className="text-lg font-bold mb-2">Página não encontrada</h2>
        <p className="text-sm text-neutral-400 mb-4">A página que você procura não existe ou foi movida.</p>
        <Link href="/" className="inline-block w-full py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400">
          Voltar para o Início
        </Link>
      </div>
    </div>
  )
}
