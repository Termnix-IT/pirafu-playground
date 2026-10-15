import { createHash } from 'node:crypto';
import { promises as fs, readFileSync } from 'node:fs';
import { isIP } from 'node:net';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import sharp from 'sharp';

const schemaDirectory = new URL('../contracts/v1/', import.meta.url);
const readSchema = (name) => JSON.parse(readFileSync(new URL(name, schemaDirectory), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
addFormats(ajv);
ajv.addSchema(readSchema('common.schema.json'));
const recordValidator = ajv.compile(readSchema('catalog.schema.json'));
const manifestValidator = ajv.compile(readSchema('manifest.schema.json'));
const categoryValidator = ajv.compile({
  type: 'array', minItems: 1, maxItems: 4,
  items: {
    type: 'object', additionalProperties: false, required: ['id', 'label'],
    properties: {
      id: { enum: ['apps', 'games', 'tools', 'other'] },
      label: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
    },
  },
});
const reservedIds = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9]|conin|conout)$/i;
const maxJsonBytes = 256 * 1024;
const maxImageBytes = 2 * 1024 * 1024;

export class CatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CatalogError';
  }
}

function assert(condition, message) {
  if (!condition) throw new CatalogError(message);
}

function hasControlCharacters(value, includeSpace = false) {
  return [...value].some((character) => character.codePointAt(0) < (includeSpace ? 33 : 32) || character.codePointAt(0) === 127);
}

function schemaCheck(validator, data, label) {
  if (validator(data)) return;
  const details = validator.errors.map(({ instancePath, message }) => `${instancePath || '/'} ${message}`).join('; ');
  throw new CatalogError(`${label}: schema validation failed: ${details}`);
}

export function assertSafeUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new CatalogError('URL must be an absolute HTTPS URL'); }
  assert(url.protocol === 'https:', 'URL must use HTTPS');
  assert(!url.username && !url.password, 'URL credentials are forbidden');
  assert(!value.split('#', 1)[0].includes('?'), 'URL query strings are forbidden');
  assert(!hasControlCharacters(value, true) && !value.includes('\\'), 'URL contains unsafe characters');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const [a, b, c] = host.split('.').map(Number);
    const reserved = a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113);
    assert(!reserved, 'URL must not address a local, private, or reserved IP');
  } else if (ipVersion === 6) {
    // Only global unicast is accepted; transition/documentation ranges are excluded.
    const [first, second] = host.split(':').map((part) => Number.parseInt(part || '0', 16));
    assert(/^[23]/.test(host) && !(first === 0x2001 && (second < 0x200 || second === 0xdb8)) && first !== 0x2002 && first !== 0x3fff,
      'URL must not address a local, private, or reserved IP');
  } else {
    assert(host.includes('.') && !/(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|invalid|test|onion)$/.test(host),
      'URL must not address a local or internal hostname');
    assert(!/(^|\.)home\.arpa$/.test(host), 'URL must not address a local or internal hostname');
    assert(host.split('.').every((part) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)), 'URL hostname is invalid');
  }
  return value;
}

