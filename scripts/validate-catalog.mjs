import { CatalogError, validateCatalog } from './catalog.mjs';

try {
  const result = await validateCatalog();
  console.log(`Catalog valid: ${result.sourceCount} source records, ${result.hiddenCount} hidden, ${result.media.size} publishable images.`);
} catch (error) {
  console.error(error instanceof CatalogError ? error.message : 'Catalog validation failed (file access or processing error).');
  process.exitCode = 1;
}
