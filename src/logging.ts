export function log(level: 'info' | 'error' | 'warn', message: string, fields: Record<string, unknown> = {}): void {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...fields });
  if (level === 'error') console.error(entry);
  else console.log(entry);
}
