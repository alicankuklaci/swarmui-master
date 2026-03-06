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
              <TabsTrigger value="ldap">🔌 LDAP/AD</TabsTrigger>
              <TabsTrigger value="oauth">🔐 OAuth</TabsTrigger>
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

            <TabsContent value="ldap" className="space-y-4">
              <Card>
                <CardHeader><CardTitle>LDAP / Active Directory</CardTitle><CardDescription>Kurumsal directory servisi ile kimlik doğrulama. Authentication Method'u "LDAP/AD" seçin ve kaydedin.</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2"><Label>LDAP Server URL</Label><Input {...register('ldap.url')} placeholder="ldap://dc.company.com:389" className="font-mono text-sm" /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Bind DN</Label><Input {...register('ldap.bindDn')} placeholder="cn=admin,dc=company,dc=com" className="font-mono text-sm" /></div>
                      <div className="space-y-2"><Label>Bind Password</Label><Input {...register('ldap.bindPassword')} type="password" placeholder="••••••••" /></div>
                    </div>
                    <div className="space-y-2"><Label>Search Base</Label><Input {...register('ldap.searchBase')} placeholder="ou=users,dc=company,dc=com" className="font-mono text-sm" /></div>
                    <div className="space-y-2"><Label>Search Filter</Label><Input {...register('ldap.searchFilter')} placeholder="(uid={username})" className="font-mono text-sm" /></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Username Attribute</Label><Input {...register('ldap.usernameAttribute')} placeholder="uid" /></div>
                      <div className="space-y-2"><Label>Email Attribute</Label><Input {...register('ldap.emailAttribute')} placeholder="mail" /></div>
                    </div>
                  </div>
                  <div className="bg-muted/50 rounded p-3 text-xs text-muted-foreground">
                    <p>💡 Aktif Dizin için tipik ayarlar: Bind DN = <code>cn=service-account,cn=Users,dc=company,dc=com</code>, Search Filter = <code>(sAMAccountName=&#123;username&#125;)</code></p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="oauth" className="space-y-4">
              <Card>
                <CardHeader><CardTitle>OAuth 2.0 / OpenID Connect</CardTitle><CardDescription>Google, GitHub, Azure AD veya özel OAuth provider ile SSO</CardDescription></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Provider</Label>
                    <Controller name="oauth.provider" control={control} render={({ field }) => (
                      <Select onValueChange={field.onChange} value={field.value || ''}>
                        <SelectTrigger className="max-w-xs"><SelectValue placeholder="Provider seç..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="google">Google</SelectItem>
                          <SelectItem value="github">GitHub</SelectItem>
                          <SelectItem value="microsoft">Microsoft / Azure AD</SelectItem>
                          <SelectItem value="custom">Custom / Self-hosted</SelectItem>
                        </SelectContent>
                      </Select>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Client ID</Label><Input {...register('oauth.clientId')} className="font-mono text-sm" /></div>
                    <div className="space-y-2"><Label>Client Secret</Label><Input {...register('oauth.clientSecret')} type="password" /></div>
                  </div>
                  <div className="space-y-2"><Label>Authorization URL</Label><Input {...register('oauth.authorizationUrl')} className="font-mono text-sm" /></div>
                  <div className="space-y-2"><Label>Token URL</Label><Input {...register('oauth.tokenUrl')} className="font-mono text-sm" /></div>
                  <div className="space-y-2"><Label>User Info URL</Label><Input {...register('oauth.userInfoUrl')} className="font-mono text-sm" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Scopes</Label><Input {...register('oauth.scopes')} placeholder="openid email profile" /></div>
                    <div className="space-y-2"><Label>Redirect URI</Label><Input {...register('oauth.redirectUri')} placeholder={window.location.origin + '/auth/oauth/callback'} className="font-mono text-sm" /></div>
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
