import { useParams, Link } from 'react-router-dom';
import {
  useGitopsDeployment,
  useGitopsDeployHistory,
  useTriggerGitopsDeploy,
  useUpdateGitopsDeployment,
} from '@/hooks/useGitops';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlayIcon, ArrowLeftIcon, CopyIcon } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import { useState } from 'react';

const STATUS_COLORS: Record<string, string> = {
  idle: 'secondary',
  running: 'outline',
  success: 'default',
  failed: 'destructive',
};

export function GitopsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: dep, isLoading } = useGitopsDeployment(id ?? '');
  const { data: history } = useGitopsDeployHistory(id ?? '');
  const triggerDeploy = useTriggerGitopsDeploy();
  const { toast } = useToast();
  const [triggering, setTriggering] = useState(false);

  async function handleTrigger() {
    if (!id) return;
    setTriggering(true);
    try {
      await triggerDeploy.mutateAsync(id);
      toast({ title: 'Deploy triggered' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Error', description: err?.message });
    } finally {
      setTriggering(false);
    }
  }

  function copyWebhookUrl() {
    if (!dep) return;
    const url = `${window.location.origin.replace(':5173', ':3000')}/api/v1/gitops/webhooks/${dep.webhookToken}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Webhook URL copied' });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!dep) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Deployment not found.</p>
      </div>
    );
  }

  const webhookUrl = `${window.location.origin.replace(':5173', ':3000')}/api/v1/gitops/webhooks/${dep.webhookToken}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/gitops">
          <Button variant="outline" size="sm">
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{dep.name}</h1>
          <p className="text-muted-foreground text-sm">{dep.repoUrl}</p>
        </div>
        <Badge variant={(STATUS_COLORS[dep.status] ?? 'secondary') as any} className="text-sm px-3 py-1">
          {dep.status}
        </Badge>
        <Button onClick={handleTrigger} disabled={triggering}>
          <PlayIcon className="h-4 w-4 mr-2" />
          {triggering ? 'Deploying...' : 'Deploy Now'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Branch</span>
              <Badge variant="outline">{dep.branch}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Compose Path</span>
              <span className="font-mono">{dep.composePath}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deploy Type</span>
              <span>{dep.deployType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Polling</span>
              <span>{dep.pollingIntervalMinutes}m</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Auto Update</span>
              <span>{dep.autoUpdate ? 'Yes' : 'No'}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Last Deploy</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Commit</span>
              <span className="font-mono">{dep.lastCommitSha || '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Message</span>
              <p className="mt-1">{dep.lastCommitMessage || '—'}</p>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deployed At</span>
              <span>{dep.lastDeployedAt ? new Date(dep.lastDeployedAt).toLocaleString() : '—'}</span>
            </div>
            {dep.lastError && (
              <div>
                <span className="text-destructive text-xs">Error: {dep.lastError}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Webhook URL */}
      <Card>
        <CardHeader><CardTitle className="text-base">Webhook URL</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={webhookUrl} readOnly className="font-mono text-xs" />
            <Button variant="outline" size="sm" onClick={copyWebhookUrl}>
              <CopyIcon className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Add this URL to your GitHub/GitLab repository webhook settings to trigger deployments on push.
          </p>
        </CardContent>
      </Card>

      {/* Deploy History */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Deploy History</h2>
        <div className="rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Commit</th>
                <th className="text-left px-4 py-3 font-medium">Message</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Deployed At</th>
              </tr>
            </thead>
            <tbody>
              {(history ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-muted-foreground">
                    No deploy history yet.
                  </td>
                </tr>
              )}
              {(history ?? []).map((h: any, i: number) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs">{h.commitSha}</td>
                  <td className="px-4 py-3 text-muted-foreground">{h.commitMessage}</td>
                  <td className="px-4 py-3">
                    <Badge variant={(STATUS_COLORS[h.status] ?? 'secondary') as any}>{h.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {new Date(h.deployedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
