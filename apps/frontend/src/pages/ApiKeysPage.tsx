import { useState } from 'react';
import { Key, BookOpen } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiKeysList } from '@/components/api-docs/ApiKeysList';
import { DocumentationTab } from '@/components/api-docs/DocumentationTab';

type ApiKeysTab = 'keys' | 'docs';

export function ApiKeysPage() {
  const [tab, setTab] = useState<ApiKeysTab>('keys');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Key className="w-6 h-6" /> API Keys
        </h1>
        <p className="text-muted-foreground">
          Manage API keys for programmatic access and browse the REST API documentation.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ApiKeysTab)}>
        <TabsList>
          <TabsTrigger value="keys" className="flex items-center gap-2">
            <Key className="w-4 h-4" /> API Keys
          </TabsTrigger>
          <TabsTrigger value="docs" className="flex items-center gap-2">
            <BookOpen className="w-4 h-4" /> Documentation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="keys">
          <ApiKeysList />
        </TabsContent>

        <TabsContent value="docs">
          <DocumentationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
