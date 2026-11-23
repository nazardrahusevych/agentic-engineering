import type { Element, ElementContent, Root as HastRoot } from 'hast';
import type { Root as MdastRoot } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { posix } from 'node:path';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

export interface MarkdownContext {
  /** `owner/name` of the GitHub repository. */
  repo: string;
  /** Commit the links point at. */
  commit: string;
  /** Repository-relative directory of the file being rendered (forward slashes, '' for the root). */
  fileDir: string;
}

const SCHEMA: SanitizeSchema = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, href: ['http', 'https'] },
};

const ABSOLUTE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

/** Rendered markdown sits under an h2 section of the detail page, so its headings start at h3. */
const HEADING_SHIFT = 2;

/** Resolves a repository-relative link target to a GitHub URL; returns null when it leaves the repository. */
export function resolveRepoLink(target: string, ctx: MarkdownContext): string | null {
  const [pathPart = '', hash] = target.split('#', 2);
  const [cleanPath = ''] = pathPart.split('?', 1);
  let decoded: string;
  try {
    decoded = decodeURIComponent(cleanPath);
  } catch {
    return null;
  }
  const joined = decoded.startsWith('/') ? decoded.slice(1) : posix.join(ctx.fileDir, decoded);
  const normalized = posix.normalize(joined);
  if (normalized === '..' || normalized.startsWith('../') || posix.isAbsolute(normalized)) return null;
  const encoded = normalized
    .split('/')
    .filter((segment) => segment !== '' && segment !== '.')
    .map(encodeURIComponent)
    .join('/');
  return `https://github.com/${ctx.repo}/blob/${ctx.commit}/${encoded}${hash ? `#${encodeURIComponent(hash)}` : ''}`;
}

/** Turns images into plain links and rewrites repository-relative links to GitHub. */
function rewriteLinksAndImages(ctx: MarkdownContext) {
  const visit = (node: HastRoot | Element): void => {
    node.children = node.children.map((child): ElementContent => {
      if (child.type !== 'element') return child as ElementContent;
      const heading = /^h([1-6])$/.exec(child.tagName);
      if (heading) child.tagName = `h${Math.min(Number(heading[1]) + HEADING_SHIFT, 6)}`;
      if (child.tagName === 'img') {
        const src = typeof child.properties.src === 'string' ? child.properties.src : '';
        const alt = typeof child.properties.alt === 'string' && child.properties.alt !== '' ? child.properties.alt : src;
        const href = rewriteHref(src, ctx);
        return {
          type: 'element',
          tagName: 'a',
          properties: href ? { href } : {},
          children: [{ type: 'text', value: alt || 'image' }],
        };
      }
      if (child.tagName === 'a' && typeof child.properties.href === 'string') {
        const href = rewriteHref(child.properties.href, ctx);
        if (href) child.properties.href = href;
        else delete child.properties.href;
      }
      visit(child);
      return child;
    });
  };
  return () => (tree: HastRoot) => visit(tree);
}

function rewriteHref(href: string, ctx: MarkdownContext): string | null {
  const trimmed = href.trim();
  if (trimmed === '') return null;
  if (trimmed.startsWith('#')) return trimmed;
  if (trimmed.startsWith('//')) return null;
  if (ABSOLUTE.test(trimmed)) return /^https?:/i.test(trimmed) ? trimmed : null;
  return resolveRepoLink(trimmed, ctx);
}

/**
 * Renders untrusted markdown to sanitized HTML: raw HTML is dropped, images become links,
 * links are limited to http(s) and repository-relative targets, external links get noopener.
 */
export function renderMarkdown(markdown: string, ctx: MarkdownContext): string {
  return String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, { allowDangerousHtml: false })
      .use(rewriteLinksAndImages(ctx))
      .use(rehypeSanitize, SCHEMA)
      .use(rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] })
      .use(rehypeStringify)
      .processSync(markdown),
  );
}

/** Plain text of a markdown document, whitespace collapsed (for search and summaries). */
export function markdownToText(markdown: string): string {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(markdown) as MdastRoot;
  const parts: string[] = [];
  const walk = (node: MdastRoot['children'][number] | MdastRoot): void => {
    if (node.type === 'html') return;
    if ('children' in node && node.type !== 'paragraph' && node.type !== 'heading' && node.type !== 'tableCell') {
      for (const child of node.children) walk(child as MdastRoot['children'][number]);
      return;
    }
    parts.push(toString(node));
  };
  walk(tree);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
