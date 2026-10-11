import { useState, useMemo } from 'react';
import { Send, Plus, Check, X, Bug } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { AsyncView } from '@/components/ui/async-view';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  useNotificationChannels, useCreateChannel, useUpdateChannel, useDeleteChannel,
  useTestChannel, useTestChannelDebug, useChannelLogs,
  useChannelTypes, ChannelType, ChannelFieldSchema, NotificationChannel,
  ChannelTestDebugResult, NotificationLogEntry,
} from '@/hooks/useNotificationChannels';
import { toast } from '@/hooks/useToast';
import { formatDate } from '@/lib/utils';
import { SearchInput } from '@/components/ui/search-input';
import { useUrlSearch } from '@/hooks/useUrlSearch';

export function NotificationChannelsPage() {
  const query = useNotificationChannels();
  const update = useUpdateChannel();
  const del = useDeleteChannel();
  const test = useTestChannel();
  const confirm = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const [debugChannel, setDebugChannel] = useState<NotificationChannel | null>(null);
  const { query: search, setQuery: setSearch, debounced } = useUrlSearch();
  const needle = debounced.toLowerCase();

  async function doTest(id: string) {
    try {
      const result = await test.mutateAsync(id);
      if (result.success) {
        const info = (result as any).info;
        const summary = summarizeTestInfo(info);
        toast({ title: 'Test sent', description: summary || 'Transport reported no further details — open Debug for the transcript.' });
      } else {
        toast({ variant: 'destructive', title: 'Test failed', description: result.error || 'Unknown error' });
      }
    } catch { /* useAppMutation handles the toast */ }
  }

  function summarizeTestInfo(info: any): string | undefined {
    if (!info) return undefined;
    if (Array.isArray(info.accepted) || Array.isArray(info.rejected)) {
      const parts: string[] = [];
      if (info.accepted?.length) parts.push(`accepted: ${info.accepted.join(', ')}`);
      if (info.rejected?.length) parts.push(`rejected: ${info.rejected.join(', ')}`);
      if (info.response) parts.push(`SMTP: ${String(info.response).slice(0, 80)}`);
      return parts.join(' · ') || undefined;
    }
    if (info.httpStatus) {
      return `HTTP ${info.httpStatus}${info.response?.ok === true ? ' (ok)' : ''}`;
    }
    return undefined;
  }

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Notification Channels"
        description="Telegram, Slack, Email and Webhooks. Attach channels to alarm rules at /monitoring/rules."
        actions={<Button onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" />Add Channel</Button>}
      />
      <SearchInput value={search} onChange={setSearch} placeholder="Search channels by name or type" />

      <AsyncView
        query={query}
        empty={<EmptyState icon={Send} title="No channels yet" message="Create your first channel to start receiving alarms." action={<Button onClick={() => setAddOpen(true)}>Add Channel</Button>} />}
      >
        {(allRows: NotificationChannel[]) => {
          const rows = needle
            ? allRows.filter((c) =>
                (c.name || '').toLowerCase().includes(needle) ||
                (c.type || '').toLowerCase().includes(needle),
              )
            : allRows;
          return (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Config (masked)</th>
                  <th className="p-2">Last test</th>
                  <th className="p-2">Enabled</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c._id} className="border-t">
                    <td className="p-2 font-medium">{c.name}</td>
                    <td className="p-2"><Badge>{c.type}</Badge></td>
                    <td className="p-2 text-xs font-mono text-muted-foreground max-w-[320px] truncate">
                      {JSON.stringify(c.configMasked)}
                    </td>
                    <td className="p-2 text-xs">
                      {c.lastTestResult ? (
                        <span className="flex items-center gap-1">
                          {c.lastTestResult.success
                            ? <Check className="w-3 h-3 text-emerald-500" />
                            : <X className="w-3 h-3 text-red-500" />}
                          <span>{formatDate(c.lastTestResult.ts)}</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="p-2">
                      <Switch checked={c.enabled} onCheckedChange={(v) => update.mutate({ id: c._id, patch: { enabled: v } })} />
                    </td>
                    <td className="p-2 flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => doTest(c._id)} disabled={test.isPending}>Send Test</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDebugChannel(c)} title="Open debug panel — transcript + delivery log">
                        <Bug className="w-4 h-4 mr-1" />Debug
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={async () => {
                          const ok = await confirm({ title: 'Delete channel?', message: `Removes "${c.name}" (encrypted config also deleted).`, variant: 'destructive' });
                          if (ok) del.mutate(c._id);
                        }}
                      >Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          );
        }}
      </AsyncView>
      <AddChannelDialog open={addOpen} onOpenChange={setAddOpen} />
      <ChannelDebugDialog channel={debugChannel} onOpenChange={(v) => { if (!v) setDebugChannel(null); }} />
    </div>
  );
}

function ChannelDebugDialog({ channel, onOpenChange }: { channel: NotificationChannel | null; onOpenChange: (open: boolean) => void }) {
  const open = !!channel;
  const debugTest = useTestChannelDebug();
  const logsQ = useChannelLogs(channel?._id, open);
  const [liveResult, setLiveResult] = useState<ChannelTestDebugResult | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  async function runDebug() {
    if (!channel) return;
    try {
      const r = await debugTest.mutateAsync(channel._id);
      setLiveResult(r);
      // Refresh the logs so the row we just produced shows up with its transcript.
      logsQ.refetch();
    } catch (e: any) {
      setLiveResult({ success: false, error: e?.message || 'Request failed' });
    }
  }

  function close(v: boolean) {
    if (!v) { setLiveResult(null); setExpandedLogId(null); }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Debug: {channel?.name}</DialogTitle>
          <DialogDescription>
            Runs a live test and shows the raw transport conversation (SMTP debug for email, HTTP request/response for Slack / Telegram / webhook). Below is the recent delivery log — click a row to see the stored transcript for that attempt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Live debug test</h3>
              <Button size="sm" onClick={runDebug} disabled={debugTest.isPending}>
                {debugTest.isPending ? 'Running…' : 'Run debug test'}
              </Button>
            </div>
            {liveResult ? (
              <ResultCard result={liveResult} />
            ) : (
              <p className="text-xs text-muted-foreground">
                Click <strong>Run debug test</strong> to send a test notification and capture the full transport transcript. Secrets are redacted.
              </p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Recent delivery log (last 50)</h3>
            {logsQ.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
            {logsQ.isError && <p className="text-xs text-red-500">Failed to load logs.</p>}
            {logsQ.data && logsQ.data.length === 0 && (
              <p className="text-xs text-muted-foreground">No delivery attempts recorded yet.</p>
            )}
            {logsQ.data && logsQ.data.length > 0 && (
              <div className="rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/60 text-left">
                    <tr>
                      <th className="p-2">When</th>
                      <th className="p-2">Kind</th>
                      <th className="p-2">Result</th>
                      <th className="p-2">Latency</th>
                      <th className="p-2">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsQ.data.map((row) => (
                      <LogRow
                        key={row._id} row={row}
                        expanded={expandedLogId === row._id}
                        onToggle={() => setExpandedLogId((prev) => prev === row._id ? null : row._id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultCard({ result }: { result: ChannelTestDebugResult }) {
  const bg = result.success ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900' : 'bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900';
  const Icon = result.success ? Check : X;
  const colour = result.success ? 'text-emerald-600' : 'text-red-600';
  return (
    <div className={`rounded-md border p-3 ${bg}`}>
      <div className={`flex items-center gap-2 text-sm font-medium ${colour}`}>
        <Icon className="w-4 h-4" />
        {result.success ? 'Transport reported success' : `Failed: ${result.error || 'unknown'}`}
      </div>
      {result.info && (
        <details className="mt-2 text-xs" open>
          <summary className="cursor-pointer text-muted-foreground">Transport response</summary>
          <pre className="mt-1 bg-muted/60 p-2 rounded overflow-x-auto whitespace-pre-wrap break-words">{safeJson(result.info)}</pre>
        </details>
      )}
      {result.transcript && result.transcript.length > 0 && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">Transcript ({result.transcript.length} lines)</summary>
          <pre className="mt-1 bg-muted/60 p-2 rounded overflow-x-auto whitespace-pre-wrap break-words max-h-96">{result.transcript.join('\n')}</pre>
        </details>
      )}
    </div>
  );
}

function LogRow({ row, expanded, onToggle }: { row: NotificationLogEntry; expanded: boolean; onToggle: () => void }) {
  const detail = row.error
    ? row.error
    : (row.info?.response ? String(row.info.response).slice(0, 80) : (row.info?.accepted?.length ? `accepted: ${row.info.accepted.join(', ')}` : '—'));
  return (
    <>
      <tr className="border-t cursor-pointer hover:bg-muted/40" onClick={onToggle}>
        <td className="p-2 whitespace-nowrap">{formatDate(row.ts)}</td>
        <td className="p-2 whitespace-nowrap">
          <Badge variant={row.test ? 'outline' : 'secondary'}>{row.test ? 'test' : 'alarm'}</Badge>
        </td>
        <td className="p-2">
          <span className={`inline-flex items-center gap-1 ${row.success ? 'text-emerald-600' : 'text-red-600'}`}>
            {row.success ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            {row.success ? 'ok' : 'fail'}
          </span>
        </td>
        <td className="p-2 whitespace-nowrap tabular-nums">{row.latencyMs}ms</td>
        <td className="p-2 text-muted-foreground max-w-md truncate">{detail}</td>
      </tr>
      {expanded && (
        <tr className="border-t bg-muted/30">
          <td colSpan={5} className="p-3">
            {row.info && (
              <div className="mb-2">
                <div className="text-xs font-semibold mb-1">Info</div>
                <pre className="text-xs bg-background border rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">{safeJson(row.info)}</pre>
              </div>
            )}
            {row.transcript && row.transcript.length > 0 ? (
              <div>
                <div className="text-xs font-semibold mb-1">Transcript</div>
                <pre className="text-xs bg-background border rounded p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-80">{row.transcript.join('\n')}</pre>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No transcript stored for this attempt (log pre-dates the debug feature).</p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function safeJson(value: unknown): string {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function AddChannelDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateChannel();
  const typesQ = useChannelTypes();
  const [type, setType] = useState<ChannelType>('telegram');
  const [name, setName] = useState('');
  const [cfg, setCfg] = useState<Record<string, any>>({});

  const schema = useMemo<ChannelFieldSchema[]>(() => {
    const entry = typesQ.data?.find((t) => t.type === type);
    return entry?.schema || [];
  }, [typesQ.data, type]);

  function reset() { setName(''); setType('telegram'); setCfg({}); }

  async function submit() {
    const config = { ...cfg };
    // Convert multi-text to array
    for (const field of schema) {
      if (field.type === 'multi-text' && typeof config[field.key] === 'string') {
        config[field.key] = String(config[field.key]).split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean);
      }
      if (field.type === 'number' && config[field.key] != null) {
        config[field.key] = Number(config[field.key]);
      }
    }
    await create.mutateAsync({ name, type, config, enabled: true });
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!create.isPending) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Notification Channel</DialogTitle>
          <DialogDescription>Pick a type; the form below renders dynamically. Secrets are encrypted at rest.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div><Label>Channel name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ops-telegram" /></div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v: any) => { setType(v); setCfg({}); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="slack">Slack</SelectItem>
                <SelectItem value="email">Email (SMTP)</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="pt-2 border-t">
            {schema.map((f) => (
              <div key={f.key} className="mb-3">
                <Label>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
                {f.type === 'textarea' || f.type === 'multi-text' ? (
                  <textarea
                    rows={3}
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={cfg[f.key] ?? ''}
                    onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                  />
                ) : f.type === 'select' ? (
                  <Select value={cfg[f.key] ?? ''} onValueChange={(v) => setCfg({ ...cfg, [f.key]: v })}>
                    <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
                    <SelectContent>
                      {f.options?.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    type={f.type === 'password' ? 'password' : f.type === 'number' ? 'number' : f.type === 'url' ? 'url' : 'text'}
                    value={cfg[f.key] ?? ''}
                    onChange={(e) => setCfg({ ...cfg, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                  />
                )}
                {f.help && <p className="text-xs text-muted-foreground mt-1">{f.help}</p>}
              </div>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
