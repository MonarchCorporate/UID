// Parsers for the small PostgREST dialect supabase-js produces:
//  - select lists:  "id, name, alias:fk_col(a, b), rel(*), rel!hint(x)"
//  - logic trees:   "a.eq.1,and(b.ilike.%x%,c.in.(1,2)),d.not.is.null"

export type SelectItem =
  | { type: "star" }
  | { type: "col"; name: string; alias: string }
  | { type: "embed"; alias: string; rel: string; hint?: string; inner: boolean; children: SelectItem[] };

function splitTop(s: string, sep = ","): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = false;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"' && s[i - 1] !== "\\") quote = !quote;
    if (!quote) {
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === sep && depth === 0) {
        out.push(cur);
        cur = "";
        continue;
      }
    }
    cur += c;
  }
  if (cur.length) out.push(cur);
  return out;
}

export function parseSelect(input: string | undefined | null): SelectItem[] {
  const s = (input ?? "*").replace(/\s+/g, "");
  if (!s) return [{ type: "star" }];
  return splitTop(s).map((part): SelectItem => {
    if (part === "*") return { type: "star" };
    const paren = part.indexOf("(");
    if (paren >= 0 && part.endsWith(")")) {
      let head = part.slice(0, paren);
      const inner = part.slice(paren + 1, -1);
      let alias = "";
      const colon = head.indexOf(":");
      if (colon >= 0) {
        alias = head.slice(0, colon);
        head = head.slice(colon + 1);
      }
      const [rel, ...mods] = head.split("!");
      let hint: string | undefined;
      let innerJoin = false;
      for (const m of mods) {
        if (m === "inner") innerJoin = true;
        else if (m === "left") innerJoin = false;
        else hint = m;
      }
      return {
        type: "embed",
        alias: alias || rel,
        rel,
        hint,
        inner: innerJoin,
        children: parseSelect(inner || "*"),
      };
    }
    let name = part;
    let alias = "";
    const colon = name.indexOf(":");
    if (colon >= 0 && name[colon + 1] !== ":") {
      alias = name.slice(0, colon);
      name = name.slice(colon + 1);
    }
    name = name.split("::")[0];
    return { type: "col", name, alias: alias || name };
  });
}

export type Cond =
  | { type: "cond"; col: string; op: string; value: unknown; not: boolean }
  | { type: "and" | "or"; items: Cond[]; not: boolean }
  | { type: "raw"; sql: string; params: unknown[] };

function unquote(v: string): string {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\"/g, '"');
  return v;
}

/** Parses the value part of an "in" filter: "(a,b,"c,d")" -> ["a","b","c,d"] */
export function parseInList(v: string): string[] {
  let s = v.trim();
  if (s.startsWith("(") && s.endsWith(")")) s = s.slice(1, -1);
  if (!s) return [];
  return splitTop(s).map((x) => unquote(x.trim()));
}

function parseCondition(expr: string): Cond {
  // and(...) / or(...) / not.and(...)
  const m = expr.match(/^(not\.)?(and|or)\((.*)\)$/s);
  if (m) {
    return { type: m[2] as "and" | "or", not: !!m[1], items: parseLogicTree(m[3]) };
  }
  const firstDot = expr.indexOf(".");
  if (firstDot < 0) throw new Error(`failed to parse logic tree (${expr})`);
  const col = expr.slice(0, firstDot);
  let rest = expr.slice(firstDot + 1);
  let not = false;
  if (rest.startsWith("not.")) {
    not = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf(".");
  const op = dot < 0 ? rest : rest.slice(0, dot);
  const raw = dot < 0 ? "" : rest.slice(dot + 1);
  let value: unknown = raw;
  if (op === "in") value = parseInList(raw);
  else value = unquote(raw);
  return { type: "cond", col, op, value, not };
}

export function parseLogicTree(s: string): Cond[] {
  return splitTop(s.trim()).filter((x) => x.trim()).map((x) => parseCondition(x.trim()));
}
