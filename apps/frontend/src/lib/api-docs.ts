/**
 * Shared helpers for the API Keys > Documentation tab.
 *
 * One place to tweak base URLs and code snippet templates. Pages should
 * import from here instead of embedding strings.
 */

/** Absolute base URL of the versioned REST API, e.g. "https://host/api/v1". */
export function getApiBaseUrl(): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
  return `${origin}/api/v1`;
}

/** Absolute URL to the Swagger UI (login-gated in production). */
export function getSwaggerUrl(): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
  return `${origin}/api/docs`;
}

/** Absolute URL to the OpenAPI JSON (login-gated in production). */
export function getOpenApiJsonUrl(): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost';
  return `${origin}/api/docs-json`;
}

/**
 * Default throttling applied by ThrottlerModule (ttl=60s, limit=100).
 * Keep in sync with apps/backend/src/app.module.ts.
 */
export const RATE_LIMITS = {
  windowSeconds: 60,
  requestsPerWindow: 100,
} as const;

export type SnippetLanguage = 'curl' | 'python' | 'node' | 'go';

export interface SnippetInput {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path relative to the API base, e.g. "/endpoints/local/swarm/stacks". */
  path: string;
  /** JSON body (object). Only emitted for non-GET methods. */
  body?: unknown;
  /** API key placeholder (what the user sees in the snippet). */
  apiKeyVariable?: string;
}

const DEFAULT_API_KEY_VAR = 'YOUR_API_KEY';

/**
 * Known example endpoint used across all snippets. Keep this list in one
 * place so the Documentation tab stays coherent.
 */
export const EXAMPLE_ENDPOINTS: Array<{
  label: string;
  snippet: SnippetInput;
}> = [
  {
    label: 'List stacks on the local Swarm',
    snippet: { method: 'GET', path: '/endpoints/local/swarm/stacks' },
  },
  {
    label: 'List running containers on the local endpoint',
    snippet: { method: 'GET', path: '/endpoints/local/containers?all=false' },
  },
  {
    label: 'Deploy a new stack (compose YAML in body)',
    snippet: {
      method: 'POST',
      path: '/endpoints/local/swarm/stacks',
      body: { name: 'my-stack', composeContent: 'version: "3.9"\nservices:\n  web:\n    image: nginx' },
    },
  },
];

/** Build a snippet string for the given language + request shape. */
export function buildSnippet(lang: SnippetLanguage, input: SnippetInput): string {
  const base = getApiBaseUrl();
  const keyVar = input.apiKeyVariable ?? DEFAULT_API_KEY_VAR;
  const hasBody = input.method !== 'GET' && input.body !== undefined;
  const bodyJson = hasBody ? JSON.stringify(input.body, null, 2) : '';

  switch (lang) {
    case 'curl':
      return [
        `curl -X ${input.method} '${base}${input.path}' \\`,
        `  -H 'X-Api-Key: ${keyVar}' \\`,
        hasBody ? `  -H 'Content-Type: application/json' \\` : null,
        hasBody ? `  -d '${bodyJson.replace(/'/g, "'\\''")}'` : null,
      ]
        .filter(Boolean)
        .join('\n')
        .replace(/\\\n$/, '')
        .trim();

    case 'python':
      return [
        `import requests`,
        ``,
        `API_KEY = "${keyVar}"`,
        `BASE_URL = "${base}"`,
        ``,
        `resp = requests.${input.method.toLowerCase()}(`,
        `    f"{BASE_URL}${input.path}",`,
        `    headers={"X-Api-Key": API_KEY},`,
        hasBody ? `    json=${bodyJson.replace(/\n/g, '\n    ')},` : null,
        `)`,
        `resp.raise_for_status()`,
        `print(resp.json())`,
      ]
        .filter(Boolean)
        .join('\n');

    case 'node':
      return [
        `// Node.js >= 18 (built-in fetch)`,
        `const API_KEY = "${keyVar}";`,
        `const BASE_URL = "${base}";`,
        ``,
        `const resp = await fetch(\`\${BASE_URL}${input.path}\`, {`,
        `  method: "${input.method}",`,
        `  headers: {`,
        `    "X-Api-Key": API_KEY,`,
        hasBody ? `    "Content-Type": "application/json",` : null,
        `  },`,
        hasBody ? `  body: JSON.stringify(${bodyJson}),` : null,
        `});`,
        `if (!resp.ok) throw new Error(\`HTTP \${resp.status}\`);`,
        `const data = await resp.json();`,
        `console.log(data);`,
      ]
        .filter(Boolean)
        .join('\n');

    case 'go':
      return [
        `package main`,
        ``,
        `import (`,
        `    "bytes"`,
        `    "fmt"`,
        `    "io"`,
        `    "net/http"`,
        `)`,
        ``,
        `func main() {`,
        `    apiKey := "${keyVar}"`,
        `    baseURL := "${base}"`,
        hasBody ? `    body := bytes.NewBufferString(\`${bodyJson.replace(/`/g, '` + "`" + `')}\`)` : null,
        hasBody
          ? `    req, _ := http.NewRequest("${input.method}", baseURL+"${input.path}", body)`
          : `    req, _ := http.NewRequest("${input.method}", baseURL+"${input.path}", nil)`,
        `    req.Header.Set("X-Api-Key", apiKey)`,
        hasBody ? `    req.Header.Set("Content-Type", "application/json")` : null,
        `    resp, err := http.DefaultClient.Do(req)`,
        `    if err != nil { panic(err) }`,
        `    defer resp.Body.Close()`,
        `    out, _ := io.ReadAll(resp.Body)`,
        `    fmt.Println(string(out))`,
        `}`,
      ]
        .filter(Boolean)
        .join('\n');
  }
}

export const SNIPPET_LANGUAGES: Array<{ id: SnippetLanguage; label: string }> = [
  { id: 'curl', label: 'curl' },
  { id: 'python', label: 'Python' },
  { id: 'node', label: 'Node.js' },
  { id: 'go', label: 'Go' },
];
