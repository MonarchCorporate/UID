#!/usr/bin/env python3
"""Generate the MariaDB/MySQL schema and the TypeScript table metadata
from the Postgres catalog export in db/pg/*.json.

  python3 db/tools/gen_schema.py

Outputs:
  db/mysql/schema.sql          – DDL (CREATE TABLE ... IF NOT EXISTS)
  src/lib/db/schema.gen.ts     – column kinds, defaults, PKs, FKs, uniques
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PG = os.path.join(ROOT, "db", "pg")
schema = json.load(open(os.path.join(PG, "schema.json")))
enums = json.load(open(os.path.join(PG, "enums.json")))

AUTH_USERS = "auth_users"

# Partial / expression unique indexes that MariaDB cannot express directly.
# Each becomes a VIRTUAL generated column with a UNIQUE index on it.
GENERATED_UNIQUES = {
    "discord_activity_events": [
        ("uq_reaction_event",
         "CASE WHEN event_type = 'reaction' THEN CONCAT_WS('|', discord_user_id, "
         "JSON_UNQUOTE(JSON_EXTRACT(meta, '$.message_id')), JSON_UNQUOTE(JSON_EXTRACT(meta, '$.emoji'))) END"),
    ],
    "orgs": [
        ("uq_rsi_sid_upper", "UPPER(rsi_sid)"),
    ],
    "profiles": [
        ("uq_rsi_handle_verified",
         "CASE WHEN rsi_verified_at IS NOT NULL AND rsi_handle IS NOT NULL THEN LOWER(rsi_handle) END"),
    ],
    "ship_loadout_templates": [
        ("uq_admin_template", "CASE WHEN scope = 'admin' THEN ship_slug END"),
    ],
}
# Partial uniques on columns that carry cascading foreign keys: MariaDB does
# not allow generated columns over those, so the data layer enforces them.
APP_UNIQUES = {
    "discord_role_mappings": [{"cols": ["org_id"], "where": {"is_lead": [True]}, "message": "discord_role_mappings_one_lead_per_org"}],
    "marketplace_claims": [{"cols": ["listing_id"], "where": {"status": ["angenommen", "in_lieferung", "geliefert"]}, "message": "marketplace_claims_one_active"}],
    "ship_loadout_templates": [{"cols": ["user_id", "ship_slug"], "where": {"scope": ["user"]}, "message": "slt_user_unique"}],
}
# Indexes replaced by the generated columns above (or not expressible at all).
SKIP_INDEXES = {
    "uniq_reaction_event", "discord_role_mappings_one_lead_per_org",
    "marketplace_claims_one_active", "orgs_rsi_sid_unique",
    "profiles_rsi_handle_verified_key", "slt_admin_unique", "slt_user_unique",
    "inventory_item_catalog_name_trgm", "ship_components_name_trgm",
}


def cols_of(expr):
    return [c.strip().strip('"') for c in expr.split(",")]


def parse_index(defn):
    m = re.match(r"CREATE (UNIQUE )?INDEX (\S+) ON public\.(\S+) USING (\w+) \((.*?)\)( WHERE .*)?$", defn)
    if not m:
        raise ValueError(defn)
    unique, name, table, method, cols, where = m.groups()
    cols = re.sub(r"(lower|upper)\((\w+)\)", r"\2", cols)
    cols = [re.sub(r"\s+(DESC|ASC)(\s+NULLS (FIRST|LAST))?$", "", c) for c in cols_of(cols)]
    return dict(unique=bool(unique), name=name, table=table, cols=cols, where=where)


indexed = {}  # table -> set(columns used in keys)
tables = {}
for t, v in schema.items():
    pk, uniques, fks, idx = [], [], [], []
    for ctype, cname, cdef in v["cons"] or []:
        if ctype == "p":
            pk = cols_of(re.search(r"\((.*)\)", cdef).group(1))
        elif ctype == "u":
            uniques.append((cname, cols_of(re.search(r"\((.*)\)", cdef).group(1))))
        elif ctype == "f":
            m = re.match(r"FOREIGN KEY \((.*?)\) REFERENCES (\S+)\((.*?)\)(.*)", cdef)
            cols, ref, refcols, rest = m.groups()
            ref = AUTH_USERS if ref == "auth.users" else ref
            action = ""
            am = re.search(r"ON DELETE (CASCADE|SET NULL|RESTRICT)", rest)
            if am:
                action = am.group(1)
            fks.append(dict(name=cname, cols=cols_of(cols), ref=ref, refcols=cols_of(refcols), onDelete=action))
    for d in v["idx"] or []:
        i = parse_index(d)
        if i["name"] in SKIP_INDEXES:
            continue
        idx.append(i)
    keyset = set(pk)
    for _, c in uniques:
        keyset |= set(c)
    for f in fks:
        keyset |= set(f["cols"])
    for i in idx:
        keyset |= set(i["cols"])
    indexed[t] = keyset
    tables[t] = dict(pk=pk, uniques=uniques, fks=fks, idx=idx, cols=v["cols"])

# referenced columns must be indexed with compatible types
for t, d in tables.items():
    for f in d["fks"]:
        if f["ref"] in indexed:
            indexed[f["ref"]] |= set(f["refcols"])


def kind_of(pgtype):
    if pgtype == "uuid":
        return "uuid"
    if pgtype == "text":
        return "text"
    if pgtype == "jsonb":
        return "json"
    if pgtype.endswith("[]"):
        return "array"
    if pgtype == "boolean":
        return "bool"
    if pgtype in ("integer", "smallint"):
        return "int"
    if pgtype == "bigint":
        return "bigint"
    if pgtype.startswith("numeric"):
        return "num"
    if pgtype == "timestamp with time zone":
        return "ts"
    if pgtype in enums:
        return "enum"
    raise ValueError(pgtype)


def sql_type(t, col, pgtype):
    k = kind_of(pgtype)
    if k == "uuid":
        return "CHAR(36)"
    if k == "text":
        return "VARCHAR(255)" if col in indexed[t] else "LONGTEXT"
    if k in ("json", "array"):
        return "LONGTEXT"
    if k == "bool":
        return "TINYINT(1)"
    if k == "int":
        return "INT" if pgtype == "integer" else "SMALLINT"
    if k == "bigint":
        return "BIGINT"
    if k == "num":
        m = re.match(r"numeric\((\d+),(\d+)\)", pgtype)
        return f"DECIMAL({m.group(1)},{m.group(2)})" if m else "DECIMAL(30,8)"
    if k == "ts":
        return "DATETIME(6)"
    if k == "enum":
        return "ENUM(" + ",".join("'" + e.replace("'", "''") + "'" for e in enums[pgtype]) + ")"


def default_of(pgdefault, kind):
    """-> (sql_default or None, ts_default or None)"""
    if pgdefault is None:
        return None, None
    if pgdefault == "now()":
        return "CURRENT_TIMESTAMP(6)", {"fn": "now"}
    if pgdefault == "gen_random_uuid()":
        return None, {"fn": "uuid"}
    if pgdefault == "auth.uid()":
        return None, {"fn": "uid"}
    if pgdefault.startswith("encode(gen_random_bytes(12)"):
        return None, {"fn": "hex12"}
    if pgdefault in ("true", "false"):
        v = pgdefault == "true"
        return ("1" if v else "0"), {"value": v}
    if re.fullmatch(r"-?\d+(\.\d+)?", pgdefault):
        return pgdefault, {"value": float(pgdefault) if "." in pgdefault else int(pgdefault)}
    m = re.fullmatch(r"'(.*)'::(\w+(\[\])?)", pgdefault, re.S)
    if m:
        raw, typ = m.group(1).replace("''", "'"), m.group(2)
        if typ == "jsonb":
            return "'" + raw.replace("'", "''") + "'", {"value": json.loads(raw)}
        if typ.endswith("[]"):
            assert raw == "{}"
            return "'[]'", {"value": []}
        return "'" + raw.replace("'", "''") + "'", {"value": raw}
    raise ValueError(pgdefault)


UPDATED_AT_TRIGGERS = set()
for t in tables:
    pass

out = [
    "-- Generated by db/tools/gen_schema.py — do not edit by hand.",
    "SET FOREIGN_KEY_CHECKS = 0;",
    "",
    f"""CREATE TABLE IF NOT EXISTS `{AUTH_USERS}` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(255) NULL,
  `encrypted_password` VARCHAR(255) NULL,
  `raw_user_meta_data` LONGTEXT NOT NULL DEFAULT '{{}}',
  `raw_app_meta_data` LONGTEXT NOT NULL DEFAULT '{{}}',
  `email_confirmed_at` DATETIME(6) NULL,
  `last_sign_in_at` DATETIME(6) NULL,
  `banned_until` DATETIME(6) NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `auth_users_email_key` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;""",
    "",
    """CREATE TABLE IF NOT EXISTS `storage_objects` (
  `id` CHAR(36) NOT NULL,
  `bucket_id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(512) NOT NULL,
  `owner` CHAR(36) NULL,
  `content_type` VARCHAR(255) NULL,
  `size` BIGINT NOT NULL DEFAULT 0,
  `cache_control` VARCHAR(255) NULL,
  `content` LONGBLOB NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `storage_objects_bucket_name` (`bucket_id`, `name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;""",
    "",
    """CREATE TABLE IF NOT EXISTS `auth_tokens` (
  `token_hash` CHAR(64) NOT NULL,
  `kind` VARCHAR(16) NOT NULL,
  `user_id` CHAR(36) NOT NULL,
  `expires_at` DATETIME(6) NOT NULL,
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`token_hash`),
  KEY `auth_tokens_user` (`user_id`),
  CONSTRAINT `auth_tokens_user_fkey` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;""",
    "",
    """CREATE TABLE IF NOT EXISTS `app_jobs` (
  `name` VARCHAR(100) NOT NULL,
  `last_run_at` DATETIME(6) NULL,
  `last_status` VARCHAR(255) NULL,
  `locked_until` DATETIME(6) NULL,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;""",
    "",
]

meta = {}
for t in sorted(tables):
    d = tables[t]
    lines = []
    cmeta = {}
    for name, pgtype, notnull, pgdefault, _gen in d["cols"]:
        kind = kind_of(pgtype)
        st = sql_type(t, name, pgtype)
        sqldef, tsdef = default_of(pgdefault, kind)
        line = f"  `{name}` {st} {'NOT NULL' if notnull else 'NULL'}"
        if sqldef is not None:
            line += f" DEFAULT {sqldef}"
        if name == "updated_at" and kind == "ts":
            line += " ON UPDATE CURRENT_TIMESTAMP(6)"
        lines.append(line)
        c = {"kind": kind, "nullable": not notnull}
        if kind == "enum":
            c["enum"] = pgtype
        if kind == "array":
            c["elem"] = pgtype[:-2]
        if tsdef is not None:
            c["default"] = tsdef
        cmeta[name] = c
    for gname, gexpr in GENERATED_UNIQUES.get(t, []):
        lines.append(f"  `{gname}` VARCHAR(255) AS ({gexpr}) VIRTUAL")
    if d["pk"]:
        lines.append("  PRIMARY KEY (" + ", ".join(f"`{c}`" for c in d["pk"]) + ")")
    for cname, cols in d["uniques"]:
        lines.append(f"  UNIQUE KEY `{cname}` (" + ", ".join(f"`{c}`" for c in cols) + ")")
    for i in d["idx"]:
        kw = "UNIQUE KEY" if i["unique"] else "KEY"
        lines.append(f"  {kw} `{i['name']}` (" + ", ".join(f"`{c}`" for c in i["cols"]) + ")")
    for gname, _ in GENERATED_UNIQUES.get(t, []):
        lines.append(f"  UNIQUE KEY `{gname}` (`{gname}`)")
    notnull_cols = {c[0] for c in d["cols"] if c[2]}
    for f in d["fks"]:
        on_delete = f["onDelete"]
        # Postgres accepts SET NULL on NOT NULL columns (and then fails at
        # delete time); MariaDB rejects it. RESTRICT is the equivalent.
        if on_delete == "SET NULL" and any(c in notnull_cols for c in f["cols"]):
            on_delete = "RESTRICT"
        act = f" ON DELETE {on_delete}" if on_delete else ""
        lines.append(
            f"  CONSTRAINT `{f['name']}` FOREIGN KEY (" + ", ".join(f"`{c}`" for c in f["cols"]) + ") "
            f"REFERENCES `{f['ref']}` (" + ", ".join(f"`{c}`" for c in f["refcols"]) + f"){act}")
    out.append(f"CREATE TABLE IF NOT EXISTS `{t}` (\n" + ",\n".join(lines) +
               "\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;\n")
    uniques = [cols for _, cols in d["uniques"]] + [i["cols"] for i in d["idx"] if i["unique"]]
    if d["pk"]:
        uniques.insert(0, d["pk"])
    meta[t] = {
        "pk": d["pk"],
        "columns": cmeta,
        "uniques": uniques,
        "appUniques": APP_UNIQUES.get(t, []),
        "fks": [{"name": f["name"], "cols": f["cols"], "ref": f["ref"], "refcols": f["refcols"]} for f in d["fks"]],
    }

out.append("SET FOREIGN_KEY_CHECKS = 1;")
os.makedirs(os.path.join(ROOT, "db", "mysql"), exist_ok=True)
open(os.path.join(ROOT, "db", "mysql", "schema.sql"), "w").write("\n".join(out) + "\n")

meta[AUTH_USERS] = {
    "pk": ["id"],
    "columns": {
        "id": {"kind": "uuid", "nullable": False, "default": {"fn": "uuid"}},
        "email": {"kind": "text", "nullable": True},
        "encrypted_password": {"kind": "text", "nullable": True},
        "raw_user_meta_data": {"kind": "json", "nullable": False, "default": {"value": {}}},
        "raw_app_meta_data": {"kind": "json", "nullable": False, "default": {"value": {}}},
        "email_confirmed_at": {"kind": "ts", "nullable": True},
        "last_sign_in_at": {"kind": "ts", "nullable": True},
        "banned_until": {"kind": "ts", "nullable": True},
        "created_at": {"kind": "ts", "nullable": False, "default": {"fn": "now"}},
        "updated_at": {"kind": "ts", "nullable": False, "default": {"fn": "now"}},
    },
    "uniques": [["id"], ["email"]],
    "appUniques": [],
    "fks": [],
}

ts = [
    "// Generated by db/tools/gen_schema.py — do not edit by hand.",
    "import type { TableMeta } from \"./types\";",
    "",
    "export const ENUMS: Record<string, string[]> = " + json.dumps(enums, indent=2) + ";",
    "",
    "export const TABLES: Record<string, TableMeta> = " + json.dumps(meta, indent=2, sort_keys=True) + ";",
    "",
]
os.makedirs(os.path.join(ROOT, "src", "lib", "db"), exist_ok=True)
open(os.path.join(ROOT, "src", "lib", "db", "schema.gen.ts"), "w").write("\n".join(ts))
print("tables:", len(meta))
