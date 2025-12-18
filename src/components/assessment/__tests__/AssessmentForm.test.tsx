import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AssessmentForm from '../AssessmentForm';

// Mock do hook useAssessment
jest.mock('../../../hooks/useAssessment', () => ({
  useAssessment: () => ({
    createAssessment: jest.fn().mockResolvedValue({ id: 'test-id' }),
    loading: false,
    error: null
  })
}));

// Mock do hook useAuth
jest.mock('../../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'trainer-123', email: 'trainer@test.com' }
  })
}));

describe('AssessmentForm', () => {
  const mockProps = {
    studentId: 'student-123',
    studentName: 'João Silva',
    onComplete: jest.fn(),
    onCancel: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renderiza o formulário de avaliação corretamente', () => {
    render(<AssessmentForm {...mockProps} />);
    
    expect(screen.getByText('Avaliação Física')).toBeInTheDocument();
    expect(screen.getByText('Informações Básicas')).toBeInTheDocument();
    expect(screen.getByText('Passo 1 de 5')).toBeInTheDocument();
  });

  test('permite preencher informações básicas', async () => {
    render(<AssessmentForm {...mockProps} />);
    
    // Preencher peso
    const weightInput = screen.getByLabelText('Peso (kg)');
    fireEvent.change(weightInput, { target: { value: '75.5' } });
    expect(weightInput).toHaveValue(75.5);
    
    // Preencher altura
    const heightInput = screen.getByLabelText('Altura (cm)');
    fireEvent.change(heightInput, { target: { value: '175' } });
    expect(heightInput).toHaveValue(175);
    
    // Preencher idade
    const ageInput = screen.getByLabelText('Idade');
    fireEvent.change(ageInput, { target: { value: '25' } });
    expect(ageInput).toHaveValue(25);
    
    // Selecionar gênero
    const genderSelect = screen.getByLabelText('Gênero');
    fireEvent.change(genderSelect, { target: { value: 'male' } });
    expect(genderSelect).toHaveValue('male');
  });

  test('calcula IMC automaticamente ao preencher peso e altura', async () => {
    render(<AssessmentForm {...mockProps} />);
    
    // Preencher peso e altura
    const weightInput = screen.getByLabelText('Peso (kg)');
    const heightInput = screen.getByLabelText('Altura (cm)');
    
    fireEvent.change(weightInput, { target: { value: '70' } });
    fireEvent.change(heightInput, { target: { value: '170' } });
    
    // Verificar se o IMC foi calculado (70 / (1.7 * 1.7) = 24.2)
    await waitFor(() => {
      expect(screen.getByText('IMC: 24.2')).toBeInTheDocument();
    });
  });

  test('navega entre os passos do formulário', async () => {
    render(<AssessmentForm {...mockProps} />);
    
    // Preencher informações básicas
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '75' } });
    fireEvent.change(screen.getByLabelText('Altura (cm)'), { target: { value: '175' } });
    fireEvent.change(screen.getByLabelText('Idade'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Gênero'), { target: { value: 'male' } });
    
    // Avançar para o próximo passo
    const nextButton = screen.getByText('Próximo');
    fireEvent.click(nextButton);
    
    // Verificar se mudou para o passo de medidas
    await waitFor(() => {
      expect(screen.getByText('Medidas Corporais')).toBeInTheDocument();
      expect(screen.getByText('Passo 2 de 5')).toBeInTheDocument();
    });
  });

  test('valida campos obrigatórios antes de avançar', async () => {
    render(<AssessmentForm {...mockProps} />);
    
    // Tentar avançar sem preencher campos obrigatórios
    const nextButton = screen.getByText('Próximo');
    fireEvent.click(nextButton);
    
    // Verificar se aparecem mensagens de erro
    await waitFor(() => {
      expect(screen.getByText('Peso é obrigatório')).toBeInTheDocument();
      expect(screen.getByText('Altura é obrigatória')).toBeInTheDocument();
      expect(screen.getByText('Idade é obrigatória')).toBeInTheDocument();
    });
  });
});