// Shared interface + helpers for notification channel adapters.

export interface AlarmPayload {
  id: string;
  ruleName: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'firing' | 'resolved';
  value: number;
  threshold: number;
  firedAt: Date | string;
  resolvedAt?: Date | string;
  target: {
    nodeId?: string;
    containerId?: string;
    stackName?: string;
    uptimeCheckId?: string;
  };
}

export interface SnapshotPayload {
  topContainersCpu: Array<{ name: string; cpuPct: number; memUsedPct: number }>;
  topContainersMem: Array<{ name: string; cpuPct: number; memUsedPct: number }>;
  nodeState?: { cpuPct: number; memUsedPct: number; diskUsedPct: number };
}

export interface ChannelResult {
  success: boolean;
  error?: string;
  latencyMs: number;
}

export interface ChannelAdapter<Config = any> {
  readonly type: 'telegram' | 'slack' | 'email' | 'webhook';
  send(alarm: AlarmPayload, snapshot: SnapshotPayload, config: Config): Promise<ChannelResult>;
  test(config: Config): Promise<{ success: boolean; error?: string }>;
  mask(config: Config): Record<string, any>;
  /** Static schema for the frontend's dynamic form renderer. */
  schema(): ChannelFieldSchema[];
  validate(config: Config): string | null; // returns error message or null
}

export interface ChannelFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'password' | 'number' | 'textarea' | 'url' | 'select' | 'multi-text';
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  help?: string;
  secret?: boolean;
}

export function severityEmoji(sev: string): string {
  if (sev === 'critical') return '🚨';
  if (sev === 'warning') return '⚠️';
  return 'ℹ️';
}

export function fmtTs(d: Date | string): string {
  try { return new Date(d).toISOString(); } catch { return String(d); }
}

export function formatTargetLine(a: AlarmPayload): string {
  const t = a.target || {};
  const parts: string[] = [];
  if (t.nodeId) parts.push(`node=${t.nodeId}`);
  if (t.containerId) parts.push(`container=${t.containerId}`);
  if (t.stackName) parts.push(`stack=${t.stackName}`);
  if (t.uptimeCheckId) parts.push(`check=${t.uptimeCheckId}`);
  return parts.join(' ');
}

export function formatSnapshotText(s: SnapshotPayload): string {
  const parts: string[] = [];
  if (s.nodeState) {
    parts.push(`Node: CPU ${s.nodeState.cpuPct.toFixed(1)}% · RAM ${s.nodeState.memUsedPct.toFixed(1)}% · Disk ${s.nodeState.diskUsedPct.toFixed(1)}%`);
  }
  if (s.topContainersCpu?.length) {
    parts.push('Top CPU:');
    for (const c of s.topContainersCpu.slice(0, 5)) {
      parts.push(`  • ${c.name} — ${c.cpuPct.toFixed(1)}%`);
    }
  }
  if (s.topContainersMem?.length) {
    parts.push('Top Memory:');
    for (const c of s.topContainersMem.slice(0, 5)) {
      parts.push(`  • ${c.name} — ${c.memUsedPct.toFixed(1)}%`);
    }
  }
  return parts.join('\n');
}
