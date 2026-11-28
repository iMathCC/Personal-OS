import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { lifeApi } from '@/lib/api';
import {
  LifeRecordPanel,
  Limitations,
  Metric,
  PageHeader,
  PeriodControls,
  SummaryView,
  type ColumnDef,
  type FieldDef,
} from './shared';
import { formatCents, formatRatio, useDefaultPeriod, useLifeResource } from './shared-helpers';

const accountFields: readonly FieldDef[] = [
  { key: 'name', label: 'Nome da conta', required: true, placeholder: 'Conta corrente principal' },
  {
    key: 'type',
    label: 'Tipo',
    type: 'select',
    options: [
      { value: 'checking', label: 'Corrente' },
      { value: 'savings', label: 'Poupança' },
      { value: 'cash', label: 'Dinheiro' },
      { value: 'investment', label: 'Investimento' },
    ],
  },
  { key: 'currency', label: 'Moeda', placeholder: 'BRL' },
  { key: 'initialBalanceCents', label: 'Saldo inicial (centavos)', type: 'number' },
  { key: 'includeInPatrimony', label: 'Incluir no patrimônio', type: 'boolean' },
  {
    key: 'externalId',
    label: 'ID externo',
    nullable: true,
    help: 'Opcional; usado na deduplicação.',
  },
];

const categoryFields: readonly FieldDef[] = [
  { key: 'name', label: 'Nome da categoria', required: true },
  {
    key: 'kind',
    label: 'Tipo',
    type: 'select',
    required: true,
    options: [
      { value: 'expense', label: 'Despesa' },
      { value: 'income', label: 'Receita' },
    ],
  },
  { key: 'externalId', label: 'ID externo', nullable: true },
];

const transactionFields: readonly FieldDef[] = [
  {
    key: 'accountId',
    label: 'ID da conta',
    required: true,
    help: 'Copie o ID da conta na lista abaixo.',
  },
  { key: 'date', label: 'Data', type: 'date', required: true },
  {
    key: 'kind',
    label: 'Tipo',
    type: 'select',
    required: true,
    options: [
      { value: 'expense', label: 'Despesa' },
      { value: 'income', label: 'Receita' },
      { value: 'transfer', label: 'Transferência' },
    ],
  },
  { key: 'amountCents', label: 'Valor (centavos)', type: 'number', required: true },
  { key: 'categoryId', label: 'ID da categoria', nullable: true },
  { key: 'currency', label: 'Moeda', placeholder: 'BRL' },
  { key: 'description', label: 'Descrição', required: true },
  { key: 'notes', label: 'Observações', type: 'textarea', nullable: true },
  { key: 'transferPairId', label: 'ID da transferência pareada', nullable: true },
  { key: 'externalId', label: 'ID externo', nullable: true },
];

const balanceFields: readonly FieldDef[] = [
  {
    key: 'kind',
    label: 'Tipo',
    type: 'select',
    required: true,
    options: [
      { value: 'asset', label: 'Ativo' },
      { value: 'debt', label: 'Dívida' },
    ],
  },
  { key: 'name', label: 'Nome do componente', required: true },
  { key: 'amountCents', label: 'Valor (centavos)', type: 'number', required: true },
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'accountId', label: 'ID da conta', nullable: true },
  { key: 'currency', label: 'Moeda', placeholder: 'BRL' },
  { key: 'externalId', label: 'ID externo', nullable: true },
];

const commonColumns: readonly ColumnDef[] = [
  { key: 'id', label: 'ID', format: (value) => String(value).slice(0, 8) },
];

export function FinancePage() {
  const [period, setPeriod] = useDefaultPeriod();
  const [tab, setTab] = useState<
    'summary' | 'accounts' | 'categories' | 'transactions' | 'balance'
  >('summary');
  const summary = useLifeResource(
    (signal) => lifeApi.financeSummary(period, signal),
    [period.from, period.to],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Áreas da vida · finanças"
        title="Finanças observadas"
        description="Valores em centavos, proveniência explícita e transferências separadas de receitas e despesas. Nenhum acesso bancário é solicitado."
      />
      <PeriodControls period={period} onChange={setPeriod} />
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['summary', 'Resumo'],
            ['accounts', 'Contas'],
            ['categories', 'Categorias'],
            ['transactions', 'Transações'],
            ['balance', 'Patrimônio'],
          ] as const
        ).map(([key, label]) => (
          <Button
            key={key}
            type="button"
            variant={tab === key ? 'default' : 'outline'}
            onClick={() => setTab(key)}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === 'summary' && (
        <SummaryView state={summary}>
          {(data) => (
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Receitas" value={formatCents(data.incomeCents)} />
                <Metric label="Despesas" value={formatCents(data.expenseCents)} />
                <Metric
                  label="Resultado"
                  value={formatCents(data.netCents)}
                  hint={`${data.transfersExcluded} transferência(es) excluída(s)`}
                />
                <Metric
                  label="Patrimônio"
                  value={
                    data.patrimonyCents === null ? 'desconhecido' : formatCents(data.patrimonyCents)
                  }
                  hint={`Cobertura: ${formatRatio(data.coverage.coverageRatio)}`}
                />
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Algoritmo: {data.algorithmVersion} · {data.coverage.daysWithRecords} dia(s) com
                registro de {data.coverage.expectedDays} esperado(s).
              </p>
              <Limitations items={data.limitations} />
            </div>
          )}
        </SummaryView>
      )}

      {tab === 'accounts' && (
        <LifeRecordPanel
          domain="finance_accounts"
          title="Contas"
          description="Contas próprias usadas como origem das transações. Dados são informados manualmente."
          fields={accountFields}
          columns={[
            ...commonColumns,
            { key: 'name', label: 'Nome' },
            { key: 'type', label: 'Tipo' },
            { key: 'currency', label: 'Moeda' },
            {
              key: 'includeInPatrimony',
              label: 'Patrimônio',
              format: (value) => (value === true ? 'sim' : 'não'),
            },
          ]}
          period={period}
        />
      )}
      {tab === 'categories' && (
        <LifeRecordPanel
          domain="finance_categories"
          title="Categorias"
          description="Categorias editáveis de receita e despesa."
          fields={categoryFields}
          columns={[
            ...commonColumns,
            { key: 'name', label: 'Nome' },
            { key: 'kind', label: 'Tipo' },
          ]}
          period={period}
        />
      )}
      {tab === 'transactions' && (
        <LifeRecordPanel
          domain="finance_transactions"
          title="Transações"
          description="Receitas, despesas e transferências. Transferências não entram no fluxo de caixa."
          fields={transactionFields}
          columns={[
            ...commonColumns,
            { key: 'date', label: 'Data' },
            { key: 'kind', label: 'Tipo' },
            { key: 'description', label: 'Descrição' },
            { key: 'amountCents', label: 'Valor', format: (value) => formatCents(Number(value)) },
          ]}
          period={period}
        />
      )}
      {tab === 'balance' && (
        <LifeRecordPanel
          domain="finance_balance_items"
          title="Composição do patrimônio"
          description="Ativos e dívidas informados por data. Patrimônio é nulo quando não há composição informada."
          fields={balanceFields}
          columns={[
            ...commonColumns,
            { key: 'date', label: 'Data' },
            { key: 'kind', label: 'Tipo' },
            { key: 'name', label: 'Componente' },
            { key: 'amountCents', label: 'Valor', format: (value) => formatCents(Number(value)) },
          ]}
          period={period}
        />
      )}
    </div>
  );
}
