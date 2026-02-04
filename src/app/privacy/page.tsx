export default function PrivacyPolicy() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 text-neutral-200">
      <h1 className="text-3xl font-bold text-white mb-8">Política de Privacidade do IronTracks</h1>
      
      <p className="mb-4">Última atualização: {new Date().toLocaleDateString()}</p>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">1. Introdução</h2>
        <p className="mb-4">
          Bem-vindo ao IronTracks. Nós respeitamos sua privacidade e estamos comprometidos em proteger seus dados pessoais. 
          Esta política de privacidade explicará como tratamos suas informações quando você usa nosso aplicativo.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">2. Dados que Coletamos</h2>
        <p className="mb-2">Coletamos apenas as informações necessárias para o funcionamento do aplicativo:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Informações de Identificação:</strong> Nome e endereço de e-mail (utilizados para criação de conta e login).</li>
          <li><strong>Dados de Saúde e Fitness:</strong> Histórico de treinos, exercícios realizados, cargas, repetições e notas pessoais sobre o treino.</li>
          <li><strong>Mídia:</strong> Fotos ou vídeos que você opte voluntariamente por enviar para seus registros de progresso.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">3. Como Usamos Seus Dados</h2>
        <p className="mb-2">Suas informações são utilizadas exclusivamente para:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Fornecer a funcionalidade principal do aplicativo (registrar e visualizar treinos).</li>
          <li>Autenticar sua identidade e manter sua conta segura.</li>
          <li>Melhorar a experiência do usuário e corrigir erros.</li>
        </ul>
        <p className="mt-4 font-semibold text-white">Não vendemos nem compartilhamos seus dados pessoais com terceiros para fins de marketing ou publicidade.</p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">4. Armazenamento de Dados</h2>
        <p>
          Seus dados são armazenados de forma segura em nuvem utilizando os serviços do Supabase. 
          Implementamos medidas de segurança técnicas para proteger suas informações contra acesso não autorizado.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">5. Seus Direitos</h2>
        <p className="mb-2">Você tem o direito de:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Acessar seus dados pessoais a qualquer momento através do aplicativo.</li>
          <li>Solicitar a correção de dados incorretos.</li>
          <li>Solicitar a exclusão completa da sua conta e de todos os dados associados. Para isso, utilize a opção "Excluir Conta" nas configurações do aplicativo ou entre em contato conosco.</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold text-white mb-4">6. Contato</h2>
        <p>
          Se você tiver dúvidas sobre esta política de privacidade, entre em contato conosco pelo e-mail de suporte disponível na página da loja de aplicativos.
        </p>
      </section>
    </div>
  )
}
