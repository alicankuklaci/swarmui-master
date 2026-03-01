import { useState } from 'react';
import { useTemplates, useTemplateCategories, useDeployTemplate } from '@/hooks/useTemplates';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RocketIcon, SearchIcon } from 'lucide-react';
import { useToast } from '@/hooks/useToast';

function TemplateLogo({ logo, title }: { logo: string; title: string }) {
  const [errored, setErrored] = useState(false);
  if (!logo || errored) {
    return (
      <div className="w-12 h-12 rounded bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground">
        {title.charAt(0).toUpperCase()}
      </div>
    );
  }
  return (
    <img
      src={logo}
      alt={title}
      className="w-12 h-12 object-contain rounded"
      onError={() => setErrored(true)}
    />
  );
}

export function TemplatesPage() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | undefined>(undefined);
  const [deployTarget, setDeployTarget] = useState<any>(null);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [deployName, setDeployName] = useState('');
  const [deploying, setDeploying] = useState(false);

  const { data: templates, isLoading } = useTemplates(activeCategory, search || undefined);
  const { data: categories } = useTemplateCategories();
  const deployTemplate = useDeployTemplate();
  const { toast } = useToast();

  function openDeploy(template: any) {
    setDeployTarget(template);
    setDeployName(template.title.toLowerCase().replace(/\s+/g, '-'));
    const defaults: Record<string, string> = {};
    (template.env ?? []).forEach((e: any) => {
      defaults[e.name] = e.default ?? '';
    });
    setEnvValues(defaults);
  }

  async function handleDeploy() {
    if (!deployTarget) return;
    setDeploying(true);
    try {
      const result = await deployTemplate.mutateAsync({
        id: deployTarget._id,
        dto: { name: deployName, envValues },
      });
      toast({ title: 'Deployed!', description: result.message });
      setDeployTarget(null);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Deploy failed', description: err?.message });
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Templates</h1>
      </div>

      {/* Search + filter */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          <Button
            size="sm"
            variant={activeCategory === undefined ? 'default' : 'outline'}
            onClick={() => setActiveCategory(undefined)}
          >
            All
          </Button>
          {(categories ?? []).map((cat: string) => (
            <Button
              key={cat}
              size="sm"
              variant={activeCategory === cat ? 'default' : 'outline'}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <p className="text-muted-foreground">Loading templates...</p>
        </div>
      )}

      {/* Template cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {(templates ?? []).map((t: any) => (
          <div
            key={t._id}
            className="rounded-lg border bg-card flex flex-col p-4 gap-3 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-3">
              <TemplateLogo logo={t.logo} title={t.title} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{t.title}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{t.image || t.type}</div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>

            <div className="flex flex-wrap gap-1">
              {(t.categories ?? []).map((cat: string) => (
                <Badge key={cat} variant="secondary" className="text-xs">
                  {cat}
                </Badge>
              ))}
              <Badge variant="outline" className="text-xs">
                {t.type}
              </Badge>
            </div>

            <Button size="sm" className="mt-auto w-full" onClick={() => openDeploy(t)}>
              <RocketIcon className="h-3 w-3 mr-1.5" />
              Deploy
            </Button>
          </div>
        ))}
        {!isLoading && (templates ?? []).length === 0 && (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            No templates found.
          </div>
        )}
      </div>

      {/* Deploy Dialog */}
      <Dialog open={!!deployTarget} onOpenChange={(o) => { if (!o) setDeployTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Deploy: {deployTarget?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={deployName}
                onChange={(e) => setDeployName(e.target.value)}
                placeholder="container-name"
              />
            </div>
            {(deployTarget?.env ?? []).length > 0 && (
              <div className="space-y-3">
                <div className="text-sm font-medium">Environment Variables</div>
                {(deployTarget?.env ?? []).map((e: any) => (
                  <div key={e.name}>
                    <Label>
                      {e.label}
                      {e.required && <span className="text-destructive ml-1">*</span>}
                    </Label>
                    {e.description && (
                      <p className="text-xs text-muted-foreground mb-1">{e.description}</p>
                    )}
                    <Input
                      value={envValues[e.name] ?? ''}
                      onChange={(ev) => setEnvValues({ ...envValues, [e.name]: ev.target.value })}
                      placeholder={e.default ?? ''}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeployTarget(null)} disabled={deploying}>
              Cancel
            </Button>
            <Button onClick={handleDeploy} disabled={deploying}>
              {deploying ? 'Deploying...' : 'Deploy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
