import { validationError } from './errors';
import { isLocalDate } from './studies';
import { stableHash } from './life';
import type { DatePeriod } from './intelligence';
import type {
  DecisionAlert,
  DecisionComparisonMode,
  DecisionDatePeriod,
  DecisionNextAction,
  DecisionRecommendation,
  DecisionReview,
  DecisionSufficiency,
} from './decision';
import type { PerformancePeriods } from './performance';

/**
 * Motor de adaptação pessoal. Determinístico, local e explicável: detecta
 * desvios a partir de fatos observados, avalia impacto, sugere alternativas e
 * simula cenários sem executar nenhuma ação automaticamente. Nenhuma IA
 * externa é usada e nenhum dado é inventado.
 */

export const ADAPTATION_ALGORITHMS = Object.freeze({
  deviation: 'adaptation-deviation-v1',
  impact: 'adaptation-impact-v1',
  proposal: 'adaptation-proposal-v1',
  alternative: 'adaptation-alternative-v1',
  simulation: 'adaptation-simulation-v1',
  decision: 'adaptation-decision-v1',
  outcome: 'adaptation-outcome-v1',
});

export type AdaptationSeverity = 'info' | 'attention' | 'risk' | 'critical';
export type AdaptationProposalStatus = 'open' | 'accepted' | 'rejected' | 'deferred';
export type AdaptationDecisionAction = 'accept' | 'reject' | 'defer';
export type AdaptationConfidence = 'low' | 'medium' | 'high';

export interface AdaptationEvidence {
  readonly source: string;
  readonly label: string;
  readonly value: string;
  readonly period: DatePeriod;
  readonly method: string;
  readonly limitations: readonly string[];
}

export interface AdaptationDeviation {
  readonly id: string;
  readonly kind: string;
  readonly severity: AdaptationSeverity;
  readonly area: string;
  readonly title: string;
  readonly summary: string;
  readonly observed: string;
  readonly expected: string;
  readonly gap: string;
  readonly confidence: AdaptationConfidence;
  readonly confidenceScore: number;
  readonly period: DatePeriod;
  readonly evidence: readonly AdaptationEvidence[];
  readonly sources: readonly string[];
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

export interface AdaptationImpact {
  readonly id: string;
  readonly deviationId: string;
  readonly severity: AdaptationSeverity;
  readonly affectedGoals: readonly string[];
  readonly affectedProjects: readonly string[];
  readonly affectedTasks: readonly string[];
  readonly timeImpact: string;
  readonly capacityImpact: string;
  readonly riskImpact: string;
  readonly summary: string;
  readonly evidence: readonly AdaptationEvidence[];
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

export interface AdaptationConstraint {
  readonly id: string;
  readonly kind: 'capacity' | 'dependency' | 'deadline' | 'data' | 'conflict';
  readonly label: string;
  readonly detail: string;
  readonly blocking: boolean;
}

export interface AdaptationAlternative {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly tradeoffs: readonly string[];
  readonly expectedEffect: string;
  readonly effortMinutes: number | null;
  readonly risk: AdaptationSeverity;
  readonly confidence: AdaptationConfidence;
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

export interface AdaptationSimulation {
  readonly id: string;
  readonly alternativeId: string;
  readonly label: string;
  readonly baseline: string;
  readonly projected: string;
  readonly delta: string;
  readonly assumptions: readonly string[];
  readonly limitations: readonly string[];
  readonly confidence: AdaptationConfidence;
  readonly algorithmVersion: string;
}

export interface AdaptationProposal {
  readonly id: string;
  readonly status: AdaptationProposalStatus;
  readonly kind: string;
  readonly title: string;
  readonly summary: string;
  readonly reason: string;
  readonly recommendedAction: string;
  readonly severity: AdaptationSeverity;
  readonly confidence: AdaptationConfidence;
  readonly confidenceScore: number;
  readonly period: DatePeriod;
  readonly deviationIds: readonly string[];
  readonly impactIds: readonly string[];
  readonly constraints: readonly AdaptationConstraint[];
  readonly alternatives: readonly AdaptationAlternative[];
  readonly simulations: readonly AdaptationSimulation[];
  readonly evidence: readonly AdaptationEvidence[];
  readonly sources: readonly string[];
  readonly limitations: readonly string[];
  readonly cannotConclude: readonly string[];
  readonly algorithmVersion: string;
}

export interface AdaptationDecisionRecord {
  readonly proposalId: string;
  readonly action: AdaptationDecisionAction;
  readonly note: string | null;
  readonly decidedAt: string;
  readonly actor: string;
  readonly version: number;
}

export interface AdaptationOutcomeComparison {
  readonly proposalId: string;
  readonly decisionAction: AdaptationDecisionAction;
  readonly decidedAt: string;
  readonly baselinePeriod: DatePeriod;
  readonly followUpPeriod: DatePeriod;
  readonly observedChange: string;
  readonly status: 'improved' | 'unchanged' | 'worsened' | 'insufficient_data';
  readonly evidence: readonly AdaptationEvidence[];
  readonly limitations: readonly string[];
  readonly algorithmVersion: string;
}

export interface AdaptationInput {
  readonly today: string;
  readonly comparison: DecisionComparisonMode;
  readonly explicitPeriod?: DecisionDatePeriod;
  readonly periods: PerformancePeriods;
  readonly alerts: readonly DecisionAlert[];
  readonly recommendations: readonly DecisionRecommendation[];
  readonly nextAction: DecisionNextAction | null;
  readonly review: DecisionReview | null;
  readonly sufficiency: Readonly<Record<string, DecisionSufficiency>>;
  readonly comparisons: readonly {
    readonly metric: string;
    readonly current: number | null;
    readonly previous: number | null;
    readonly delta: number | null;
    readonly changePercent: number | null;
    readonly status: 'ok' | 'insufficient_data';
    readonly coverage: number | null;
    readonly limitations: readonly string[];
  }[];
  readonly facts: {
    readonly goalsActive: number;
    readonly goalsCompleted: number;
    readonly projectsActive: number;
    readonly tasksOpen: number;
    readonly tasksOverdue: number;
    readonly tasksBlocked: number;
    readonly tasksCompleted: number;
    readonly capacityWeeklyMinutes: number | null;
    readonly activeCycleId: string | null;
    readonly activeCycleName: string | null;
  };
}

function assertDate(value: string, field: string): void {
  if (!isLocalDate(value)) throw validationError(`${field} inválida.`);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000));
}

function confidenceFromScore(score: number): AdaptationConfidence {
  if (score >= 0.75) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

function severityRank(severity: AdaptationSeverity): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'risk':
      return 3;
    case 'attention':
      return 2;
    default:
      return 1;
  }
}

