export interface SendMail {
  to: string | string[];
  subject: string;
  template: string;
  context: Record<string, unknown>;
  idempotencyKey?: string;
}
