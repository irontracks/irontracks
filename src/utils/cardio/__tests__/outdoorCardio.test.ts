import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { isOutdoorCardioName, hasOutdoorCardio, shouldShowCardioPanel } from '../outdoorCardio';

describe('isOutdoorCardioName', () => {
  it('reconhece deslocamento ao ar livre', () => {
    for (const name of [
      'Corrida',
      'Corrida na rua',
      'Caminhada leve',
      'Trote regenerativo',
      'Trilha',
      'Ciclismo',
      'Pedal',
      'Bike',
      'Bicicleta',
      'Running',
      'Walk',
      'Outdoor run',
    ]) {
      expect(isOutdoorCardioName(name), name).toBe(true);
    }
  });

  it('rejeita máquina parada — o GPS não sai do lugar', () => {
    for (const name of [
      'Esteira',
      'Esteira inclinada',
      'Treadmill',
      'Bike ergométrica',
      'Bicicleta ergométrica',
      'Elíptico',
      'Eliptico',
      'Transport',
      'Escada',
      'Stairmaster',
      'Remo',
      'Rowing',
      'Spinning',
      'Simulador de caminhada',
      'Indoor cycling',
    ]) {
      expect(isOutdoorCardioName(name), name).toBe(false);
    }
  });

  // O ponto que a heurística existe pra resolver: "bike ergométrica" e
  // "simulador de caminhada" contêm palavras de outdoor. Indoor tem que ganhar.
  it('dá precedência ao indoor quando os dois aparecem no mesmo nome', () => {
    expect(isOutdoorCardioName('Bike ergométrica')).toBe(false);
    expect(isOutdoorCardioName('Simulador de caminhada')).toBe(false);
    expect(isOutdoorCardioName('Corrida na esteira')).toBe(false);
  });

  it('é conservador com nome genérico ou vazio', () => {
    expect(isOutdoorCardioName('Cardio')).toBe(false);
    expect(isOutdoorCardioName('Aeróbico')).toBe(false);
    expect(isOutdoorCardioName('')).toBe(false);
    expect(isOutdoorCardioName(null)).toBe(false);
    expect(isOutdoorCardioName(undefined)).toBe(false);
  });

  it('ignora acento e caixa', () => {
    expect(isOutdoorCardioName('CORRIDA')).toBe(true);
    expect(isOutdoorCardioName('Elíptico')).toBe(false);
    expect(isOutdoorCardioName('eliptico')).toBe(false);
  });

  // "bike" dentro de "bikers" não conta — os padrões usam limite de palavra.
  it('não casa substring solta', () => {
    expect(isOutdoorCardioName('Bikers challenge')).toBe(false);
  });
});

describe('hasOutdoorCardio', () => {
  it('só considera exercícios com method Cardio', () => {
    expect(hasOutdoorCardio([{ method: 'Normal', name: 'Corrida' }])).toBe(false);
    expect(hasOutdoorCardio([{ method: 'Cardio', name: 'Corrida' }])).toBe(true);
    expect(hasOutdoorCardio([{ method: 'cardio', name: 'Caminhada' }])).toBe(true);
  });

  it('falso quando o cardio do treino é de máquina', () => {
    expect(
      hasOutdoorCardio([
        { method: 'Normal', name: 'Chest press máquina' },
        { method: 'Cardio', name: 'Esteira' },
      ]),
    ).toBe(false);
  });

  it('verdadeiro se ao menos um exercício qualifica', () => {
    expect(
      hasOutdoorCardio([
        { method: 'Cardio', name: 'Esteira' },
        { method: 'Cardio', name: 'Corrida ao ar livre' },
      ]),
    ).toBe(true);
  });

  it('aguenta lista vazia e itens inválidos', () => {
    expect(hasOutdoorCardio([])).toBe(false);
    expect(hasOutdoorCardio([null, undefined, 'x', 42])).toBe(false);
  });
});

// O painel deixou de ser fixo no topo do treino. O risco que isso cria é um só,
// e é grave: esconder o painel enquanto existe corrida viva deixa o tracking
// sem dono e o usuário perde o percurso. Estes testes travam esse invariante.
describe('shouldShowCardioPanel', () => {
  it('esconde só quando não há corrida nem cardio outdoor', () => {
    expect(shouldShowCardioPanel({
      workoutHasOutdoorCardio: false,
      recoveredRun: false,
      openedManually: false,
    })).toBe(false);
  });

  it('corrida recuperada do IDB SEMPRE mostra o painel', () => {
    // Mesmo num treino de peito, sem nada de cardio: a corrida existe e precisa
    // de uma porta de entrada.
    expect(shouldShowCardioPanel({
      workoutHasOutdoorCardio: false,
      recoveredRun: true,
      openedManually: false,
    })).toBe(true);
  });

  it('abertura manual SEMPRE mostra o painel', () => {
    expect(shouldShowCardioPanel({
      workoutHasOutdoorCardio: false,
      recoveredRun: false,
      openedManually: true,
    })).toBe(true);
  });

  it('cardio outdoor no treino mostra o painel sem ação do usuário', () => {
    expect(shouldShowCardioPanel({
      workoutHasOutdoorCardio: true,
      recoveredRun: false,
      openedManually: false,
    })).toBe(true);
  });

  // Monotonicidade: qualquer entrada verdadeira basta. Garante que nenhuma
  // condição futura possa "cancelar" uma corrida viva.
  it('é monotônico — nenhuma flag derruba as outras', () => {
    const combos = [false, true];
    for (const a of combos) for (const b of combos) for (const c of combos) {
      const out = shouldShowCardioPanel({
        workoutHasOutdoorCardio: a,
        recoveredRun: b,
        openedManually: c,
      });
      expect(out, `${a}/${b}/${c}`).toBe(a || b || c);
    }
  });
});

// Source-guard: o invariante acima só vale se o componente realmente usar a
// função pura e realmente montar o painel atrás dela. Se alguém voltar a
// inlinar a condição, este teste avisa.
describe('ActiveWorkout — fiação do painel', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/components/ActiveWorkout.tsx'),
    'utf-8',
  );

  it('decide a exibição pela função pura, não por condição inline', () => {
    expect(src).toContain('shouldShowCardioPanel({');
    expect(src).toContain('recoveredRun: hasRecoveredCardio');
  });

  it('consulta o IDB por corrida recuperada', () => {
    expect(src).toContain('recoverActiveCardio');
  });

  it('o painel é renderizado atrás de showCardioPanel', () => {
    expect(src).toMatch(/showCardioPanel\s*&&\s*\(\s*<CardioGPSPanel/);
  });
});