function maxSeverity(values: readonly AdaptationSeverity[]): AdaptationSeverity {
  let current: AdaptationSeverity = 'info';
  for (const value of values) if (severityRank(value) > severityRank(current)) current = value;
  return current;
}

function evidence(
  source: string,
  label: string,
  value: string,
  period: DatePeriod,
  method: string,
  limitations: readonly string[] = [],
): AdaptationEvidence {
  return { source, label, value, period, method, limitations: [...limitations] };
}

function deviationId(kind: string, area: string, period: DatePeriod): string {
  return stableHash(
    `${ADAPTATION_ALGORITHMS.deviation}|${kind}|${area}|${period.from}|${period.to}`,
  );
}

function proposalId(kinds: readonly string[], period: DatePeriod): string {
  return stableHash(
    `${ADAPTATION_ALGORITHMS.proposal}|${[...kinds].sort().join(',')}|${period.from}|${period.to}`,
  );
}

/** Detecta desvios observáveis. Sem dado suficiente, não cria desvio afirmativo. */
export function detectAdaptationDeviations(input: AdaptationInput): AdaptationDeviation[] {
  assertDate(input.today, 'today');
  const period = input.periods.current;
  const deviations: AdaptationDeviation[] = [];
  const seen = new Set<string>();

  const push = (d: AdaptationDeviation) => {
    if (seen.has(d.id)) return;
    seen.add(d.id);
    deviations.push(d);
  };

  for (const alert of input.alerts) {
    if (alert.state === 'dismissed') continue;
    const id = deviationId(alert.type, alert.area, period);
    const score = clampScore(alert.explanation.confidence);
    push({
      id,
      kind: alert.type,
      severity: alert.severity,
      area: alert.area,
      title: alert.title,
      summary: alert.reason,
      observed: alert.evidence.map((e) => `${e.label}: ${e.value}`).join('; ') || alert.reason,
      expected:
        'Comportamento alinhado ao objetivo/capacidade planejada, sem sinal de alerta ativo.',
      gap: alert.reason,
      confidence: confidenceFromScore(score),
      confidenceScore: score,
      period,
      evidence: [
        evidence(
          alert.sources.join(',') || 'decision.alerts',
          alert.title,
          alert.reason,
          period,
          `Regra de alerta ${alert.ruleVersion}; evidência derivada de sinais existentes.`,
          alert.explanation.limitations,
        ),
      ],
      sources: [...alert.sources],
      limitations: [
        ...alert.explanation.limitations,
        ...alert.explanation.missing.map((m) => `Ausência: ${m}`),
      ],
      algorithmVersion: ADAPTATION_ALGORITHMS.deviation,
    });
  }

  for (const comparison of input.comparisons) {
    if (comparison.status !== 'ok') continue;
    if (
      comparison.changePercent === null ||
      comparison.current === null ||
      comparison.previous === null
    )
      continue;
    const pct = comparison.changePercent;
    const worsening = pct <= -15;
    const improving = pct >= 15;
    if (!worsening && !improving) continue;
    const kind = worsening ? 'metric_decline' : 'metric_improvement';
    const id = deviationId(`${kind}:${comparison.metric}`, 'performance', period);
    const score = clampScore(comparison.coverage ?? 0.5);
    const severity: AdaptationSeverity = worsening ? (pct <= -30 ? 'risk' : 'attention') : 'info';
    push({
      id,
      kind,
      severity,
      area: 'performance',
      title: worsening
        ? `Queda observada em ${comparison.metric}`
        : `Melhora observada em ${comparison.metric}`,
      summary: `${comparison.metric}: ${comparison.previous} → ${comparison.current} (${pct.toFixed(1)}%).`,
      observed: `Atual ${comparison.current}, anterior ${comparison.previous}, variação ${pct.toFixed(1)}%.`,
      expected: 'Variação dentro de faixa estável ou explicada pelo planejamento.',
      gap: worsening
        ? 'Queda relevante no período comparado.'
        : 'Melhora relevante no período comparado.',
      confidence: confidenceFromScore(score),
      confidenceScore: score,
      period,
      evidence: [
        evidence(
          'decision.comparisons',
          comparison.metric,
          `${comparison.current} vs ${comparison.previous}`,
          period,
          'Comparação de períodos equivalentes reutilizando comparePeriodMetric.',
          comparison.limitations,
        ),
      ],
      sources: ['decision.comparisons'],
      limitations: [...comparison.limitations],
      algorithmVersion: ADAPTATION_ALGORITHMS.deviation,
    });
  }

  const overdue = input.facts.tasksOverdue;
  const blocked = input.facts.tasksBlocked;
  if (overdue > 0 || blocked > 0) {
    const id = deviationId('execution_pressure', 'execution', period);
    const severity: AdaptationSeverity = overdue >= 5 || blocked >= 5 ? 'risk' : 'attention';
    const score = clampScore(0.6 + Math.min(0.3, (overdue + blocked) / 20));
    push({
      id,
      kind: 'execution_pressure',
      severity,
      area: 'execution',
      title: 'Pressão de execução observada',
      summary: `${overdue} tarefa(s) atrasada(s), ${blocked} bloqueada(s).`,
      observed: `Atrasadas: ${overdue}; bloqueadas: ${blocked}; abertas: ${input.facts.tasksOpen}.`,
      expected: 'Backlog executável com bloqueios e atrasos controlados.',
      gap: 'Há sinais de atrito na execução.',
      confidence: confidenceFromScore(score),
      confidenceScore: score,
      period,
      evidence: [
        evidence(
          'execution.facts',
          'Atraso/bloqueio',
          `${overdue} atrasadas, ${blocked} bloqueadas`,
          period,
          'Contagem determinística de tarefas abertas, atrasadas e bloqueadas.',
        ),
      ],
      sources: ['tasks', 'execution'],
      limitations: [
        'Contagens não indicam causa raiz; ausência de registro não é ausência de trabalho.',
      ],
      algorithmVersion: ADAPTATION_ALGORITHMS.deviation,
    });
  }

  const cap = input.facts.capacityWeeklyMinutes;
  if (cap !== null && cap >= 0) {
    const open = input.facts.tasksOpen;
    const pressure = open > 0 && cap < 120 && open >= 10;
    if (pressure) {
      const id = deviationId('capacity_mismatch', 'planning', period);
      push({
        id,
        kind: 'capacity_mismatch',
        severity: 'attention',
        area: 'planning',
        title: 'Possível desalinhamento de capacidade',
        summary: `Capacidade semanal declarada ${cap} min com ${open} tarefas abertas.`,
        observed: `${cap} min/semana declarados; ${open} tarefas abertas.`,
        expected: 'Capacidade declarada compatível com carga ativa.',
        gap: 'Carga aberta pode exceder a capacidade declarada.',
        confidence: 'low',
        confidenceScore: 0.45,
        period,
        evidence: [
          evidence(
            'capacity_profiles',
            'Capacidade declarada',
            `${cap} min/semana`,
            period,
            'Comparação heurística simples entre capacidade declarada e volume aberto.',
            ['Estimativa, não medição de tempo real; tarefas podem ter esforço variado.'],
          ),
        ],
        sources: ['capacity_profiles', 'tasks'],
        limitations: [
          'Não há medição de tempo real por tarefa; comparação é heurística.',
          'Capacidade declarada pode não refletir semana atual.',
        ],
        algorithmVersion: ADAPTATION_ALGORITHMS.deviation,
      });
    }
  }

  return deviations.sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity) || a.id.localeCompare(b.id),
  );
}

