import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Clock, LogOut } from "lucide-react";

export default async function WaitApprovalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Se não estiver logado, manda pro login
  if (!user) {
    redirect("/auth/login");
  }

  const email = String(user.email || "").trim().toLowerCase();
  if (email === "apple-test@irontracks.com.br") {
    redirect("/dashboard");
  }

  // Verifica se já foi aprovado (para evitar ficar preso aqui)
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_approved")
    .eq("id", user.id)
    .single();

  if (profile?.is_approved) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl animate-in fade-in zoom-in duration-500">
        <div className="w-20 h-20 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-yellow-500/20 animate-pulse">
          <Clock className="w-10 h-10 text-yellow-500" />
        </div>

        <h1 className="text-2xl font-black text-white mb-2 italic tracking-tight">
          AGUARDANDO APROVAÇÃO
        </h1>
        
        <div className="h-1 w-16 bg-gradient-to-r from-yellow-500 to-amber-600 rounded-full mx-auto mb-6" />

        <p className="text-neutral-400 mb-8 leading-relaxed">
          Seu cadastro foi realizado com sucesso! Para garantir a segurança da
          plataforma, um administrador precisa liberar seu acesso.
          <br/><br/>
          <span className="text-yellow-500/80 font-bold text-sm">Você receberá a liberação em breve.</span>
        </p>

        <div className="space-y-3">
          <Link
            href="/auth/logout"
            className="w-full py-4 px-6 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 group"
          >
            <LogOut size={18} className="group-hover:text-red-400 transition-colors" />
            Sair da conta
          </Link>
          
          <p className="text-[10px] text-neutral-700 mt-6 font-mono uppercase tracking-widest">
            ID: {user.id.slice(0, 8)}...
          </p>
        </div>
      </div>
    </div>
  );
}