function safeRelative(value, label, allowDot = false) {
  if (allowDot && value === '.') return;
  assert(!path.isAbsolute(value) && !/[:\\]/u.test(value) && !hasControlCharacters(value), `${label}: absolute, drive, or backslash paths are forbidden`);
  assert(value.split('/').every((part) => part && part !== '.' && part !== '..'
    && !/[. ]$/.test(part) && !/[<>"|?*]/.test(part) && !reservedIds.test(part.split('.')[0])), `${label}: invalid path component`);
}

function canonicalWithoutFragment(value) {
  const url = new URL(value);
  url.hash = '';
  return url.href;
}

function publishedLinks(record) {
  const disabledUrl = record.launch.type === 'external' && !record.publication.launchEnabled
    ? canonicalWithoutFragment(record.launch.url) : undefined;
  const entries = Object.entries(record.links ?? {}).filter(([, url]) =>
    !disabledUrl || canonicalWithoutFragment(url) !== disabledUrl);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function validateBusinessRules(data, isManifest) {
  assert(!reservedIds.test(data.project.id), 'project.id is reserved on Windows');
  const tags = (data.project.tags ?? []).map((tag) => tag.normalize('NFKC').trim().toLowerCase());
  assert(tags.every(Boolean), 'tags must not normalize to empty text');
  assert(new Set(tags).size === tags.length, 'tags must be unique after Unicode normalization');
  if (data.launch.url) assertSafeUrl(data.launch.url);
  for (const url of Object.values(data.links ?? {})) assertSafeUrl(url);
  for (const image of [data.catalog.thumbnail, ...(data.catalog.screenshots ?? [])].filter(Boolean)) {
    safeRelative(image.path, 'image.path');
    if (!isManifest) assert(image.path.startsWith(`media/${data.project.id}/`), 'image.path must stay in the project media directory');
  }
  if (isManifest && data.hosting.provider === 'cloudflare-pages') {
    safeRelative(data.hosting.rootDirectory, 'hosting.rootDirectory', true);
    safeRelative(data.hosting.outputDirectory, 'hosting.outputDirectory', true);
    assert(!hasControlCharacters(data.hosting.buildCommand), 'hosting.buildCommand contains control characters');
  }
  if (isManifest) {
    for (const argv of Object.values(data.local ?? {})) {
      assert(Boolean(argv[0].trim()) && argv[0] === argv[0].trim(), 'local command executable must not be empty or have surrounding whitespace');
      assert(argv.every((argument) => !argument.includes('\0')), 'local command arguments must not contain NUL');
    }
  }
  return data;
}

export function validateRecord(data) {
  schemaCheck(recordValidator, data, 'catalog record');
  return validateBusinessRules(data, false);
}

export function validateManifest(data) {
  schemaCheck(manifestValidator, data, 'manifest');
  return validateBusinessRules(data, true);
}

async function noSymlinks(root, relative, { allowMissing = false } = {}) {
  let current = root;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      assert(!stat.isSymbolicLink(), `${relative}: symbolic links are forbidden`);
    } catch (error) {
      if (allowMissing && error.code === 'ENOENT') return;
      if (error instanceof CatalogError) throw error;
      throw new CatalogError(`${relative}: missing or unreadable path`);
    }
  }
}

async function readJson(root, relative) {
  await noSymlinks(root, relative);
  const absolute = path.join(root, relative);
  const stat = await fs.stat(absolute);
  assert(stat.isFile() && stat.size <= maxJsonBytes, `${relative}: expected JSON file at most 256 KiB`);
  try { return JSON.parse(await fs.readFile(absolute, 'utf8')); }
  catch { throw new CatalogError(`${relative}: invalid JSON`); }
}

function rejectAnimatedPng(bytes, label) {
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return;
  // Sharp does not expose APNG frames; inspect the PNG animation-control chunk as well.
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    assert(offset + 12 + length <= bytes.length, `${label}: invalid PNG chunk length`);
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    assert(type !== 'acTL', `${label}: animated images are forbidden`);
    if (type === 'IEND') break;
    offset += 12 + length;
  }
}

async function readImage(root, id, image) {
  const relative = `catalog/${image.path}`;
  await noSymlinks(root, relative);
  const absolute = path.join(root, relative);
  const stat = await fs.stat(absolute);
  assert(stat.isFile() && stat.size > 0 && stat.size <= maxImageBytes, `${relative}: image must be at most 2 MiB`);
  const extension = path.extname(image.path).toLowerCase();
  const extensions = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.webp': 'webp' };
  assert(Object.hasOwn(extensions, extension), `${relative}: only PNG, JPEG, and WebP images are supported`);
  try {
    const bytes = await fs.readFile(absolute);
    rejectAnimatedPng(bytes, relative);
    const options = { limitInputPixels: 4096 * 4096, failOn: 'warning', animated: true };
    const metadata = await sharp(bytes, options).metadata();
    assert(metadata.format === extensions[extension], `${relative}: image content and extension differ`);
    assert(metadata.width > 0 && metadata.height > 0 && metadata.width <= 4096 && metadata.height <= 4096, `${relative}: image dimensions must be at most 4096 pixels`);
    assert((metadata.pages ?? 1) === 1 && metadata.loop === undefined && metadata.delay === undefined, `${relative}: animated images are forbidden`);
    // Re-encoding also forces full decoding and strips EXIF/XMP/ICC metadata.
    const { data, info } = await sharp(bytes, options).rotate().toFormat(metadata.format).toBuffer({ resolveWithObject: true });
    const format = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
    const hash = createHash('sha256').update(data).digest('hex');
    const outputPath = `media/${id}/${hash}.${format}`;
    return { image: { src: `/generated/${outputPath}`, alt: image.alt, width: info.width, height: info.height }, outputPath, data };
  } catch (error) {
    if (error instanceof CatalogError) throw error;
    throw new CatalogError(`${relative}: image cannot be decoded safely`);
  }
}

/** Validate all source records, including hidden records. No files or network are changed. */
export async function validateCatalog(root = process.cwd()) {
  root = path.resolve(root);
  const categories = await readJson(root, 'catalog/categories.json');
  schemaCheck(categoryValidator, categories, 'categories');
  assert(new Set(categories.map(({ id }) => id)).size === categories.length, 'category IDs must be unique');
  const categoryIds = new Set(categories.map(({ id }) => id));
  await noSymlinks(root, 'catalog/projects');
  const entries = await fs.readdir(path.join(root, 'catalog/projects'), { withFileTypes: true });
  const projects = [];
  const media = new Map();
  const ids = new Set();
  let hiddenCount = 0;
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    assert(entry.isFile() && entry.name.endsWith('.json'), 'catalog/projects must contain only regular JSON files');
    const record = validateRecord(await readJson(root, `catalog/projects/${entry.name}`));
    const { project, publication } = record;
    assert(!ids.has(project.id), `duplicate project ID: ${project.id}`);
    ids.add(project.id);
    assert(entry.name === `${project.id}.json`, 'catalog filename must match project.id');
    assert(categoryIds.has(project.category), `unknown category for ${project.id}`);
    const thumbnail = record.catalog.thumbnail ? await readImage(root, project.id, record.catalog.thumbnail) : undefined;
    const screenshots = [];
    for (const image of record.catalog.screenshots ?? []) screenshots.push(await readImage(root, project.id, image));
    if (publication.visibility === 'hidden') { hiddenCount += 1; continue; }
    for (const item of [thumbnail, ...screenshots].filter(Boolean)) media.set(item.outputPath, item.data);
    /** @type {{type: 'external' | 'showcase', url?: string}} */
    const launch = { type: record.launch.type };
    if (publication.launchEnabled && launch.type === 'external') launch.url = record.launch.url;
    const links = publishedLinks(record);
    projects.push({
      id: project.id, title: project.title, description: project.description,
      category: project.category, status: project.status, tags: project.tags ?? [],
      featured: record.catalog.featured ?? false, visibility: publication.visibility,
      launch, launchEnabled: publication.launchEnabled,
      ...(links ? { links } : {}),
      ...(thumbnail ? { thumbnail: thumbnail.image } : {}),
      screenshots: screenshots.map(({ image }) => image),
    });
  }
  return { catalog: { schemaVersion: 1, categories, projects }, media, sourceCount: ids.size, hiddenCount };
}

/** Generated directories are reserved output, removed only after all source validation succeeds. */
export async function generateCatalog(root = process.cwd()) {
  root = path.resolve(root);
  const result = await validateCatalog(root);
  for (const relative of ['src/data/generated', 'public/generated']) {
    await noSymlinks(root, relative, { allowMissing: true });
  }
  for (const relative of ['src/data/generated', 'public/generated']) {
    const target = path.resolve(root, relative);
    assert(target.startsWith(`${root}${path.sep}`), 'generated directory must stay inside repository');
    await fs.rm(target, { recursive: true, force: true });
    await fs.mkdir(target, { recursive: true });
  }
  await fs.writeFile(path.join(root, 'src/data/generated/catalog.json'), `${JSON.stringify(result.catalog, null, 2)}\n`, 'utf8');
  for (const [relative, bytes] of result.media) {
    const destination = path.join(root, 'public/generated', relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, bytes);
  }
  return result;
}
