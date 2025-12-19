'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

export default function AuthCodeError() {
  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-neutral-800 p-8 rounded-2xl border border-neutral-700 max-w-md w-full shadow-2xl">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-red-500">
          <AlertTriangle size={32} />
        </div>
        
        <h1 className="text-2xl font-black text-white mb-2 uppercase">Erro de Autenticação</h1>
        
        <p className="text-neutral-400 mb-8 leading-relaxed">
          Não foi possível validar seu login. O link pode ter expirado ou já foi utilizado.
        </p>

        <Link
          href="/"
          className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-colors"
        >
          <ArrowLeft size={20} />
          Voltar para o Início
        </Link>
      </div>
    </div>
  );
}

