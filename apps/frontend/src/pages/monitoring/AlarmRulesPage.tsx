import { useState } from 'react';
import { Sliders, Plus } from 'lucide-react';
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
  useAlarmRules, useCreateRule, useUpdateRule, useDeleteRule, useTestRule, AlarmRule,
} from '@/hooks/useAlarmRules';
import { useNotificationChannels } from '@/hooks/useNotificationChannels';
import { SearchInput } from '@/components/ui/search-input';
import { useUrlSearch } from '@/hooks/useUrlSearch';

export function AlarmRulesPage() {
  const query = useAlarmRules();
  const channels = useNotificationChannels();
  const update = useUpdateRule();
  const del = useDeleteRule();
  const test = useTestRule();
  const confirm = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const { query: search, setQuery: setSearch, debounced } = useUrlSearch();
  const needle = debounced.toLowerCase();

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Alarm Rules"
        description="Thresholds and conditions evaluated every 30 seconds. Linked channels fire on breach."
        actions={<Button onClick={() => setAddOpen(true)}><Plus className="w-4 h-4 mr-1" />Add Rule</Button>}
      />
      <SearchInput value={search} onChange={setSearch} placeholder="Search alarm rules by name, metric, or target" />
      <AsyncView
        query={query}
        empty={<EmptyState icon={Sliders} title="No alarm rules" message="On first boot, 5 preset rules were created disabled. Enable them, or add your own." />}
      >
        {(allRows: AlarmRule[]) => {
          const rows = needle
            ? allRows.filter((r) =>
                (r.name || '').toLowerCase().includes(needle) ||
                (r.metric || '').toLowerCase().includes(needle) ||
                (r.target || '').toLowerCase().includes(needle),
              )
            : allRows;
          return (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Target</th>
                  <th className="p-2">Metric</th>
                  <th className="p-2 text-right">Threshold</th>
                  <th className="p-2 text-right">Window</th>
                  <th className="p-2">Severity</th>
                  <th className="p-2">Channels</th>
                  <th className="p-2">State</th>
                  <th className="p-2">Enabled</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="border-t">
                    <td className="p-2 font-medium">{r.name}</td>
                    <td className="p-2 text-xs"><code>{r.target}</code></td>
                    <td className="p-2 text-xs"><code>{r.metric}</code></td>
                    <td className="p-2 text-right font-mono tabular-nums">{r.operator}{r.threshold}</td>
                    <td className="p-2 text-right text-xs">{r.windowSec}s</td>
                    <td className="p-2">
                      <Badge variant={r.severity === 'critical' ? 'destructive' : 'default'}>{r.severity}</Badge>
                    </td>
                    <td className="p-2 text-xs">{r.channelIds?.length || 0}</td>
                    <td className="p-2 text-xs">
                      <Badge variant={r.state === 'firing' ? 'destructive' : r.state === 'pending' ? 'warning' : 'outline'}>
                        {r.state || 'ok'}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <Switch
                        checked={r.enabled}
                        onCheckedChange={(v) => update.mutate({ id: r._id, patch: { enabled: v } })}
                      />
                    </td>
                    <td className="p-2 flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => test.mutate(r._id)}>Test fire</Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={async () => {
                          const ok = await confirm({ title: 'Delete rule?', message: `Removes "${r.name}" permanently.`, variant: 'destructive' });
                          if (ok) del.mutate(r._id);
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

      <AddRuleDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        channels={channels.data || []}
      />
    </div>
  );
}

function AddRuleDialog({
  open, onOpenChange, channels,
}: { open: boolean; onOpenChange: (v: boolean) => void; channels: Array<{ _id: string; name: string; type: string }> }) {
  const create = useCreateRule();
  const [name, setName] = useState('');
  const [target, setTarget] = useState<AlarmRule['target']>('node');
  const [metric, setMetric] = useState<AlarmRule['metric']>('cpu');
  const [operator, setOperator] = useState<AlarmRule['operator']>('>');
  const [threshold, setThreshold] = useState(90);
  const [windowSec, setWindowSec] = useState(300);
  const [cooldownSec, setCooldownSec] = useState(600);
  const [severity, setSeverity] = useState<AlarmRule['severity']>('critical');
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);

  function reset() {
    setName(''); setTarget('node'); setMetric('cpu'); setOperator('>'); setThreshold(90);
    setWindowSec(300); setCooldownSec(600); setSeverity('critical'); setSelectedChannels([]);
  }

  async function submit() {
    await create.mutateAsync({
      name, target, metric, operator, threshold, windowSec, cooldownSec, severity,
      channelIds: selectedChannels, enabled: true,
    } as any);
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!create.isPending) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add alarm rule</DialogTitle>
          <DialogDescription>Choose what to watch, the threshold, how long it must breach, and which channels to notify.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. node CPU critical" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Target</Label>
              <Select value={target} onValueChange={(v: any) => setTarget(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="node">Node</SelectItem>
                  <SelectItem value="container">Container</SelectItem>
                  <SelectItem value="stack">Stack</SelectItem>
                  <SelectItem value="uptime">Uptime check</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Metric</Label>
              <Select value={metric} onValueChange={(v: any) => setMetric(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpu">CPU %</SelectItem>
                  <SelectItem value="mem">Memory %</SelectItem>
                  <SelectItem value="disk">Disk % (node only)</SelectItem>
                  <SelectItem value="uptime">Uptime status</SelectItem>
                  <SelectItem value="containerCount">Container count</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>Operator</Label>
              <Select value={operator} onValueChange={(v: any) => setOperator(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value=">">&gt;</SelectItem>
                  <SelectItem value=">=">&gt;=</SelectItem>
                  <SelectItem value="<">&lt;</SelectItem>
                  <SelectItem value="<=">&lt;=</SelectItem>
                  <SelectItem value="==">==</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Threshold</Label><Input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} /></div>
            <div><Label>Severity</Label>
              <Select value={severity} onValueChange={(v: any) => setSeverity(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Window (sec)</Label><Input type="number" value={windowSec} onChange={(e) => setWindowSec(Number(e.target.value))} /></div>
            <div><Label>Cooldown (sec)</Label><Input type="number" value={cooldownSec} onChange={(e) => setCooldownSec(Number(e.target.value))} /></div>
          </div>
          <div>
            <Label>Channels</Label>
            <div className="rounded border p-2 max-h-40 overflow-y-auto space-y-1">
              {channels.length === 0 && <p className="text-xs text-muted-foreground">No channels yet. Add one at /notifications/channels.</p>}
              {channels.map((c) => (
                <label key={c._id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedChannels.includes(c._id)}
                    onChange={() => setSelectedChannels((prev) => prev.includes(c._id) ? prev.filter((x) => x !== c._id) : [...prev, c._id])}
                  />
                  <span>{c.name}</span>
                  <Badge variant="outline" className="text-[10px]">{c.type}</Badge>
                </label>
              ))}
            </div>
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
