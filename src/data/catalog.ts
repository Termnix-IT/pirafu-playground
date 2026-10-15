import generated from './generated/catalog.json'
import type { Catalog } from '../features/catalog/types'

// The build pipeline validates and projects the source records before this boundary.
// Provider settings, hidden projects and disabled launch URLs never enter generated data.
export const catalog = generated as Catalog
