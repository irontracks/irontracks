"use client";

export default function GlobalError({ error, reset }) {
  return (
    <html>
      <body className="min-h-screen bg-neutral-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-800 border border-neutral-700 rounded-2xl p-6 text-center">
          <h2 className="text-xl font-black mb-2">Ops! Algo deu errado.</h2>
          <p className="text-sm text-neutral-300 mb-4">O aplicativo encontrou um erro inesperado.</p>
          <pre className="text-xs bg-black/40 p-3 rounded-lg text-left overflow-auto max-h-40 border border-neutral-700">
            {error?.message || String(error)}
          </pre>
          <button
            onClick={() => reset()}
            className="mt-4 w-full py-3 rounded-xl bg-yellow-500 text-black font-bold hover:bg-yellow-400"
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}

