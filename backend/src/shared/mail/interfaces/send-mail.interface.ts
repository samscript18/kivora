export interface SendMail {
  to: string | string[];
  subject: string;
  text?: string;
  template: string;
  context: Record<string, unknown>;
}
