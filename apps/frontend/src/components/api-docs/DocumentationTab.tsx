import { useMemo, useState } from 'react';
import { Download, ExternalLink, BookOpen, KeyRound, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/useToast';
import { api } from '@/lib/api';
import {
  EXAMPLE_ENDPOINTS,
  RATE_LIMITS,
  SNIPPET_LANGUAGES,
  buildSnippet,
  getApiBaseUrl,
  getOpenApiJsonUrl,
  getSwaggerUrl,
  type SnippetLanguage,
} from '@/lib/api-docs';
import { CodeBlock } from './CodeBlock';

/**
 * Documentation sub-view for the API Keys page.
 * Keeps file size well under 300 LOC by delegating code rendering to CodeBlock.
 */
export function DocumentationTab() {
  const { toast } = useToast();
  const [snippetLang, setSnippetLang] = useState<SnippetLanguage>('curl');
  const [exampleIdx, setExampleIdx] = useState(0);
  const [downloading, setDownloading] = useState(false);

  const baseUrl = useMemo(() => getApiBaseUrl(), []);
  const swaggerUrl = useMemo(() => getSwaggerUrl(), []);
  const openApiJsonUrl = useMemo(() => getOpenApiJsonUrl(), []);

  const current = EXAMPLE_ENDPOINTS[exampleIdx];
  const snippet = useMemo(
    () => buildSnippet(snippetLang, current.snippet),
    [snippetLang, current],
  );

  /**
   * Download via axios so the browser carries the user's JWT (the spec
   * endpoint is login-gated). A plain `<a download>` would skip auth.
   */
  const handleDownload = async () => {
    setDownloading(true);
    try {
      const resp = await api.get('/docs-json', {
        baseURL: '/api',
        responseType: 'blob',
      });
      const blob = resp.data as Blob;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'swarmui-openapi.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'OpenAPI spec downloaded' });
    } catch (err) {
      toast({
        title: 'Download failed',
        description: 'Could not fetch the OpenAPI spec. Make sure you are logged in.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> Overview
          </CardTitle>
          <CardDescription>
            How to authenticate against the SwarmUI REST API and where to look things up.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-2 font-medium mb-1">
                <Shield className="w-4 h-4 text-blue-500" /> JWT (Bearer)
              </div>
              <p className="text-muted-foreground mb-2">
                Short-lived access token issued on login. Send it as{' '}
                <code className="bg-muted px-1 rounded">Authorization: Bearer &lt;jwt&gt;</code>.
              </p>
              <p className="text-muted-foreground">
                Use for the web UI and short interactive scripts; the browser auto-refreshes it.
              </p>
            </div>
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-2 font-medium mb-1">
                <KeyRound className="w-4 h-4 text-amber-500" /> API Key
              </div>
              <p className="text-muted-foreground mb-2">
                Long-lived credential for machine/CI access. Send it as{' '}
                <code className="bg-muted px-1 rounded">X-Api-Key: sk-...</code>.
              </p>
              <p className="text-muted-foreground">
                Create one in the API Keys tab. Scopes: <code>read</code>, <code>write</code>,{' '}
                <code>admin</code>.
              </p>
            </div>
          </div>

          <div className="rounded-md border p-3">
            <div className="font-medium mb-1">Base URL</div>
            <code className="block bg-muted px-2 py-1 rounded text-xs break-all">{baseUrl}</code>
          </div>

          <div className="rounded-md border p-3">
            <div className="font-medium mb-1">Rate limits</div>
            <p className="text-muted-foreground">
              Default: <strong>{RATE_LIMITS.requestsPerWindow}</strong> requests per{' '}
              <strong>{RATE_LIMITS.windowSeconds}s</strong> per IP. Requests over the limit return{' '}
              <code>429 Too Many Requests</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Interactive explorer */}
      <Card>
        <CardHeader>
          <CardTitle>Interactive explorer</CardTitle>
          <CardDescription>
            Browse every endpoint and try requests live from the Swagger UI (login-gated — your
            current session is reused).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button asChild variant="default">
            <a href={swaggerUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" /> Open Swagger UI
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleDownload}
            disabled={downloading}
          >
            <Download className="w-4 h-4 mr-2" />
            {downloading ? 'Downloading…' : 'Download OpenAPI JSON'}
          </Button>
          <Button asChild variant="ghost">
            <a href={openApiJsonUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" /> View raw spec
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Code snippets */}
      <Card>
        <CardHeader>
          <CardTitle>Code snippets</CardTitle>
          <CardDescription>
            Copy-paste a template call. Replace{' '}
            <code className="bg-muted px-1 rounded">YOUR_API_KEY</code> with a key from the API Keys
            tab.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Example endpoint
            </label>
            <select
              className="w-full md:w-auto rounded-md border bg-background px-3 py-1.5 text-sm"
              value={exampleIdx}
              onChange={(e) => setExampleIdx(Number(e.target.value))}
            >
              {EXAMPLE_ENDPOINTS.map((ex, i) => (
                <option key={ex.label} value={i}>
                  {ex.snippet.method} {ex.snippet.path} — {ex.label}
                </option>
              ))}
            </select>
          </div>

          <Tabs value={snippetLang} onValueChange={(v) => setSnippetLang(v as SnippetLanguage)}>
            <TabsList>
              {SNIPPET_LANGUAGES.map((l) => (
                <TabsTrigger key={l.id} value={l.id}>
                  {l.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {SNIPPET_LANGUAGES.map((l) => (
              <TabsContent key={l.id} value={l.id}>
                <CodeBlock code={snippet} language={l.id} />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
