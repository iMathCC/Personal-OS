import type {
  PlanPriority,
  ProjectProgressDto,
  ProjectStatus,
  TaskStatus,
} from '@personal-os/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Aceita somente um UUID válido vindo da URL; valores inválidos não viram filtro. */
export function goalIdFromUrl(value: string | null): string {
  return value !== null && UUID.test(value) ? value : '';
}

/** `null` em progresso significa ausência de medição — nunca zero. */
export function formatPercent(value: number | null): string {
  return value === null ? 'Sem dados' : `${value.toFixed(1).replace(/\.0$/u, '')}%`;
}

export function formatLocalDate(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return 'Sem data';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export function formatInstant(value: string | null): string {
  if (value === null) return 'Sem registro';
  return value.replace('T', ' ').replace(/\.\d+Z$/u, ' UTC');
}

export function projectStatusLabel(status: ProjectStatus): string {
  switch (status) {
    case 'planned':
      return 'Planejado';
    case 'active':
      return 'Ativo';
    case 'paused':
      return 'Pausado';
    case 'completed':
      return 'Concluído';
    case 'cancelled':
      return 'Cancelado';
    case 'archived':
      return 'Arquivado';
  }
}

export function taskStatusLabel(status: TaskStatus): string {
  switch (status) {
    case 'todo':
      return 'A fazer';
    case 'in_progress':
      return 'Em andamento';
    case 'blocked':
      return 'Bloqueada';
    case 'completed':
      return 'Concluída';
    case 'cancelled':
      return 'Cancelada';
  }
}

export function priorityLabel(priority: PlanPriority): string {
  switch (priority) {
    case 'low':
      return 'Baixa';
    case 'medium':
      return 'Média';
    case 'high':
      return 'Alta';
    case 'critical':
      return 'Crítica';
  }
}

export function progressBasisLabel(basis: ProjectProgressDto['basis']): string {
  switch (basis) {
    case 'tasks':
      return 'Tarefas e marcos';
    case 'status':
      return 'Situação do projeto';
    case 'none':
      return 'Sem dados suficientes';
  }
}

export function activityLabel(
  state: 'active' | 'stalled' | 'paused' | 'unknown' | 'completed',
): string {
  switch (state) {
    case 'active':
      return 'Ativo';
    case 'stalled':
      return 'Sem atividade recente';
    case 'paused':
      return 'Pausado';
    case 'unknown':
      return 'Sem registro de atividade';
    case 'completed':
      return 'Encerrado';
  }
}
