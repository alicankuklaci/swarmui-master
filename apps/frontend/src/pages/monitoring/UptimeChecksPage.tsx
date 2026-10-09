import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Radio, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { AsyncView } from '@/components/ui/async-view';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  useUptimeChecks, useCreateCheck, useUpdateCheck, useDeleteCheck, useTestCheck,
  UptimeCheck,
} from '@/hooks/useUptimeChecks';
import { formatDate, cn } from '@/lib/utils';

export function UptimeChecksPage() {
  const query = useUptimeChecks();
  const [addOpen, setAddOpen] = useState(false);
  const update = useUpdateCheck();
  const del = useDeleteCheck();
  const test = useTestCheck();
  const confirm = useConfirm();

  function renderStatus(c: UptimeCheck) {
    const map: any = { up: 'default', down: 'destructive', unknown: 'outline' };
    return <Badge variant={map[c.lastStatus || 'unknown']}>{c.lastStatus || 'unknown'}</Badge>;
  }

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        title="Uptime Checks"
        description="HTTP, TCP and ping probes. 7-day history, success-rate shown over 24h."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add Check
          </Button>
        }
      />

      <AsyncView
        query={query}
        empty={<EmptyState icon={Radio} title="No uptime checks" message="Add one to probe a URL, TCP port or ICMP host." action={<Button onClick={() => setAddOpen(true)}>Add Check</Button>} />}
      >
        {(rows: UptimeCheck[]) => (
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Type</th>
                  <th className="p-2">Target</th>
                  <th className="p-2">Status</th>
                  <th className="p-2 text-right">Last ms</th>
                  <th className="p-2 text-right">24h success</th>
                  <th className="p-2">Last check</th>
                  <th className="p-2">Enabled</th>
                  <th className="p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c._id} className="border-t">
                    <td className="p-2 font-medium">
                      <Link to={`/monitoring/uptime/${c._id}`} className="hover:underline">{c.name}</Link>
                    </td>
                    <td className="p-2 text-xs"><code>{c.type}</code></td>
                    <td className="p-2 text-xs max-w-[300px] truncate">{c.target}</td>
                    <td className="p-2">{renderStatus(c)}</td>
                    <td className="p-2 text-right font-mono tabular-nums text-xs">{c.lastResponseMs ?? '-'}</td>
                    <td className={cn('p-2 text-right font-mono tabular-nums text-xs',
                      (c.successRate24h ?? 100) < 95 && 'text-amber-600',
                      (c.successRate24h ?? 100) < 90 && 'text-red-600')}>
                      {c.successRate24h != null ? `${c.successRate24h.toFixed(1)}%` : '—'}
                    </td>
                    <td className="p-2 text-xs">{c.lastCheckedAt ? formatDate(c.lastCheckedAt) : '—'}</td>
                    <td className="p-2">
                      <Switch
                        checked={c.enabled}
                        onCheckedChange={(v) => update.mutate({ id: c._id, patch: { enabled: v } })}
                      />
                    </td>
                    <td className="p-2 flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => test.mutate(c._id)} disabled={test.isPending}>
                        Test now
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'Delete uptime check?',
                            message: `Deletes "${c.name}" and its history.`,
                            variant: 'destructive',
                          });
                          if (ok) del.mutate(c._id);
                        }}
                      >Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AsyncView>

      <AddCheckDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}

function AddCheckDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateCheck();
  const [name, setName] = useState('');
  const [type, setType] = useState<'http' | 'tcp' | 'ping'>('http');
  const [target, setTarget] = useState('');
  const [intervalSec, setIntervalSec] = useState(30);
  const [timeoutSec, setTimeoutSec] = useState(10);
  const [expectedStatus, setExpectedStatus] = useState<string>('');

  function reset() {
    setName(''); setType('http'); setTarget(''); setIntervalSec(30); setTimeoutSec(10); setExpectedStatus('');
  }

  async function submit() {
    const dto: any = { name, type, target, intervalSec, timeoutSec };
    if (type === 'http' && expectedStatus) dto.expectedStatus = Number(expectedStatus);
    await create.mutateAsync(dto);
    onOpenChange(false);
    reset();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!create.isPending) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Uptime Check</DialogTitle>
          <DialogDescription>Choose the probe type and target. For HTTP, you can require a specific status code.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="API healthcheck" /></div>
          <div>
            <Label>Type</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP(S)</SelectItem>
                <SelectItem value="tcp">TCP (host:port)</SelectItem>
                <SelectItem value="ping">ICMP ping</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Target</Label>
            <Input value={target} onChange={(e) => setTarget(e.target.value)}
              placeholder={type === 'http' ? 'https://example.com/healthz' : type === 'tcp' ? 'host:port' : 'host.example.com'} />
          </div>
          {type === 'http' && (
            <div>
              <Label>Expected status (optional)</Label>
              <Input value={expectedStatus} onChange={(e) => setExpectedStatus(e.target.value)} placeholder="200" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Interval (sec)</Label><Input type="number" value={intervalSec} onChange={(e) => setIntervalSec(Number(e.target.value))} /></div>
            <div><Label>Timeout (sec)</Label><Input type="number" value={timeoutSec} onChange={(e) => setTimeoutSec(Number(e.target.value))} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!name || !target || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
