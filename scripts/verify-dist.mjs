import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from './catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

async function walk(directory, relative = '') {
  const result = [];
  for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    assert(!entry.isSymbolicLink(), `配信物にシンボリックリンクを含められません: ${name}`);
    if (entry.isDirectory()) result.push(...await walk(directory, name));
    else {
      assert(entry.isFile(), `配信物は通常ファイルである必要があります: ${name}`);
      result.push(name);
    }
  }
  return result.sort();
}

function stringsIn(value, result = new Set()) {
  if (typeof value === 'string') result.add(value);
  else if (Array.isArray(value)) value.forEach((item) => stringsIn(item, result));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => stringsIn(item, result));
  return result;
}

async function verifyDist() {
  const dist = path.join(root, 'dist');
  assert(!(await fs.lstat(dist)).isSymbolicLink(), 'dist自体をシンボリックリンクにできません');
  const files = await walk(dist);
  assert(files.includes('index.html'), 'dist/index.htmlが必要です');
  assert(files.includes('_headers'), 'dist/_headersが必要です');
  assert(!files.includes('404.html'), 'SPA配信のためトップレベルの404.htmlを生成しないでください');

  const expected = await validateCatalog(root);
  const compiled = JSON.parse(await fs.readFile(path.join(root, 'src/data/generated/catalog.json'), 'utf8'));
  assert.deepEqual(compiled, expected.catalog, '生成カタログが検証済み公開データと一致しません');
  const expectedMedia = new Map([...expected.media].map(([name, bytes]) => [`generated/${name}`, bytes]));
  const actualMedia = files.filter((name) => name.startsWith('generated/'));
  assert.deepEqual(actualMedia, [...expectedMedia.keys()].sort(), '配信画像の過不足、非掲載画像または古い画像があります');

  const deliveredStrings = stringsIn(compiled);
  const activeLaunchUrls = new Set(compiled.projects
    .filter((project) => project.launchEnabled && project.launch.type === 'external')
    .map((project) => project.launch.url));
  const forbiddenUrls = new Set();
  const hiddenText = new Set();
  for (const name of await fs.readdir(path.join(root, 'catalog/projects'))) {
    const record = JSON.parse(await fs.readFile(path.join(root, 'catalog/projects', name), 'utf8'));
    if (record.publication.visibility === 'hidden') {
      // Test whole content strings; generic IDs such as "hidden" can legitimately occur in application logic.
      for (const value of [record.project.title, record.project.description]) {
        if (!deliveredStrings.has(value)) hiddenText.add(value);
      }
    }
    if (record.launch.url && (record.publication.visibility === 'hidden' || !record.publication.launchEnabled)) {
      if (!activeLaunchUrls.has(record.launch.url)) forbiddenUrls.add(record.launch.url);
    }
  }

  let javascriptFiles = 0;
  for (const name of files) {
    const permitted = name === 'index.html' || name === '_headers'
      || /^assets\/[^/]+\.(?:js|css)$/.test(name) || expectedMedia.has(name);
    assert(permitted, `許可していない配信ファイルです: ${name}`);
    const bytes = await fs.readFile(path.join(dist, name));
    if (expectedMedia.has(name)) {
      assert(bytes.equals(expectedMedia.get(name)), `画像が検証済みの内容と一致しません: ${name}`);
      continue;
    }
    const text = bytes.toString('utf8');
    assert(!/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(text), `秘密鍵形式の内容が含まれています: ${name}`);
    assert(!/[#@]\s*sourceMappingURL\s*=/.test(text), `配信物にソースマップ参照があります: ${name}`);
    for (const value of forbiddenUrls) {
      assert(!text.includes(value) && !text.includes(JSON.stringify(value)), `停止中または非掲載の起動URLが配信物に含まれています: ${name}`);
    }
    for (const value of hiddenText) {
      assert(!text.includes(JSON.stringify(value)), `非掲載作品の本文が配信物に含まれています: ${name}`);
    }
    if (name.endsWith('.js')) javascriptFiles += 1;
  }
  assert(javascriptFiles > 0, 'アプリのJavaScript成果物がありません');
  const sourceHeaders = await fs.readFile(path.join(root, 'public/_headers'));
  assert((await fs.readFile(path.join(dist, '_headers'))).equals(sourceHeaders), '_headersが配信成果物へ正しくコピーされていません');
  console.log(`配信物検証成功: ${compiled.projects.length}作品、${actualMedia.length}画像、${files.length}ファイル`);
}

verifyDist().catch((error) => {
  console.error(`配信物検証失敗: ${error.message}`);
  process.exitCode = 1;
});
