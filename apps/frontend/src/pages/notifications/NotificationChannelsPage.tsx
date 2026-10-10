import { useState, useMemo } from 'react';
import { Send, Plus, Check, X } from 'lucide-react';
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
  useTestChannel, useChannelTypes, ChannelType, ChannelFieldSchema, NotificationChannel,
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
  const { query: search, setQuery: setSearch, debounced } = useUrlSearch();
  const needle = debounced.toLowerCase();

  async function doTest(id: string) {
    try {
      const result = await test.mutateAsync(id);
      if (result.success) toast({ title: 'Test sent successfully' });
      else toast({ variant: 'destructive', title: 'Test failed', description: result.error || 'Unknown error' });
    } catch { /* useAppMutation handles the toast */ }
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
    </div>
  );
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