export function assessAdaptationImpacts(
  input: AdaptationInput,
  deviations: readonly AdaptationDeviation[],
): AdaptationImpact[] {
  return deviations.map((deviation) => {
    const affectedGoals =
      deviation.area === 'goals' || deviation.kind.includes('goal') ? ['metas-ativas'] : [];
    const affectedProjects = deviation.area === 'execution' ? ['projetos-ativos'] : [];
    const affectedTasks = deviation.area === 'execution' ? ['tarefas-abertas'] : [];
    const timeImpact =
      deviation.kind === 'execution_pressure'
        ? 'Atrasos e bloqueios podem consumir capacidade e adiar entregas.'
        : deviation.kind === 'capacity_mismatch'
          ? 'Carga aberta pode exceder a capacidade declarada.'
          : 'Impacto em tempo depende de evidência adicional.';
    const capacityImpact =
      input.facts.capacityWeeklyMinutes === null
        ? 'Capacidade não declarada; impacto não mensurável.'
        : deviation.kind === 'capacity_mismatch' || deviation.kind === 'execution_pressure'
          ? 'Risco de sobrecarga na capacidade declarada.'
          : 'Sem sinal direto de sobrecarga de capacidade.';
    const riskImpact =
      severityRank(deviation.severity) >= severityRank('risk')
        ? 'Risco elevado de desvio persistente se nenhuma ação for tomada.'
        : severityRank(deviation.severity) >= severityRank('attention')
          ? 'Risco moderado; monitorar e ajustar.'
          : 'Risco baixo ou informativo.';
    return {
      id: stableHash(`${ADAPTATION_ALGORITHMS.impact}|${deviation.id}`),
      deviationId: deviation.id,
      severity: deviation.severity,
      affectedGoals,
      affectedProjects,
      affectedTasks,
      timeImpact,
      capacityImpact,
      riskImpact,
      summary: `${deviation.title}: ${riskImpact}`,
      evidence: deviation.evidence,
      limitations: [
        ...deviation.limitations,
        'Impactos são estimativas explicáveis baseadas em sinais disponíveis, não previsões garantidas.',
      ],
      algorithmVersion: ADAPTATION_ALGORITHMS.impact,
    };
  });
}

