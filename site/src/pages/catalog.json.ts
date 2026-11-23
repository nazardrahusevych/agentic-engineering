import type { APIRoute } from 'astro';
import { getCatalog } from '../lib/catalog-data.ts';

export const prerender = true;

export const GET: APIRoute = () =>
  new Response(getCatalog().catalogJson, { headers: { 'Content-Type': 'application/json' } });
