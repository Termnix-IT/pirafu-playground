// @vitest-environment node
import { promises as fs, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
// The shared runtime contract is JavaScript so future Python consumers do not depend on TypeScript.
import { assertSafeUrl, generateCatalog, validateCatalog, validateManifest, validateRecord } from '../scripts/catalog.mjs';

const fixtureDirectory = new URL('../contracts/fixtures/', import.meta.url);
const fixture = (name: string) => JSON.parse(readFileSync(new URL(name, fixtureDirectory), 'utf8'));
const roots: string[] = [];

async function createCatalog() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pirafu-catalog-'));
  roots.push(root);
  await fs.mkdir(path.join(root, 'catalog/projects'), { recursive: true });
  await fs.writeFile(path.join(root, 'catalog/categories.json'), JSON.stringify([{ id: 'games', label: 'ゲーム' }]));
  return root;
}

async function writeRecord(root: string, record = fixture('record-valid.json'), filename = `${record.project.id}.json`) {
  await fs.writeFile(path.join(root, 'catalog/projects', filename), JSON.stringify(record));
  return record;
}

async function createImage(root: string, id: string, name = 'thumbnail.png') {
  const directory = path.join(root, 'catalog/media', id);
  await fs.mkdir(directory, { recursive: true });
  await sharp({ create: { width: 24, height: 16, channels: 4, background: '#cccccc' } }).png().toFile(path.join(directory, name));
  return { path: `media/${id}/${name}`, alt: '動作検証用の単色画像' };
}

afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

describe('shared contract fixtures', () => {
  for (const testCase of fixture('cases.json').cases) {
    it(testCase.name, () => {
      const data = fixture(testCase.base);
      for (const change of testCase.changes) {
        const parent = change.path.slice(0, -1).reduce((object: Record<string, unknown>, key: string) => object[key], data);
        parent[change.path.at(-1)] = change.value;
      }
      const validate = () => (testCase.kind === 'manifest' ? validateManifest(data) : validateRecord(data));
      if (testCase.valid) expect(validate).not.toThrow();
      else expect(validate).toThrow();
    });
  }
});

describe('URL trust boundary', () => {
  it.each([
    'http://example.com/', 'javascript:alert(1)', 'https://user:password@example.com/',
    'https://example.com/?', 'https://example.com/?#fragment', 'https://example.com/?q=test#fragment',
    'https://localhost/', 'https://machine.local/', 'https://router.home.arpa/',
    'https://10.0.0.1/', 'https://2130706433/', 'https://0x7f000001/',
    'https://169.254.169.254/', 'https://100.64.1.1/', 'https://192.168.1.1/',
    'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://[fc00::1]/',
    'https://[2001:db8::1]/', 'https://example.com\\@localhost/',
  ])('rejects unsafe URL %s', (url) => expect(() => assertSafeUrl(url)).toThrow());

  it('allows an HTTPS subpath and fragment without making a request', () => {
    expect(assertSafeUrl('https://example.com/app/#start')).toBe('https://example.com/app/#start');
    expect(assertSafeUrl('https://example.com/#/search?q=test')).toBe('https://example.com/#/search?q=test');
  });
});