export function buildAdaptationConstraints(input: AdaptationInput): AdaptationConstraint[] {
  const constraints: AdaptationConstraint[] = [];
  if (input.facts.capacityWeeklyMinutes === null) {
    constraints.push({
      id: stableHash(`${ADAPTATION_ALGORITHMS.proposal}|constraint|capacity-missing`),
      kind: 'data',
      label: 'Capacidade não declarada',
      detail: 'Sem capacidade semanal declarada, simulações de carga são limitadas.',
      blocking: false,
    });
  } else if (input.facts.capacityWeeklyMinutes < 60) {
    constraints.push({
      id: stableHash(`${ADAPTATION_ALGORITHMS.proposal}|constraint|capacity-low`),
      kind: 'capacity',
      label: 'Capacidade declarada baixa',
      detail: `Capacidade semanal declarada: ${input.facts.capacityWeeklyMinutes} min.`,
      blocking: false,
    });
  }
  if (input.facts.tasksBlocked > 0) {
    constraints.push({
      id: stableHash(`${ADAPTATION_ALGORITHMS.proposal}|constraint|blocked`),
      kind: 'dependency',
      label: 'Tarefas bloqueadas',
      detail: `${input.facts.tasksBlocked} tarefa(s) bloqueada(s) exigem desbloqueio antes de replanejar execução.`,
      blocking: true,
    });
  }
  if (input.facts.tasksOverdue > 0) {
    constraints.push({
      id: stableHash(`${ADAPTATION_ALGORITHMS.proposal}|constraint|overdue`),
      kind: 'deadline',
      label: 'Atrasos ativos',
      detail: `${input.facts.tasksOverdue} tarefa(s) atrasada(s) afetam prioridades.`,
      blocking: false,
    });
  }
  const insufficient = Object.values(input.sufficiency).filter(
    (s) => s.status === 'insufficient',
  ).length;
  if (insufficient > 0) {
    constraints.push({
      id: stableHash(`${ADAPTATION_ALGORITHMS.proposal}|constraint|data`),
      kind: 'data',
      label: 'Dados insuficientes em áreas',
      detail: `${insufficient} área(s) com suficiência insuficiente; recomendações devem ser cautelosas.`,
      blocking: false,
    });
  }
  return constraints;
}

