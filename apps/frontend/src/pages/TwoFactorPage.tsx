import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldOff, QrCode, Key, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuthStore } from '@/stores/auth.store';
import { toast } from '@/hooks/useToast';

export function TwoFactorPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'idle' | 'setup' | 'verify'>('idle');
  const [setupData, setSetupData] = useState<any>(null);
  const [token, setToken] = useState('');
  const [disableToken, setDisableToken] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const setupMutation = useMutation({
    mutationFn: () => api.get('/auth/mfa/setup'),
    onSuccess: (res) => {
      setSetupData(res.data.data);
      setStep('setup');
    },
    onError: (e: any) => toast({ title: 'Error', description: e.response?.data?.message, variant: 'destructive' }),
  });

  const enableMutation = useMutation({
    mutationFn: (tok: string) => api.post('/auth/mfa/enable', { token: tok }),
    onSuccess: (res) => {
      setBackupCodes(res.data.data?.backupCodes || []);
      setStep('verify');
      toast({ title: '2FA enabled', description: 'Save your backup codes in a secure location' });
    },
    onError: (e: any) => toast({ title: 'Invalid token', description: e.response?.data?.message, variant: 'destructive' }),
  });

  const disableMutation = useMutation({
    mutationFn: (tok: string) => api.post('/auth/mfa/disable', { token: tok }),
    onSuccess: () => {
      setStep('idle');
      setDisableToken('');
      toast({ title: '2FA disabled' });
    },
    onError: (e: any) => toast({ title: 'Invalid token', description: e.response?.data?.message, variant: 'destructive' }),
  });

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isMfaEnabled = (user as any)?.mfaEnabled;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Two-Factor Authentication</h1>
        <p className="text-muted-foreground">Add an extra layer of security to your account</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {isMfaEnabled ? (
                <ShieldCheck className="w-5 h-5 text-green-500" />
              ) : (
                <ShieldOff className="w-5 h-5 text-muted-foreground" />
              )}
              TOTP Authentication
            </CardTitle>
            <Badge variant={isMfaEnabled ? 'success' : 'secondary'}>
              {isMfaEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
          <CardDescription>
            Use an authenticator app (Google Authenticator, Authy, etc.) to generate time-based codes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isMfaEnabled && step === 'idle' && (
            <Button onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending}>
              <QrCode className="w-4 h-4 mr-2" />
              {setupMutation.isPending ? 'Generating...' : 'Set up 2FA'}
            </Button>
          )}

          {step === 'setup' && setupData && (
            <div className="space-y-6">
              <div>
                <p className="text-sm font-medium mb-2">1. Scan this QR code with your authenticator app</p>
                <div className="border rounded-lg p-4 inline-block bg-white">
                  <img src={setupData.qrCodeUrl} alt="QR Code" className="w-48 h-48" />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Or enter this key manually:</p>
                <code className="bg-muted px-3 py-2 rounded text-sm font-mono block">{setupData.secret}</code>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">2. Enter the 6-digit code from your app</p>
                <div className="flex gap-3">
                  <Input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="000000"
                    maxLength={6}
                    className="w-36 text-center text-lg font-mono"
                  />
                  <Button
                    onClick={() => enableMutation.mutate(token)}
                    disabled={token.length < 6 || enableMutation.isPending}
                  >
                    {enableMutation.isPending ? 'Verifying...' : 'Verify & Enable'}
                  </Button>
                  <Button variant="outline" onClick={() => setStep('idle')}>Cancel</Button>
                </div>
              </div>
            </div>
          )}

          {step === 'verify' && backupCodes.length > 0 && (
            <div className="space-y-4">
              <Alert>
                <Key className="w-4 h-4" />
                <AlertDescription>
                  Save these backup codes in a secure location. Each code can only be used once.
                </AlertDescription>
              </Alert>
              <div className="bg-muted p-4 rounded-lg">
                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {backupCodes.map((code) => (
                    <span key={code} className="px-2 py-1 bg-background rounded">{code}</span>
                  ))}
                </div>
              </div>
              <Button variant="outline" onClick={copyBackupCodes}>
                {copied ? <Check className="w-4 h-4 mr-2 text-green-500" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? 'Copied!' : 'Copy all codes'}
              </Button>
            </div>
          )}

          {isMfaEnabled && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                2FA is currently enabled. To disable it, enter a valid TOTP code or backup code.
              </p>
              <div className="flex gap-3">
                <Input
                  value={disableToken}
                  onChange={(e) => setDisableToken(e.target.value)}
                  placeholder="TOTP code or backup code"
                  className="max-w-xs font-mono"
                />
                <Button
                  variant="destructive"
                  onClick={() => disableMutation.mutate(disableToken)}
                  disabled={!disableToken || disableMutation.isPending}
                >
                  <ShieldOff className="w-4 h-4 mr-2" />
                  {disableMutation.isPending ? 'Disabling...' : 'Disable 2FA'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
