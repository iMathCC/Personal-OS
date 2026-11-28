import { STUDY_TOPIC_MAX_LENGTH } from '@personal-os/shared';

/** Limite do campo espelha o contrato: o evento `Estudo: ${topic}` cabe em 200 caracteres. */
export const topicMaxLength = STUDY_TOPIC_MAX_LENGTH;

/** Contagem restante exibida no formulário; usa a mesma unidade do `maxLength` HTML. */
export function topicRemaining(value: string): number {
  return Math.max(0, topicMaxLength - value.length);
}