function makeAlternative(
  idKey: string,
  label: string,
  description: string,
  tradeoffs: readonly string[],
  expectedEffect: string,
  effortMinutes: number | null,
  risk: AdaptationSeverity,
  confidence: AdaptationConfidence,
  limitations: readonly string[] = [],
): AdaptationAlternative {
  return {
    id: stableHash(`${ADAPTATION_ALGORITHMS.alternative}|${idKey}`),
    label,
    description,
    tradeoffs: [...tradeoffs],
    expectedEffect,
    effortMinutes,
    risk,
    confidence,
    limitations: [...limitations],
    algorithmVersion: ADAPTATION_ALGORITHMS.alternative,
  };
}

export function buildAdaptationAlternatives(
  input: AdaptationInput,
  deviations: readonly AdaptationDeviation[],
): AdaptationAlternative[] {
  const alts: AdaptationAlternative[] = [];
  const hasExec = deviations.some((d) => d.area === 'execution' || d.kind === 'execution_pressure');
  const hasCapacity = deviations.some((d) => d.kind === 'capacity_mismatch');
  const hasDecline = deviations.some((d) => d.kind === 'metric_decline');
  const hasData = Object.values(input.sufficiency).some((s) => s.status !== 'sufficient');

  if (hasExec) {
    alts.push(
      makeAlternative(
        'focus-critical',
        'Focar no crítico',
        'Reduzir trabalho em paralelo e priorizar tarefas atrasadas/bloqueadoras com maior impacto.',
        ['Menor avanço em itens não críticos.', 'Pode exigir renegociar prazos.'],
        'Redução de atrasos e bloqueios no curto prazo.',
        30,
        'attention',
        'medium',
        ['Depende de atualização real do status das tarefas.'],
      ),
      makeAlternative(
        'reduce-scope',
        'Reduzir escopo ativo',
        'Pausar ou adiar tarefas de menor prioridade para recuperar capacidade.',
        ['Entrega menor no período.', 'Necessita decisão explícita do usuário.'],
        'Alívio de carga e maior previsibilidade.',
        20,
        'attention',
        'medium',
        ['Não remove obrigações externas; apenas reorganiza o plano.'],
      ),
    );
  }
  if (hasCapacity) {
    alts.push(
      makeAlternative(
        'recalibrate-capacity',
        'Recalibrar capacidade',
        'Atualizar capacidade declarada e redistribuir carga conforme disponibilidade real.',
        ['Pode expor que metas são ambiciosas demais.', 'Requer revisão honesta da agenda.'],
        'Planejamento mais realista e menos sobrecarga.',
        15,
        'info',
        'low',
        ['Capacidade declarada é auto-reportada.'],
      ),
    );
  }
  if (hasDecline) {
    alts.push(
      makeAlternative(
        'investigate-decline',
        'Investigar queda com dados',
        'Coletar evidências por 7 dias antes de mudar estratégia, mantendo monitoramento.',
        ['Atrasa intervenção.', 'Pode perder janela de correção.'],
        'Maior confiança antes de uma mudança estrutural.',
        10,
        'info',
        'medium',
        ['Não conclui causa; apenas aumenta evidência.'],
      ),
    );
  }
  if (hasData) {
    alts.push(
      makeAlternative(
        'collect-data',
        'Coletar dados mínimos',
        'Registrar fatos faltantes nas áreas com suficiência insuficiente antes de decidir.',
        ['Exige disciplina de registro.', 'Não resolve desvios já confirmados.'],
        'Melhora confiança das próximas recomendações.',
        10,
        'info',
        'high',
        ['Recomendação de coleta, não ação automática.'],
      ),
    );
  }
  if (alts.length === 0) {
    alts.push(
      makeAlternative(
        'maintain',
        'Manter curso e monitorar',
        'Nenhum desvio crítico detectado; manter estratégia atual e monitorar sinais.',
        ['Pode perder sinais fracos.', 'Exige revisões periódicas.'],
        'Estabilidade com monitoramento.',
        0,
        'info',
        'medium',
        ['Baseado apenas nos sinais disponíveis no período.'],
      ),
    );
  }
  return alts;
}

