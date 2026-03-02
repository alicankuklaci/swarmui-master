import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Mail, Webhook, Clock, Settings2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useForm, Controller } from 'react-hook-form';
import { useEffect } from 'react';
import { toast } from '@/hooks/useToast';

export function SettingsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get('/settings');
      return res.data.data;
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => api.put('/settings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast({ title: 'Settings saved' });
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: (body: any) => api.post('/notifications/test-email', body),
    onSuccess: (res) => {
      const r = res.data.data || res.data;
      toast({ title: r.success ? 'Email sent!' : 'Email failed', description: r.message, variant: r.success ? 'default' : 'destructive' });
    },
  });

  const testWebhookMutation = useMutation({
    mutationFn: (url: string) => api.post('/notifications/test-webhook', { url }),
    onSuccess: (res) => {
      const r = res.data.data || res.data;
      toast({ title: r.success ? 'Webhook OK!' : 'Webhook failed', description: r.message, variant: r.success ? 'default' : 'destructive' });
    },
  });

  const { register, handleSubmit, control, reset, watch } = useForm();

  useEffect(() => {
    if (data) reset(data);
  }, [data, reset]);

  const webhookUrl = watch('webhooks.0.url');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure system-wide settings</p>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading settings...</div>
      ) : (
        <form onSubmit={handleSubmit((d) => updateMutation.mutate(d))}>
          <Tabs defaultValue="general" className="space-y-4">
            <TabsList>
              <TabsTrigger value="general"><Settings2 className="w-4 h-4 mr-2" />General</TabsTrigger>
              <TabsTrigger value="smtp"><Mail className="w-4 h-4 mr-2" />SMTP</TabsTrigger>
              <TabsTrigger value="notifications"><Webhook className="w-4 h-4 mr-2" />Webhooks</TabsTrigger>
              <TabsTrigger value="logs"><Clock className="w-4 h-4 mr-2" />Log Retention</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Authentication</CardTitle><CardDescription>Configure authentication settings</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Authentication Method</Label>
                    <Controller name="authenticationMethod" control={control} render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local">Local</SelectItem>
                          <SelectItem value="ldap">LDAP/AD</SelectItem>
                          <SelectItem value="oauth">OAuth</SelectItem>
                        </SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div className="space-y-2">
                    <Label>Session Lifetime (seconds)</Label>
                    <Input {...register('sessionLifetime')} type="number" className="max-w-xs" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Appearance</CardTitle><CardDescription>Customize the platform appearance</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Logo URL</Label>
                    <Input {...register('logoUrl')} placeholder="https://example.com/logo.png" className="max-w-md" />
                  </div>
                  <div className="space-y-2">
                    <Label>Login Banner Message</Label>
                    <Input {...register('loginBannerMessage')} placeholder="Welcome to SwarmUI Master" className="max-w-md" />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="smtp" className="space-y-4">
              <Card>
                <CardHeader><CardTitle>SMTP Email Configuration</CardTitle><CardDescription>Configure outbound email for notifications and alerts</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>SMTP Host</Label><Input {...register('smtp.host')} placeholder="smtp.gmail.com" /></div>
                    <div className="space-y-2"><Label>SMTP Port</Label><Input {...register('smtp.port')} type="number" placeholder="587" /></div>
                    <div className="space-y-2"><Label>Username</Label><Input {...register('smtp.user')} placeholder="user@example.com" /></div>
                    <div className="space-y-2"><Label>Password</Label><Input {...register('smtp.pass')} type="password" placeholder="••••••••" /></div>
                  </div>
                  <div className="space-y-2">
                    <Label>From Address</Label>
                    <Input {...register('smtp.from')} placeholder="SwarmUI Master <noreply@example.com>" className="max-w-md" />
                  </div>
                  <div className="pt-2 border-t space-y-2">
                    <Label>Test Email</Label>
                    <div className="flex gap-3">
                      <Input id="testEmail" placeholder="admin@example.com" className="max-w-sm" />
                      <Button type="button" variant="outline" disabled={testEmailMutation.isPending}
                        onClick={() => {
                          const testEmail = (document.getElementById('testEmail') as HTMLInputElement)?.value;
                          testEmailMutation.mutate({ smtpConfig: { host: watch('smtp.host'), port: watch('smtp.port'), user: watch('smtp.user'), pass: watch('smtp.pass') }, testEmail });
                        }}>
                        {testEmailMutation.isPending ? 'Sending...' : 'Send Test'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="notifications" className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Webhook Notifications</CardTitle><CardDescription>Send notifications to Slack, Teams, or custom webhooks</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-4 border rounded-lg p-4">
                    <p className="text-sm font-medium text-muted-foreground">Webhook #1</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Name</Label><Input {...register('webhooks.0.name')} placeholder="Slack Alerts" /></div>
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Controller name="webhooks.0.type" control={control} render={({ field }) => (
                          <Select onValueChange={field.onChange} value={field.value || 'custom'}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="slack">Slack</SelectItem>
                              <SelectItem value="teams">Microsoft Teams</SelectItem>
                              <SelectItem value="custom">Custom</SelectItem>
                            </SelectContent>
                          </Select>
                        )} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Webhook URL</Label>
                      <div className="flex gap-3">
                        <Input {...register('webhooks.0.url')} placeholder="https://hooks.slack.com/services/..." className="flex-1" />
                        <Button type="button" variant="outline" disabled={!webhookUrl || testWebhookMutation.isPending}
                          onClick={() => testWebhookMutation.mutate(webhookUrl)}>
                          {testWebhookMutation.isPending ? 'Testing...' : 'Test'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="logs" className="space-y-4">
              <Card>
                <CardHeader><CardTitle>Log Retention</CardTitle><CardDescription>Configure how long logs are kept in the database</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Auth Log Retention (days)</Label>
                    <Input {...register('authLogRetentionDays')} type="number" min={1} max={365} className="max-w-xs" />
                    <p className="text-xs text-muted-foreground">Login attempts, MFA events. Default: 30 days.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Activity Log Retention (days)</Label>
                    <Input {...register('activityLogRetentionDays')} type="number" min={1} max={365} className="max-w-xs" />
                    <p className="text-xs text-muted-foreground">API request audit trail. Default: 90 days.</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end pt-4">
            <Button type="submit" disabled={updateMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
