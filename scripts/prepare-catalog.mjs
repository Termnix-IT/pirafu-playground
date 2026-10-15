import { CatalogError, generateCatalog } from './catalog.mjs';

try {
  const result = await generateCatalog();
  console.log(`Catalog prepared: ${result.catalog.projects.length} publishable records, ${result.media.size} images.`);
} catch (error) {
  console.error(error instanceof CatalogError ? error.message : 'Catalog generation failed (file access or processing error).');
  process.exitCode = 1;
}