export function simulateAdaptationAlternatives(
  input: AdaptationInput,
  alternatives: readonly AdaptationAlternative[],
): AdaptationSimulation[] {
  const period = input.periods.current;
  return alternatives.map((alt) => {
    let baseline = 'Curso atual mantido.';
    let projected = 'Sem mudança deliberada; monitoramento contínuo.';
    let delta = 'Delta neutro esperado.';
    const assumptions: string[] = [
      'Simulação determinística baseada em regras simples; não é previsão.',
      'Nenhuma ação é executada automaticamente.',
    ];
    if (alt.label === 'Focar no crítico') {
      baseline = `${input.facts.tasksOverdue} atrasadas, ${input.facts.tasksBlocked} bloqueadas.`;
      const projectedOverdue = Math.max(
        0,
        input.facts.tasksOverdue - Math.ceil(input.facts.tasksOverdue * 0.3),
      );
      projected = `Estimativa heurística: ~${projectedOverdue} atrasadas se foco for aplicado.`;
      delta = `Possível redução de ${input.facts.tasksOverdue - projectedOverdue} atraso(s).`;
      assumptions.push('Assume 30% de redução heurística em atrasos com foco dedicado.');
    } else if (alt.label === 'Reduzir escopo ativo') {
      baseline = `${input.facts.tasksOpen} tarefas abertas.`;
      const reduced = Math.max(0, Math.ceil(input.facts.tasksOpen * 0.8));
      projected = `Estimativa heurística: ~${reduced} tarefas ativas após redução de 20%.`;
      delta = `Redução estimada de ${input.facts.tasksOpen - reduced} tarefa(s) ativas.`;
      assumptions.push('Assume redução de 20% no escopo ativo por decisão do usuário.');
    } else if (alt.label === 'Recalibrar capacidade') {
      const cap = input.facts.capacityWeeklyMinutes;
      baseline = cap === null ? 'Capacidade não declarada.' : `${cap} min/semana declarados.`;
      projected = 'Capacidade declarada atualizada para refletir disponibilidade real.';
      delta = 'Melhora a qualidade do planejamento; sem delta numérico confiável.';
      assumptions.push('Requer entrada explícita do usuário.');
    } else if (alt.label === 'Investigar queda com dados') {
      baseline = 'Evidência atual insuficiente para mudança estrutural.';
      projected = 'Após 7 dias, decisão com mais confiança ou confirmação de ruído.';
      delta = 'Confiança pode aumentar; impacto operacional imediato neutro.';
      assumptions.push('Janela de observação fixa de 7 dias.');
    } else if (alt.label === 'Coletar dados mínimos') {
      const missing = Object.values(input.sufficiency).filter(
        (s) => s.status !== 'sufficient',
      ).length;
      baseline = `${missing} área(s) com suficiência parcial/insuficiente.`;
      projected = 'Maior cobertura de dados para análises futuras.';
      delta = 'Melhora de suficiência; sem garantia de mudança de resultado.';
      assumptions.push('Usuário registra dados de forma consistente.');
    }
    return {
      id: stableHash(`${ADAPTATION_ALGORITHMS.simulation}|${alt.id}|${period.from}|${period.to}`),
      alternativeId: alt.id,
      label: `Simulação: ${alt.label}`,
      baseline,
      projected,
      delta,
      assumptions,
      limitations: [
        ...alt.limitations,
        'Resultado simulado não é compromisso nem previsão garantida.',
      ],
      confidence: alt.confidence,
      algorithmVersion: ADAPTATION_ALGORITHMS.simulation,
    };
  });
}

