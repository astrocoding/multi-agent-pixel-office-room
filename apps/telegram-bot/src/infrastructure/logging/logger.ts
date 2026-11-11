export interface LogContext {
  requestId?: string;
  updateId?: number;
  command?: string;
  actorId?: string;
  taskId?: string;
  correlationId?: string;
  durationMs?: number;
  errorCode?: string;
  [key: string]: unknown;
}

export class Logger {
  public static info(message: string, context?: LogContext): void {
    const payload = context ? ` ${JSON.stringify(context)}` : '';
    console.log(`[INFO] ${new Date().toISOString()} - ${message}${payload}`);
  }

  public static warn(message: string, context?: LogContext): void {
    const payload = context ? ` ${JSON.stringify(context)}` : '';
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}${payload}`);
  }

  public static error(message: string, error?: unknown, context?: LogContext): void {
    const errMsg = error instanceof Error ? error.message : String(error || '');
    const stack = error instanceof Error ? `\n${error.stack}` : '';
    const payload = context ? ` ${JSON.stringify(context)}` : '';
    console.error(`[ERROR] ${new Date().toISOString()} - ${message} | ${errMsg}${payload}${stack}`);
  }

  public static debug(message: string, context?: LogContext): void {
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG === 'true') {
      const payload = context ? ` ${JSON.stringify(context)}` : '';
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}${payload}`);
    }
  }
}

