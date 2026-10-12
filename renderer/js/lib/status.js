// Etiquetas de estado compartidas entre pantallas (pagos, pedidos, vencimientos).
import { badge } from './ui.js';

const PAYMENT_STATUS = {
  approved: ['Aprobado', 'ok'],
  pending: ['Pendiente', 'warn'],
  in_process: ['En proceso', 'info'],
  rejected: ['Rechazado', 'danger'],
  cancelled: ['Cancelado', 'neutral'],
  expired: ['Vencido', 'neutral'],
  refunded: ['Reintegrado', 'neutral'],
};

export function paymentStatusInfo(status) {
  const key = String(status || '').toLowerCase();
  return PAYMENT_STATUS[key] || [status || '—', 'neutral'];
}

export function paymentStatusBadge(status) {
  const [label, variant] = paymentStatusInfo(status);
  return badge(label, variant, { dot: true });
}

export const orderStatusBadge = paymentStatusBadge;