export function buildAdaptationProposals(input: AdaptationInput): AdaptationProposal[] {
  const deviations = detectAdaptationDeviations(input);
  const impacts = assessAdaptationImpacts(input, deviations);
  const constraints = buildAdaptationConstraints(input);
  const alternatives = buildAdaptationAlternatives(input, deviations);
  const simulations = simulateAdaptationAlternatives(input, alternatives);
  const period = input.periods.current;
  const cannotConclude: string[] = [];
  if (deviations.length === 0) {
    cannotConclude.push('Nenhum desvio relevante detectado com os sinais disponíveis.');
  }
  if (input.facts.capacityWeeklyMinutes === null) {
    cannotConclude.push(
      'Sem capacidade declarada, não é possível quantificar sobrecarga com precisão.',
    );
  }
  if (Object.values(input.sufficiency).every((s) => s.status === 'insufficient')) {
    cannotConclude.push('Suficiência insuficiente em todas as áreas; propostas são cautelosas.');
  }

  const groups = new Map<string, AdaptationDeviation[]>();
  for (const d of deviations) {
    const key =
      d.area === 'execution' || d.kind === 'execution_pressure'
        ? 'execution'
        : d.kind === 'metric_decline' || d.kind === 'metric_improvement'
          ? 'performance'
          : d.area;
    const list = groups.get(key) ?? [];
    list.push(d);
    groups.set(key, list);
  }

  const proposals: AdaptationProposal[] = [];
  for (const [group, groupDeviations] of groups) {
    const groupImpacts = impacts.filter((i) => groupDeviations.some((d) => d.id === i.deviationId));
    const severity = maxSeverity(groupDeviations.map((d) => d.severity));
    const confidenceScore = clampScore(
      groupDeviations.reduce((acc, d) => acc + d.confidenceScore, 0) / groupDeviations.length,
    );
    const relevantAlts = alternatives.filter((a) => {
      if (group === 'execution')
        return ['Focar no crítico', 'Reduzir escopo ativo'].includes(a.label);
      if (group === 'performance')
        return ['Investigar queda com dados', 'Coletar dados mínimos'].includes(a.label);
      if (group === 'planning')
        return ['Recalibrar capacidade', 'Reduzir escopo ativo'].includes(a.label);
      return a.label === 'Coletar dados mínimos';
    });
    const finalAlts = relevantAlts.length > 0 ? relevantAlts : alternatives.slice(0, 2);
    const finalSims = simulations.filter((s) => finalAlts.some((a) => a.id === s.alternativeId));
    const kinds = groupDeviations.map((d) => d.kind);
    const id = proposalId(kinds, period);
    const title =
      group === 'execution'
        ? 'Adaptar execução para reduzir atrito'
        : group === 'performance'
          ? 'Adaptar estratégia diante de variação de desempenho'
          : group === 'planning'
            ? 'Recalibrar planejamento e capacidade'
            : 'Revisar estratégia com evidência disponível';
    const recommendedAction = finalAlts[0]?.label ?? 'Revisar manualmente';
    proposals.push({
      id,
      status: 'open',
      kind: group,
      title,
      summary: groupDeviations.map((d) => d.summary).join(' '),
      reason: groupDeviations.map((d) => d.gap).join(' '),
      recommendedAction,
      severity,
      confidence: confidenceFromScore(confidenceScore),
      confidenceScore,
      period,
      deviationIds: groupDeviations.map((d) => d.id),
      impactIds: groupImpacts.map((i) => i.id),
      constraints: constraints.filter((c) =>
        group === 'execution' ? true : c.kind !== 'dependency' || c.blocking,
      ),
      alternatives: finalAlts,
      simulations: finalSims,
      evidence: groupDeviations.flatMap((d) => d.evidence),
      sources: [...new Set(groupDeviations.flatMap((d) => d.sources))],
      limitations: [...new Set(groupDeviations.flatMap((d) => d.limitations))],
      cannotConclude: [...cannotConclude],
      algorithmVersion: ADAPTATION_ALGORITHMS.proposal,
    });
  }

  if (proposals.length === 0) {
    const id = proposalId(['stable'], period);
    proposals.push({
      id,
      status: 'open',
      kind: 'monitoring',
      title: 'Manter monitoramento estratégico',
      summary: 'Nenhum desvio crítico detectado no período analisado.',
      reason: 'Os sinais disponíveis não indicam necessidade de adaptação imediata.',
      recommendedAction: 'Manter curso e monitorar',
      severity: 'info',
      confidence: 'medium',
      confidenceScore: 0.6,
      period,
      deviationIds: [],
      impactIds: [],
      constraints,
      alternatives: alternatives.filter(
        (a) => a.label === 'Manter curso e monitorar' || a.label === 'Coletar dados mínimos',
      ),
      simulations: simulations.filter((s) =>
        alternatives.some(
          (a) =>
            a.id === s.alternativeId &&
            (a.label === 'Manter curso e monitorar' || a.label === 'Coletar dados mínimos'),
        ),
      ),
      evidence: [],
      sources: ['decision', 'performance'],
      limitations: ['Conclusão limitada aos sinais observados no período.'],
      cannotConclude,
      algorithmVersion: ADAPTATION_ALGORITHMS.proposal,
    });
  }

  return proposals.sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity) || a.id.localeCompare(b.id),
  );
}

