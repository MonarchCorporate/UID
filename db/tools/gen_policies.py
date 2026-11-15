#!/usr/bin/env python3
"""Translate the Postgres row-level-security policies (db/pg/policies.json)
into MySQL boolean expressions used by the data layer.

  python3 db/tools/gen_policies.py   ->  src/lib/db/policies.gen.ts

Each policy expression is rewritten so that it can be appended to a WHERE
clause of a query on the policy's table:
  * auth.uid()                 -> {{uid}}   (replaced at runtime by a literal)
  * unqualified outer columns  -> `table`.`col`
  * helper functions (has_role, is_org_member, ...) are inlined as EXISTS
    sub-queries (they were SECURITY DEFINER in Postgres, i.e. no nested RLS)
  * ::casts removed, = ANY(ARRAY[..]) -> IN (..), <> ALL(ARRAY[..]) -> NOT IN (..)
  * array_length(col, 1)       -> JSON_LENGTH(col)
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
policies = json.load(open(os.path.join(ROOT, "db", "pg", "policies.json")))
schema = json.load(open(os.path.join(ROOT, "db", "pg", "schema.json")))
columns = {t: {c[0] for c in v["cols"]} for t, v in schema.items()}

FUNCS = {
    "has_role": (["u", "r"], "EXISTS (SELECT 1 FROM user_roles _ur WHERE _ur.user_id = {u} AND _ur.role = {r})"),
    "is_org_member": (["u", "o"], "EXISTS (SELECT 1 FROM org_members _om WHERE _om.org_id = {o} AND _om.user_id = {u})"),
    "has_org_role": (["u", "o", "roles"], "EXISTS (SELECT 1 FROM org_members _om WHERE _om.org_id = {o} AND _om.user_id = {u} AND _om.role IN {roles})"),
    "has_org_perm": (["u", "o", "p"],
                     "(EXISTS (SELECT 1 FROM user_roles _ur WHERE _ur.user_id = {u} AND _ur.role = 'admin') "
                     "OR EXISTS (SELECT 1 FROM org_members _om WHERE _om.org_id = {o} AND _om.user_id = {u} "
                     "AND (_om.role = 'owner' OR JSON_CONTAINS(_om.permissions, JSON_QUOTE({p})))))"),
    "shares_org_with": (["a", "b"], "EXISTS (SELECT 1 FROM org_members _soa JOIN org_members _sob ON _soa.org_id = _sob.org_id WHERE _soa.user_id = {a} AND _sob.user_id = {b})"),
    "is_board_member": (["u", "s"], "EXISTS (SELECT 1 FROM board_members _bm WHERE _bm.session_id = {s} AND _bm.user_id = {u})"),
    "is_mission_participant": (["u", "m"], "EXISTS (SELECT 1 FROM mission_participants _mp WHERE _mp.mission_id = {m} AND _mp.user_id = {u})"),
    "is_farm_list_owner": (["l", "u"], "EXISTS (SELECT 1 FROM farm_lists _fl WHERE _fl.id = {l} AND _fl.owner_id = {u})"),
    "can_access_farm_list": (["l", "u"],
                             "(EXISTS (SELECT 1 FROM farm_lists _fl WHERE _fl.id = {l} AND _fl.owner_id = {u}) "
                             "OR EXISTS (SELECT 1 FROM farm_list_members _flm WHERE _flm.list_id = {l} AND _flm.user_id = {u} AND _flm.status = 'accepted'))"),
    "can_edit_farm_list": (["l", "u"],
                           "(EXISTS (SELECT 1 FROM farm_lists _fl WHERE _fl.id = {l} AND _fl.owner_id = {u}) "
                           "OR EXISTS (SELECT 1 FROM farm_list_members _flm WHERE _flm.list_id = {l} AND _flm.user_id = {u} AND _flm.role = 'editor' AND _flm.status = 'accepted'))"),
    "can_write_loadout_template": (["t"],
                                   "EXISTS (SELECT 1 FROM ship_loadout_templates _slt WHERE _slt.id = {t} AND ((_slt.scope = 'admin' AND "
                                   "EXISTS (SELECT 1 FROM user_roles _ur WHERE _ur.user_id = {{uid}} AND _ur.role = 'admin')) "
                                   "OR (_slt.scope = 'user' AND _slt.user_id = {{uid}})))"),
}

TOKEN_RE = re.compile(r"""
    (?P<str>'(?:[^']|'')*')
  | (?P<num>\d+(?:\.\d+)?)
  | (?P<cast>::[a-z_]+(?:\[\])?)
  | (?P<id>[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?(?:\(\))?)
  | (?P<op><>|<=|>=|!=|[=<>(),\[\]*])
  | (?P<ws>\s+)
""", re.X)

KEYWORDS = {"AND", "OR", "NOT", "EXISTS", "SELECT", "FROM", "WHERE", "JOIN", "ON", "IS", "NULL", "TRUE",
            "FALSE", "true", "false", "IN", "ANY", "ALL", "ARRAY", "COALESCE", "AS", "LIMIT"}


def tokenize(s):
    out, pos = [], 0
    while pos < len(s):
        m = TOKEN_RE.match(s, pos)
        if not m:
            raise ValueError(f"cannot tokenize at {s[pos:pos+30]!r}")
        pos = m.end()
        kind = m.lastgroup
        if kind == "ws":
            continue
        out.append((kind, m.group()))
    return out


def translate(expr, table):
    if expr is None:
        return None
    toks = [t for t in tokenize(expr) if t[0] != "cast"]
    # 1) qualify outer-scope identifiers; track SELECT sub-query scopes
    res = []
    depth = 0
    sub_depths = []  # paren depth at which a sub-query started
    for i, (k, v) in enumerate(toks):
        if k == "op" and v == "(":
            depth += 1
        elif k == "op" and v == ")":
            if sub_depths and sub_depths[-1] == depth:
                sub_depths.pop()
            depth -= 1
        if k == "id" and v.upper() == "SELECT":
            sub_depths.append(depth)
        if k == "id" and v == "auth.uid()":
            res.append(("raw", "{{uid}}"))
            continue
        if (k == "id" and not sub_depths and "." not in v and v.upper() not in KEYWORDS
                and not (i + 1 < len(toks) and toks[i + 1] == ("op", "("))
                and v in columns[table]):
            res.append(("raw", f"`{table}`.`{v}`"))
            continue
        res.append((k, v))
    # 2) rebuild string, convert ARRAY / ANY / ALL / array_length
    s = " ".join(v for _, v in res)
    s = re.sub(r"\(\s*\(\s*", "((", s)
    s = re.sub(r"ARRAY \[ (.*?) \]", lambda m: "(" + m.group(1).replace(" ,", ",") + ")", s)
    s = re.sub(r"= ANY \( (\(.*?\)) \)", r"IN \1", s)
    s = re.sub(r"<> ALL \( (\(.*?\)) \)", r"NOT IN \1", s)
    s = re.sub(r"array_length \( (\S+) , 1 \)", r"JSON_LENGTH(\1)", s)
    s = s.replace("true", "TRUE").replace("false", "FALSE")
    # 3) inline helper functions (innermost first)
    for _ in range(10):
        changed = False
        for fname, (params, body) in FUNCS.items():
            idx = s.find(fname + " (")
            if idx < 0:
                continue
            start = idx + len(fname) + 2
            # find matching paren, split args at top level
            d, j, args, cur = 1, start, [], ""
            while j < len(s):
                c = s[j]
                if c == "(":
                    d += 1
                elif c == ")":
                    d -= 1
                    if d == 0:
                        break
                if c == "," and d == 1:
                    args.append(cur.strip())
                    cur = ""
                else:
                    cur += c
                j += 1
            args.append(cur.strip())
            assert len(args) == len(params), (fname, args)
            sub = body
            for p, a in zip(params, args):
                sub = sub.replace("{" + p + "}", a)
            s = s[:idx] + "(" + sub + ")" + s[j + 1:]
            changed = True
        if not changed:
            break
    assert not re.search(r"\b(has_role|is_org_member|has_org_role|has_org_perm|shares_org_with|is_board_member|is_mission_participant|farm_list|can_write)\w* \(", s), s
    return s


out = {}
for p in policies:
    t = p["table"]
    out.setdefault(t, []).append({
        "name": p["name"],
        "cmd": p["cmd"],
        "roles": p["roles"],
        "permissive": p["permissive"] == "PERMISSIVE",
        "using": translate(p["using"], t),
        "check": translate(p["check"], t),
    })

ts = [
    "// Generated by db/tools/gen_policies.py — do not edit by hand.",
    "// Row-level-security policies translated from Postgres. `{{uid}}` is",
    "// replaced by the current user id literal (or NULL) at query time.",
    "import type { Policy } from \"./types\";",
    "",
    "export const POLICIES: Record<string, Policy[]> = " + json.dumps(out, indent=2, ensure_ascii=False) + ";",
    "",
]
open(os.path.join(ROOT, "src", "lib", "db", "policies.gen.ts"), "w").write("\n".join(ts))
print("tables with policies:", len(out), "policies:", sum(len(v) for v in out.values()))
