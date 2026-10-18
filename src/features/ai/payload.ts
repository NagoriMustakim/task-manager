/**
 * Helpers that make user content safe to place in a prompt. Task titles, notes and any imported
 * text are UNTRUSTED: they are sanitised, length-capped, JSON-encoded with angle brackets escaped
 * (so they can never close the wrapper tag), and the system prompt tells the model to treat the
 * wrapped block purely as data.
 */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/g;

export function clean(text: string | null | undefined, max: number): string {
  if (!text) return "";
  const t = text.normalize("NFKC").replace(CONTROL, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** JSON with `<`, `>` and `&` escaped so wrapped data cannot contain a closing tag. */
export function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

export const wrapData = (tag: "task_data" | "metrics" | "user_text", value: unknown) => `<${tag}>\n${safeJson(value)}\n</${tag}>`;

/** Maps real ids to short aliases ("t1") and back; the model never sees or invents real ids. */
export class Aliaser {
  private byAlias = new Map<string, string>();
  private byId = new Map<string, string>();
  constructor(private prefix = "t") {}
  alias(id: string): string {
    let a = this.byId.get(id);
    if (!a) {
      a = `${this.prefix}${this.byId.size + 1}`;
      this.byId.set(id, a);
      this.byAlias.set(a, id);
    }
    return a;
  }
  resolve(alias: string): string | undefined {
    return this.byAlias.get(alias.trim());
  }
  has(alias: string) {
    return this.byAlias.has(alias.trim());
  }
}