export interface AdaptationOutcomeInput {
  readonly proposalId: string;
  readonly decisionAction: AdaptationDecisionAction;
  readonly decidedAt: string;
  readonly baselinePeriod: DatePeriod;
  readonly followUpPeriod: DatePeriod;
  readonly baselineMetric: number | null;
  readonly followUpMetric: number | null;
  readonly metricLabel: string;
  readonly source: string;
  readonly higherIsBetter: boolean;
}

export function compareAdaptationOutcome(
  input: AdaptationOutcomeInput,
): AdaptationOutcomeComparison {
  assertDate(input.baselinePeriod.from, 'baseline.from');
  assertDate(input.baselinePeriod.to, 'baseline.to');
  assertDate(input.followUpPeriod.from, 'followUp.from');
  assertDate(input.followUpPeriod.to, 'followUp.to');
  const limitations: string[] = [
    'Comparação observacional; não prova causalidade entre decisão e resultado.',
    'Outros fatores podem ter influenciado o período de acompanhamento.',
  ];
  if (input.baselineMetric === null || input.followUpMetric === null) {
    return {
      proposalId: input.proposalId,
      decisionAction: input.decisionAction,
      decidedAt: input.decidedAt,
      baselinePeriod: input.baselinePeriod,
      followUpPeriod: input.followUpPeriod,
      observedChange: `${input.metricLabel}: dados insuficientes para comparar.`,
      status: 'insufficient_data',
      evidence: [
        evidence(
          input.source,
          input.metricLabel,
          'valor ausente',
          input.followUpPeriod,
          'Comparação antes/depois com métrica agregada do período.',
          limitations,
        ),
      ],
      limitations,
      algorithmVersion: ADAPTATION_ALGORITHMS.outcome,
    };
  }
  const delta = input.followUpMetric - input.baselineMetric;
  const improved = input.higherIsBetter ? delta > 0 : delta < 0;
  const worsened = input.higherIsBetter ? delta < 0 : delta > 0;
  const status = improved ? 'improved' : worsened ? 'worsened' : 'unchanged';
  const direction = delta > 0 ? 'aumentou' : delta < 0 ? 'diminuiu' : 'permaneceu igual';
  return {
    proposalId: input.proposalId,
    decisionAction: input.decisionAction,
    decidedAt: input.decidedAt,
    baselinePeriod: input.baselinePeriod,
    followUpPeriod: input.followUpPeriod,
    observedChange: `${input.metricLabel} ${direction}: ${input.baselineMetric} → ${input.followUpMetric} (delta ${delta}).`,
    status,
    evidence: [
      evidence(
        input.source,
        input.metricLabel,
        `${input.baselineMetric} → ${input.followUpMetric}`,
        input.followUpPeriod,
        'Comparação determinística antes/depois; sem inferência causal.',
        limitations,
      ),
    ],
    limitations,
    algorithmVersion: ADAPTATION_ALGORITHMS.outcome,
  };
}

export interface AdaptationDashboard {
  readonly today: string;
  readonly periods: PerformancePeriods;
  readonly deviations: readonly AdaptationDeviation[];
  readonly impacts: readonly AdaptationImpact[];
  readonly constraints: readonly AdaptationConstraint[];
  readonly proposals: readonly AdaptationProposal[];
  readonly algorithms: Readonly<Record<string, string>>;
  readonly limitations: readonly string[];
}

export function buildAdaptationDashboard(input: AdaptationInput): AdaptationDashboard {
  const deviations = detectAdaptationDeviations(input);
  const impacts = assessAdaptationImpacts(input, deviations);
  const constraints = buildAdaptationConstraints(input);
  const proposals = buildAdaptationProposals(input);
  const limitations = [
    ...new Set([
      ...input.periods.limitations,
      ...deviations.flatMap((d) => d.limitations),
      'Adaptações são recomendações; nenhuma ação é executada automaticamente.',
      'Nenhuma ação é executada automaticamente.',
      'Ausência de registro não é tratada como zero.',
    ]),
  ].slice(0, 24);
  return {
    today: input.today,
    periods: input.periods,
    deviations,
    impacts,
    constraints,
    proposals,
    algorithms: { ...ADAPTATION_ALGORITHMS },
    limitations,
  };
}
