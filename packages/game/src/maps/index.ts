/**
 * Mapas desenhados no Blender (gerados por `npm run mapa -- importar <id>`). Um mapa que esteja
 * aqui substitui o desenho feito no código (board.ts). Ver docs/BLENDER-MAPAS.md.
 */
import type { MapLayout } from '../layout';
import { layout as ilhaLayout } from './ilha';

export const LAYOUTS: Record<string, MapLayout> = { 'ilha': ilhaLayout };
