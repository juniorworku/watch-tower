import { Marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { buildLinkIndex, noteHref, resolveWikilink, slugifyHeading, type LinkIndex } from "./vault/links";
import type { Note } from "./vault/types";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const marked = new Marked({ gfm: true, breaks: false });
marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const plain = text.replace(/<[^>]+>/g, "");
      return `<h${depth} id="${slugifyHeading(plain)}">${text}</h${depth}>\n`;
    },
  },
});

/**
 * Replace Obsidian [[wikilinks]] (outside code) with in-app links.
 * [[Target]], [[Target|Alias]], [[Target#Heading|Alias]], ![[embed]] (shown as a link).
 */
export function resolveWikilinks(md: string, idx: LinkIndex): string {
  const parts = md.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part; // code
      return part.replace(/!?\[\[([^\]|#]*)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_m, target: string, heading: string | undefined, alias: string | undefined) => {
        const label = (alias || (target ? target + (heading ? " › " + heading.slice(1) : "") : heading?.slice(1)) || "").trim();
        const note = target ? resolveWikilink(idx, target) : undefined;
        if (!note) {
          return `<span class="wikilink-missing" title="Not in vault: ${escapeHtml(target)}">${escapeHtml(label)}</span>`;
        }
        const hash = heading ? "#" + slugifyHeading(heading.slice(1)) : "";
        return `<a class="wikilink" href="${noteHref(note.path)}${hash}">${escapeHtml(label)}</a>`;
      });
    })
    .join("");
}

export function renderMarkdown(md: string, notesOrIndex: Note[] | LinkIndex): string {
  const idx = Array.isArray(notesOrIndex) ? buildLinkIndex(notesOrIndex) : notesOrIndex;
  const cleaned = md.replace(/%%[\s\S]*?%%/g, ""); // Obsidian comments
  const html = marked.parse(resolveWikilinks(cleaned, idx), { async: false }) as string;
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["h1", "h2", "img", "del", "input", "span"]),
    allowedAttributes: {
      a: ["href", "class", "title", "target", "rel"],
      span: ["class", "title"],
      img: ["src", "alt"],
      input: ["type", "checked", "disabled"],
      code: ["class"],
      h1: ["id"], h2: ["id"], h3: ["id"], h4: ["id"], h5: ["id"], h6: ["id"],
      th: ["align"], td: ["align"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName, attribs) => {
        const href = attribs.href || "";
        if (/^https?:/i.test(href)) return { tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" } };
        return { tagName, attribs };
      },
    },
    allowedSchemesAppliedToAttributes: ["href", "src"],
  });
}
