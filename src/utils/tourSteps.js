'use client'

export function getTourSteps({ role, hasCommunity }) {
  const r = String(role || '').toLowerCase()
  const isCoach = r === 'teacher' || r === 'admin'

  const base = [
    {
      id: 'menu',
      selector: '[data-tour="header-menu"]',
      title: 'Menu do app',
      body: 'Aqui você acessa histórico, configurações e atalhos.\n\nVocê também consegue reabrir este tour quando quiser.',
    },
    {
      id: 'tabs',
      selector: '[data-tour="tabs"]',
      title: 'Abas do dashboard',
      body: 'Use essas abas para alternar entre Treinos, Avaliações e (se liberado) Comunidade.',
    },
    {
      id: 'start',
      selector: '[data-tour="workout-start"]',
      title: 'Começar um treino',
      body: 'Toque em “Iniciar treino” para abrir o treino ativo e registrar suas séries.',
    },
    {
      id: 'muscle-map',
      selector: '[data-tour="muscle-map"]',
      title: 'Mapa muscular',
      body: 'Este painel mostra sua distribuição de volume na semana por músculo.\n\nSe algum exercício não aparecer, use “Histórico” dentro do card para reprocessar.',
    },
  ]

  const community = hasCommunity
    ? [
        {
          id: 'community',
          selector: '[data-tour="tab-community"]',
          title: 'Comunidade',
          body: 'Aqui você acompanha a comunidade e interações sociais.',
        },
      ]
    : []

  const coach = isCoach
    ? [
        {
          id: 'admin-open',
          selector: '[data-tour="adminpanel.root"]',
          title: 'Painel de controle',
          body: 'Como professor, o Painel de Controle é o centro da operação: alunos, treinos, acompanhamentos e tarefas do dia.',
          action: { name: 'openAdminPanel', args: ['dashboard'] },
        },
        {
          id: 'admin-tabs',
          selector: '[data-tour="adminpanel.tabs"]',
          title: 'Abas do painel',
          body: 'Aqui você troca entre Dashboard, Alunos, Treinos/Templates e outras áreas do painel.',
        },
        {
          id: 'admin-inbox',
          selector: '[data-tour="adminpanel.dashboard.coachInbox"]',
          title: 'Coach Inbox',
          body: 'Seu feed de prioridade: alunos que precisam de atenção. Clique em um aluno para abrir detalhes e agir rápido.',
        },
        {
          id: 'admin-students',
          selector: '[data-tour="adminpanel.students.search"]',
          title: 'Buscar aluno',
          body: 'Use a busca e filtros para encontrar alunos rapidamente.\n\nDepois, abra o aluno para ver treino, check-ins e vídeos.',
          action: { name: 'openAdminPanel', args: ['students'] },
        },
        {
          id: 'admin-student-workouts',
          selector: '[data-tour="adminpanel.student.workouts.create"]',
          title: 'Ação principal',
          body: 'No aluno, você consegue criar treino e consultar histórico.\n\nEsse é o fluxo principal do professor.',
        },
      ]
    : []

  return [...base, ...community, ...coach]
}
