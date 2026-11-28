import type { ExecutionRiskDto, TimelineEventDto } from '@personal-os/shared';

export function riskKindLabel(kind: ExecutionRiskDto['kind']): string {
  switch (kind) {
    case 'OVERDUE_TASK':
      return 'Tarefa atrasada';
    case 'BLOCKED_TASK':
      return 'Tarefa bloqueada';
    case 'STALLED_PROJECT':
      return 'Projeto sem atividade';
    case 'OVERDUE_MILESTONE':
      return 'Marco atrasado';
    case 'OVERDUE_PROJECT':
      return 'Projeto atrasado';
  }
}

export function severityLabel(severity: ExecutionRiskDto['severity']): string {
  switch (severity) {
    case 'low':
      return 'baixa';
    case 'medium':
      return 'média';
    case 'high':
      return 'alta';
  }
}

export function timelineKindLabel(kind: TimelineEventDto['kind']): string {
  switch (kind) {
    case 'project':
      return 'Projeto';
    case 'task':
      return 'Tarefa';
    case 'milestone':
      return 'Marco';
    case 'completion':
      return 'Conclusão';
  }
}

export function timelineInstant(value: string): string {
  return value.replace('T', ' ').replace(/\.\d+Z$/u, ' UTC');
}