describe('source validation and publication transformation', () => {
  it('omits a duplicate disabled launch link while preserving independent repository links and source records', async () => {
    const root = await createCatalog();
    const record = fixture('record-valid.json');
    record.links.website = record.launch.url;
    await writeRecord(root, record);
    const sourcePath = path.join(root, 'catalog/projects/sample-game.json');
    const sourceBefore = await fs.readFile(sourcePath, 'utf8');
    const result = await generateCatalog(root);
    expect(result.catalog.projects[0].launch).toEqual({ type: 'external' });
    expect(result.catalog.projects[0].links).toEqual({ repository: record.links.repository });
    const delivered = await fs.readFile(path.join(root, 'src/data/generated/catalog.json'), 'utf8');
    expect(delivered).not.toContain(record.launch.url);
    expect(await fs.readFile(sourcePath, 'utf8')).toBe(sourceBefore);
  });

  it('removes canonical equivalents of a disabled app URL, including fragment aliases', async () => {
    const root = await createCatalog();
    const record = fixture('record-valid.json');
    record.launch.url = 'https://EXAMPLE.COM:443/app/#start';
    record.links.website = 'https://example.com/app/#/search?q=test';
    await writeRecord(root, record);
    const result = await validateCatalog(root);
    expect(result.catalog.projects[0].links).toEqual({ repository: record.links.repository });
    record.links.repository = 'https://example.com/app/';
    record.links.website = 'https://example.com/docs/';
    await writeRecord(root, record);
    expect((await validateCatalog(root)).catalog.projects[0].links).toEqual({ website: record.links.website });
    record.links.website = 'https://example.com/app/#alternate';
    await writeRecord(root, record);
    expect((await validateCatalog(root)).catalog.projects[0].links).toBeUndefined();
  });

  it('preserves duplicate app links when launch is enabled', async () => {
    const root = await createCatalog();
    const record = fixture('record-valid.json');
    record.publication.launchEnabled = true;
    record.links.website = record.launch.url;
    await writeRecord(root, record);
    const result = await validateCatalog(root);
    expect(result.catalog.projects[0].launch.url).toBe(record.launch.url);
    expect(result.catalog.projects[0].links).toEqual(record.links);
  });

  it('strips hidden records and images, and strips disabled launch URLs while retaining unlisted details', async () => {
    const root = await createCatalog();
    const publicRecord = fixture('record-valid.json');
    publicRecord.catalog.thumbnail = await createImage(root, publicRecord.project.id);
    await writeRecord(root, publicRecord);
    const hidden = structuredClone(publicRecord);
    hidden.project.id = 'hidden-game';
    hidden.publication.visibility = 'hidden';
    hidden.catalog.thumbnail = await createImage(root, hidden.project.id);
    await writeRecord(root, hidden);
    const unlisted = fixture('record-valid.json');
    unlisted.project.id = 'unlisted-game';
    unlisted.publication.visibility = 'unlisted';
    unlisted.publication.launchEnabled = true;
    await writeRecord(root, unlisted);
    const result = await generateCatalog(root);
    expect(result.sourceCount).toBe(3);
    expect(result.hiddenCount).toBe(1);
    expect(result.catalog.projects.map((item: { id: string }) => item.id)).toEqual(['sample-game', 'unlisted-game']);
    expect(result.catalog.projects[0].launch).toEqual({ type: 'external' });
    expect(result.catalog.projects[1].visibility).toBe('unlisted');
    expect(result.catalog.projects[1].launch.url).toBe(unlisted.launch.url);
    expect(result.media.size).toBe(1);
    const serialized = await fs.readFile(path.join(root, 'src/data/generated/catalog.json'), 'utf8');
    expect(serialized).not.toContain('hidden-game');
    expect(serialized).not.toContain('publication');
    expect(result.catalog.projects[0].thumbnail).toMatchObject({ width: 24, height: 16 });
    expect(result.catalog.projects[0].thumbnail!.src).toMatch(/^\/generated\/media\/sample-game\/[a-f0-9]{64}\.png$/);
    await expect(fs.access(path.join(root, 'public/generated/media/hidden-game'))).rejects.toThrow();
    const first = serialized;
    await generateCatalog(root);
    expect(await fs.readFile(path.join(root, 'src/data/generated/catalog.json'), 'utf8')).toBe(first);
  });

  it('removes stale generated images after a project becomes hidden', async () => {
    const root = await createCatalog();
    const record = fixture('record-valid.json');
    record.catalog.thumbnail = await createImage(root, record.project.id);
    await writeRecord(root, record);
    const first = await generateCatalog(root);
    const generatedImage = path.join(root, 'public', first.catalog.projects[0].thumbnail!.src);
    await expect(fs.access(generatedImage)).resolves.toBeUndefined();
    record.publication.visibility = 'hidden';
    await writeRecord(root, record);
    await generateCatalog(root);
    await expect(fs.access(generatedImage)).rejects.toThrow();
  });

  it('validates hidden sources and leaves previous generation untouched on failure', async () => {
    const root = await createCatalog();
    const record = await writeRecord(root);
    await generateCatalog(root);
    const first = await fs.readFile(path.join(root, 'src/data/generated/catalog.json'), 'utf8');
    record.publication.visibility = 'hidden';
    record.catalog.thumbnail = { path: 'media/sample-game/missing.png', alt: '不存在の画像' };
    await writeRecord(root, record);
    await expect(generateCatalog(root)).rejects.toThrow(/missing|unreadable/);
    expect(await fs.readFile(path.join(root, 'src/data/generated/catalog.json'), 'utf8')).toBe(first);
  });

  it.each(['../outside.png', 'media/sample-game/../../outside.png', 'media/another-game/image.png', 'C:/image.png', 'media\\sample-game\\image.png'])('rejects escaping or mismatched media path %s', async (imagePath) => {
    const root = await createCatalog();
    const record = fixture('record-valid.json');
    record.catalog.thumbnail = { path: imagePath, alt: '不正な参照' };
    await writeRecord(root, record);
    await expect(validateCatalog(root)).rejects.toThrow();
  });

  it('rejects a corrupted image despite a valid PNG extension', async () => {
    const root = await createCatalog();
    const record = fixture('record-valid.json');
    record.catalog.thumbnail = await createImage(root, record.project.id);
    await fs.writeFile(path.join(root, 'catalog', record.catalog.thumbnail.path), 'not an image');
    await writeRecord(root, record);
    await expect(validateCatalog(root)).rejects.toThrow(/decode/);
  });

  it('rejects extension spoofing and overlarge dimensions', async () => {
    const root = await createCatalog();
    const record = fixture('record-valid.json');
    record.catalog.thumbnail = await createImage(root, record.project.id);
    const imagePath = path.join(root, 'catalog', record.catalog.thumbnail.path);
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).jpeg().toFile(imagePath);
    await writeRecord(root, record);
    await expect(validateCatalog(root)).rejects.toThrow(/extension/);
    await sharp({ create: { width: 4097, height: 1, channels: 3, background: '#fff' } }).png().toFile(imagePath);
    await expect(validateCatalog(root)).rejects.toThrow(/dimensions/);
  });

  it('rejects image inputs exceeding 2 MiB before decoding', async () => {
    const root = await createCatalog();
    const record = fixture('record-valid.json');
    record.catalog.thumbnail = await createImage(root, record.project.id);
    await fs.writeFile(path.join(root, 'catalog', record.catalog.thumbnail.path), Buffer.alloc(2 * 1024 * 1024 + 1));
    await writeRecord(root, record);
    await expect(validateCatalog(root)).rejects.toThrow(/2 MiB/);
  });

  it('rejects PNG animation control even if the decoder exposes only its first frame', async () => {
    const root = await createCatalog();
    const record = fixture('record-valid.json');
    record.catalog.thumbnail = await createImage(root, record.project.id);
    const imagePath = path.join(root, 'catalog', record.catalog.thumbnail.path);
    const png = await fs.readFile(imagePath);
    const animationControl = Buffer.alloc(20);
    animationControl.writeUInt32BE(8, 0);
    animationControl.write('acTL', 4, 'ascii');
    animationControl.writeUInt32BE(2, 8);
    // Insert the animation-control chunk after IHDR. Container inspection runs before decoding.
    await fs.writeFile(imagePath, Buffer.concat([png.subarray(0, 33), animationControl, png.subarray(33)]));
    await writeRecord(root, record);
    await expect(validateCatalog(root)).rejects.toThrow(/animated/);
  });

  it('re-encodes allowed images and removes source EXIF metadata', async () => {
    const root = await createCatalog();
    const record = fixture('record-valid.json');
    record.catalog.thumbnail = await createImage(root, record.project.id);
    const original = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } })
      .withMetadata({ exif: { IFD0: { ImageDescription: 'fixture source metadata' } } }).png().toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    await fs.writeFile(path.join(root, 'catalog', record.catalog.thumbnail.path), original);
    await writeRecord(root, record);
    const result = await validateCatalog(root);
    const image = [...result.media.values()][0] as Buffer;
    const metadata = await sharp(image).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
  });

  it('rejects media directory symlinks', async ({ skip }) => {
    const root = await createCatalog();
    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'pirafu-image-target-'));
    roots.push(target);
    await fs.mkdir(path.join(root, 'catalog/media'), { recursive: true });
    try {
      await fs.symlink(target, path.join(root, 'catalog/media/sample-game'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) skip('Current filesystem does not permit symlink creation; run in an unrestricted environment.');
      throw error;
    }
    const record = fixture('record-valid.json');
    record.catalog.thumbnail = { path: 'media/sample-game/thumbnail.png', alt: 'リンク' };
    await writeRecord(root, record);
    await expect(validateCatalog(root)).rejects.toThrow(/symbolic/);
  });

  it('rejects generated output directory symlinks without touching their target', async ({ skip }) => {
    const root = await createCatalog();
    const target = await fs.mkdtemp(path.join(os.tmpdir(), 'pirafu-output-target-'));
    roots.push(target);
    await fs.writeFile(path.join(target, 'sentinel.txt'), 'preserve');
    await fs.mkdir(path.join(root, 'public'), { recursive: true });
    try {
      await fs.symlink(target, path.join(root, 'public/generated'), process.platform === 'win32' ? 'junction' : 'dir');
    } catch (error) {
      if (['EPERM', 'EACCES', 'ENOTSUP'].includes((error as NodeJS.ErrnoException).code ?? '')) skip('Current filesystem does not permit symlink creation; run in an unrestricted environment.');
      throw error;
    }
    await writeRecord(root);
    await expect(generateCatalog(root)).rejects.toThrow(/symbolic/);
    expect(await fs.readFile(path.join(target, 'sentinel.txt'), 'utf8')).toBe('preserve');
  });

  it('rejects filename/ID mismatches and duplicate categories', async () => {
    const root = await createCatalog();
    await writeRecord(root, fixture('record-valid.json'), 'other-name.json');
    await expect(validateCatalog(root)).rejects.toThrow(/filename/);
    await fs.rm(path.join(root, 'catalog/projects/other-name.json'));
    await writeRecord(root);
    await fs.writeFile(path.join(root, 'catalog/categories.json'), JSON.stringify([{ id: 'games', label: 'ゲーム' }, { id: 'games', label: '重複' }]));
    await expect(validateCatalog(root)).rejects.toThrow(/unique/);
  });

  it('allows an unfinished external manifest but requires its URL at registration', () => {
    const manifest = fixture('manifest-valid.json');
    manifest.hosting = { provider: 'external', mode: 'unmanaged' };
    manifest.launch = { type: 'external' };
    expect(() => validateManifest(manifest)).not.toThrow();
    const record = fixture('record-valid.json');
    delete record.launch.url;
    expect(() => validateRecord(record)).toThrow(/required/);
  });

  it('validates Cloudflare build settings without executing their command', () => {
    const manifest = fixture('manifest-valid.json');
    manifest.hosting = { provider: 'cloudflare-pages', mode: 'git', projectName: 'sample-tool', productionBranch: 'main', rootDirectory: '.', buildCommand: '', outputDirectory: '.' };
    expect(() => validateManifest(manifest)).not.toThrow();
    manifest.hosting.outputDirectory = '../outside';
    expect(() => validateManifest(manifest)).toThrow(/path/);
  });

  it('allows empty arguments but rejects a whitespace-padded executable', () => {
    const manifest = fixture('manifest-valid.json');
    manifest.local = { build: ['python', '-c', ''] };
    expect(() => validateManifest(manifest)).not.toThrow();
    manifest.local.build[0] = ' python ';
    expect(() => validateManifest(manifest)).toThrow(/whitespace/);
  });
});
