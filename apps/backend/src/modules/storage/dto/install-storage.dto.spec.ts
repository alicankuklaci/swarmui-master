import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { InstallStorageDto } from './install-storage.dto';

// C pack #5 regression guard. The `nodes` and `nfsServerNode` fields flow
// into the agent WS URL template and the openssl CA signing CN; a
// permissive @IsString would let an attacker POST a nodeId that redirects
// the WS connection off-swarm or smuggles shell meta-chars past openssl.
// The RFC-1123 Matches on each field is the fix — these tests pin the
// rejection surface.

function errorsFor(input: unknown): string[] {
  const dto = plainToInstance(InstallStorageDto, input);
  return validateSync(dto, {
    whitelist: true,
    forbidNonWhitelisted: false,
  }).flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('InstallStorageDto hostname validation (C pack #5)', () => {
  it('accepts a plain RFC-1123 host list', () => {
    const errs = errorsFor({
      backend: 'seaweedfs',
      nodes: ['node02', 'node03', 'manager-01.swarm.local'],
    });
    expect(errs).toHaveLength(0);
  });

  it.each([
    ['empty entry', ['node02', '']],
    ['leading hyphen', ['-node02']],
    ['trailing hyphen', ['node02-']],
    ['semicolon command injection', ['node02; curl evil']],
    ['shell meta chars', ['node02$(whoami)']],
    ['path traversal', ['../etc/passwd']],
    ['space', ['node 02']],
    ['scheme smuggle', ['http://evil']],
    ['url with slash', ['node02/evil']],
    ['overly long single label', [`${'a'.repeat(64)}`]],
    ['oversized overall', [`${'a'.repeat(255)}`]],
    ['unicode homoglyph', ['nodé02']],
  ])('rejects nodes with %s', (_label, nodes) => {
    const errs = errorsFor({ backend: 'seaweedfs', nodes });
    expect(errs.join(' ')).toMatch(/hostname|RFC/i);
  });

  it('rejects an empty nodes array', () => {
    const errs = errorsFor({ backend: 'seaweedfs', nodes: [] });
    expect(errs.join(' ')).toMatch(/should not be empty|minSize/);
  });

  it('rejects an oversized nodes array (ArrayMaxSize=64)', () => {
    const nodes = Array.from({ length: 65 }, (_, i) => `n${i.toString().padStart(2, '0')}`);
    const errs = errorsFor({ backend: 'seaweedfs', nodes });
    expect(errs.join(' ')).toMatch(/must contain no more than|maxSize/i);
  });

  it('rejects a bad nfsServerNode when backend=nfs', () => {
    const errs = errorsFor({
      backend: 'nfs',
      nodes: ['node02'],
      nfsServerNode: 'nfs; curl evil',
    });
    expect(errs.join(' ')).toMatch(/hostname|RFC/i);
  });

  it('accepts a good nfsServerNode when backend=nfs', () => {
    const errs = errorsFor({
      backend: 'nfs',
      nodes: ['node02', 'node03'],
      nfsServerNode: 'nfs.swarm.local',
    });
    expect(errs).toHaveLength(0);
  });

  it('does not require nfsServerNode when backend=seaweedfs', () => {
    const errs = errorsFor({ backend: 'seaweedfs', nodes: ['node02'] });
    expect(errs).toHaveLength(0);
  });
});
