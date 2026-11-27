import type { FooterBadge } from './types';
import { validateFooterBadges } from './validation';

const ANCHOR_ATTRIBUTES = new Set(['href', 'target', 'rel']);
const IMAGE_ATTRIBUTES = new Set(['src', 'alt', 'width', 'height', 'loading']);

function extraAttributes(element: Element, standard: Set<string>) {
  return Object.fromEntries(
    Array.from(element.attributes)
      .filter(({ name }) => !standard.has(name))
      .map(({ name, value }) => [name, value])
  );
}

function hasOnlyWhitespaceText(element: Element) {
  return Array.from(element.childNodes).every(
    (node) => node.nodeType === Node.ELEMENT_NODE || !node.textContent?.trim()
  );
}

/** Extract HTTPS link text or image data without rendering pasted HTML. */
export function parseFooterBadgeMarkup(markup: string): FooterBadge[] {
  if (!markup.trim() || markup.length > 20_000) {
    throw new Error('invalid_markup');
  }

  const doc = new DOMParser().parseFromString(markup, 'text/html');
  const elements = Array.from(doc.body.children);
  if (
    elements.length === 0 ||
    !hasOnlyWhitespaceText(doc.body) ||
    elements.some((element) => element.tagName !== 'A')
  ) {
    throw new Error('invalid_markup');
  }

  return validateFooterBadges(
    elements.map((anchor) => {
      const href = anchor.getAttribute('href') ?? '';
      const target = anchor.getAttribute('target');
      const children = Array.from(anchor.children);
      if (
        (target && target !== '_blank' && target !== '_self') ||
        children.length > 1 ||
        (children.length === 1 && children[0].tagName !== 'IMG')
      ) {
        throw new Error('invalid_markup');
      }
      const image = children[0];
      const text = anchor.textContent?.trim();
      return {
        href,
        text,
        src: image ? (image.getAttribute('src') ?? '') : undefined,
        alt: image ? (image.getAttribute('alt') ?? '') : text?.slice(0, 120),
        rel: anchor.getAttribute('rel'),
        attributes: extraAttributes(anchor, ANCHOR_ATTRIBUTES),
        imageAttributes: image
          ? extraAttributes(image, IMAGE_ATTRIBUTES)
          : undefined,
        width: image?.hasAttribute('width')
          ? Number(image.getAttribute('width'))
          : undefined,
        height: image?.hasAttribute('height')
          ? Number(image.getAttribute('height'))
          : undefined,
      };
    })
  );
}
