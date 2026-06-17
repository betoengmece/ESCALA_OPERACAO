#!/usr/bin/env python3
import json
import os
import hashlib
import sqlite3
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "data" / "operations.db"
STATIC_DIR = ROOT / "static"
SESSION_COOKIE = "operations_session"


def auth_cookie_value(password):
    return hashlib.sha256(f"operations-planner:{password}".encode("utf-8")).hexdigest()

PEOPLE = [
    "ADALBERTO", "OMAR", "BRENO", "ANDRADE", "BOA VENTURA", "PVR1", "PVR2",
    "PM1", "PM2", "PEREIRA", "RICARDO", "CASTIEL", "DOUGLAS", "BRUNO",
    "ANDRE", "CLAUDIO", "HELIO", "MARILUCE", "MARIZETE", "JOEL K9", "JONIO",
    "DANIEL", "RILDO", "HUGO", "FABIO", "JONILSON", "COZER", "OWADA",
    "JOAO", "GILSON", "ANTONIO", "DANILO", "EVER", "LUIS PORTO", "EVILAZIO",
    "GABRIEL"
]

RESOURCES = [
    ("VIATURA STARLINK", 1, "viatura"),
    ("VIATURA BLAZER", 1, "viatura"),
    ("VIATURA L200", 1, "viatura"),
    ("VIATURA CRUZE", 1, "viatura"),
    ("VIATURA DESCARACTERIZADA ESTRADA CHAO", 0, "viatura"),
    ("VIATURA DESCARACTERIZADA PASSEIO", 0, "viatura"),
    ("FITA ABERTO ADUANA", 0, "item"),
    ("RADIOS", 3, "comunicacao"),
    ("VIATURA", 0, "viatura"),
    ("VIATURAS", 0, "viatura"),
    ("IMPRIMIR TERMO MANUAL", 0, "documento"),
    ("TERMO DE LACRACAO VOLUMES_TLV_CORREIOS-TRANSPORTADORAS.doc", 0, "documento"),
    ("FITA ESCRITO ABERTO PELA ADUANA", 0, "item"),
    ("CANIVETE OU ESTILETE", 0, "item"),
    ("CAIXAS", 0, "item"),
    ("CAMISA DESCARACTERIZADA", 0, "vestimenta"),
]

MODELS = [
    {
        "name": "CORREIOS",
        "min_people": 3,
        "recommended_people": 5,
        "general_notes": "Acompanhar caminhão dos Correios e conferir preenchimento das mercadorias apreendidas.",
        "procedure": "Operação nos Correios, com abertura, análise, retenção, lacração e registro fotográfico das encomendas com indícios de irregularidade.",
        "resources": [
            ("TERMO DE LACRACAO VOLUMES_TLV_CORREIOS-TRANSPORTADORAS.doc", "fixed", 2),
            ("FITA ESCRITO ABERTO PELA ADUANA", "per_people_divisor", 2),
            ("CANIVETE OU ESTILETE", "per_people_divisor", 2),
            ("CAIXAS", "fixed", 5),
            ("VIATURA L200", "fixed", 1),
            ("CAMISA DESCARACTERIZADA", "fixed", 1),
        ],
    },
    {
        "name": "PONTE",
        "min_people": 3,
        "recommended_people": 4,
        "general_notes": "Verificar procedimentos para PRF.",
        "procedure": "Abordagem aleatória próximo da PRF/Ponte, com comunicação com a base quando houver internet.",
        "resources": [("IMPRIMIR TERMO MANUAL", "fixed", 2), ("RADIOS", "fixed", 1), ("VIATURA", "fixed", 1)],
    },
    {
        "name": "ZS PRF",
        "min_people": 3,
        "recommended_people": 4,
        "general_notes": "Verificar procedimentos para PRF.",
        "procedure": "Abordagem aleatória na PRF, com apoio da base para escolha de alvos quando possível.",
        "resources": [("IMPRIMIR TERMO MANUAL", "fixed", 2), ("RADIOS", "fixed", 1), ("VIATURA", "fixed", 1)],
    },
    {
        "name": "BAGAGEM",
        "min_people": 1,
        "recommended_people": 7,
        "general_notes": "Verificar alvo SIVANA.",
        "procedure": "Abordagem aleatória em bagagens, com conferência e apoio dos sistemas internos.",
        "resources": [("RADIOS", "fixed", 0), ("VIATURAS", "fixed", 1)],
    },
    {
        "name": "SUPORTE",
        "min_people": 1,
        "recommended_people": 2,
        "general_notes": "Verificar alvo SIVANA.",
        "procedure": "Suporte na escolha de alvos e acesso a sistemas internos para equipes externas.",
        "resources": [("RADIOS", "fixed", 1), ("VIATURA", "fixed", 0)],
    },
    {
        "name": "DESPACHO",
        "min_people": 3,
        "recommended_people": 4,
        "general_notes": "Verificar alvo SIVANA.",
        "procedure": "Abordagem aleatória e fiscalização em despacho.",
        "resources": [("RADIOS", "fixed", 1), ("VIATURA", "per_people_divisor", 4)],
    },
    {
        "name": "DEPOSITO_GUAIRA",
        "min_people": 3,
        "recommended_people": 5,
        "general_notes": "Verificar alvo SIVANA.",
        "procedure": "Fiscalização em depósito com abordagem aleatória.",
        "resources": [("RADIOS", "fixed", 1), ("VIATURA", "per_people_divisor", 4)],
    },
    {
        "name": "DEPOSITO_MUNDO_NOVO",
        "min_people": 3,
        "recommended_people": 5,
        "general_notes": "Verificar alvo SIVANA.",
        "procedure": "Fiscalização em depósito com abordagem aleatória.",
        "resources": [("RADIOS", "fixed", 1), ("VIATURA", "per_people_divisor", 4)],
    },
    {
        "name": "ENTRADA PY",
        "min_people": 2,
        "recommended_people": 7,
        "general_notes": "Verificar alvo SIVANA.",
        "procedure": "Abordagem noturna de veículos, identificação de condutor/proprietário, verificação de rota, dinheiro e registro no SAP.",
        "resources": [("RADIOS", "fixed", 1), ("VIATURA", "fixed", 1)],
    },
    {
        "name": "SHOPEE",
        "min_people": 1,
        "recommended_people": 5,
        "general_notes": "Verificar alvo SIVANA.",
        "procedure": "Apoio operacional e fiscalização relacionada a cargas Shopee.",
        "resources": [("RADIOS", "fixed", 1), ("VIATURA", "fixed", 0)],
    },
]


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    DB_PATH.parent.mkdir(exist_ok=True)
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS people (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                active INTEGER NOT NULL DEFAULT 1,
                groups TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS resources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                quantity INTEGER NOT NULL DEFAULT 0,
                category TEXT NOT NULL DEFAULT 'item',
                notes TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS operation_models (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                min_people INTEGER NOT NULL DEFAULT 1,
                recommended_people INTEGER NOT NULL DEFAULT 1,
                general_notes TEXT NOT NULL DEFAULT '',
                procedure TEXT NOT NULL DEFAULT ''
            );
            CREATE TABLE IF NOT EXISTS model_resources (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_id INTEGER NOT NULL REFERENCES operation_models(id) ON DELETE CASCADE,
                resource_id INTEGER NOT NULL REFERENCES resources(id),
                rule_type TEXT NOT NULL,
                amount INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS operations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_id INTEGER NOT NULL REFERENCES operation_models(id),
                starts_at TEXT NOT NULL,
                ends_at TEXT NOT NULL,
                location TEXT NOT NULL DEFAULT '',
                planned_people INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'planejada',
                justification TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS operation_people (
                operation_id INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
                person_id INTEGER NOT NULL REFERENCES people(id),
                PRIMARY KEY (operation_id, person_id)
            );
            CREATE TABLE IF NOT EXISTS operation_resource_overrides (
                operation_id INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
                resource_id INTEGER NOT NULL REFERENCES resources(id),
                quantity INTEGER NOT NULL,
                PRIMARY KEY (operation_id, resource_id)
            );
            """
        )
        count = db.execute("SELECT COUNT(*) FROM people").fetchone()[0]
        if count:
            return
        for name in PEOPLE:
            group = "Equipe_24x72" if name in {"BRENO", "ANDRADE", "BOA VENTURA", "PEREIRA", "RICARDO", "CASTIEL", "DOUGLAS", "BRUNO"} else ""
            db.execute("INSERT INTO people (name, groups) VALUES (?, ?)", (name, group))
        for name, quantity, category in RESOURCES:
            db.execute("INSERT INTO resources (name, quantity, category) VALUES (?, ?, ?)", (name, quantity, category))
        for model in MODELS:
            cur = db.execute(
                "INSERT INTO operation_models (name, min_people, recommended_people, general_notes, procedure) VALUES (?, ?, ?, ?, ?)",
                (model["name"], model["min_people"], model["recommended_people"], model["general_notes"], model["procedure"]),
            )
            model_id = cur.lastrowid
            for resource_name, rule_type, amount in model["resources"]:
                resource_id = db.execute("SELECT id FROM resources WHERE name = ?", (resource_name,)).fetchone()["id"]
                db.execute(
                    "INSERT INTO model_resources (model_id, resource_id, rule_type, amount) VALUES (?, ?, ?, ?)",
                    (model_id, resource_id, rule_type, amount),
                )
        db.commit()


def row_to_dict(row):
    return dict(row) if row else None


def parse_dt(value):
    return datetime.fromisoformat(value)


def normalize_interval(date_value, start_time, end_time):
    start = datetime.fromisoformat(f"{date_value}T{start_time}")
    end = datetime.fromisoformat(f"{date_value}T{end_time}")
    if end <= start:
        end += timedelta(days=1)
    return start.isoformat(timespec="minutes"), end.isoformat(timespec="minutes")


def overlaps_clause():
    return "starts_at < ? AND ends_at > ?"


def calc_resource(rule_type, amount, people_count):
    if rule_type == "per_people_divisor":
        return (people_count + amount - 1) // amount if amount else 0
    return amount


def get_operation_resources(db, model_id, people_count, operation_id=None):
    rows = db.execute(
        """
        SELECT r.id, r.name, r.quantity AS stock, mr.rule_type, mr.amount
        FROM model_resources mr
        JOIN resources r ON r.id = mr.resource_id
        WHERE mr.model_id = ?
        ORDER BY r.name
        """,
        (model_id,),
    ).fetchall()
    resources = []
    for row in rows:
        resources.append({
            "id": row["id"],
            "name": row["name"],
            "stock": row["stock"],
            "quantity": calc_resource(row["rule_type"], row["amount"], people_count),
            "rule_type": row["rule_type"],
            "amount": row["amount"],
        })
    if operation_id:
        overrides = db.execute(
            "SELECT resource_id, quantity FROM operation_resource_overrides WHERE operation_id = ?",
            (operation_id,),
        ).fetchall()
        override_map = {r["resource_id"]: r["quantity"] for r in overrides}
        for resource in resources:
            if resource["id"] in override_map:
                resource["quantity"] = override_map[resource["id"]]
    return resources


def validate_operation(db, payload, operation_id=None):
    model = db.execute("SELECT * FROM operation_models WHERE id = ?", (payload["model_id"],)).fetchone()
    starts_at = payload["starts_at"]
    ends_at = payload["ends_at"]
    planned_people = int(payload.get("planned_people") or 0)
    people_ids = [int(x) for x in payload.get("people_ids", [])]
    warnings = []

    if planned_people < model["min_people"]:
        warnings.append({
            "type": "min_people",
            "message": f"{model['name']} precisa de no mínimo {model['min_people']} pessoas.",
        })
    if len(people_ids) != planned_people:
        warnings.append({
            "type": "people_count",
            "message": f"Quantidade planejada ({planned_people}) difere da equipe escalada ({len(people_ids)}).",
        })

    for person_id in people_ids:
        params = [person_id, ends_at, starts_at]
        sql = (
            "SELECT o.id, p.name, m.name AS model_name, o.starts_at, o.ends_at "
            "FROM operation_people op "
            "JOIN operations o ON o.id = op.operation_id "
            "JOIN people p ON p.id = op.person_id "
            "JOIN operation_models m ON m.id = o.model_id "
            f"WHERE op.person_id = ? AND o.{overlaps_clause()}"
        )
        if operation_id:
            sql += " AND o.id <> ?"
            params.append(operation_id)
        for row in db.execute(sql, params).fetchall():
            warnings.append({
                "type": "person_conflict",
                "message": f"{row['name']} já está em {row['model_name']} no mesmo intervalo.",
            })
        rest_params = [person_id]
        rest_sql = (
            "SELECT o.id, p.name, m.name AS model_name, o.starts_at, o.ends_at "
            "FROM operation_people op "
            "JOIN operations o ON o.id = op.operation_id "
            "JOIN people p ON p.id = op.person_id "
            "JOIN operation_models m ON m.id = o.model_id "
            "WHERE op.person_id = ?"
        )
        if operation_id:
            rest_sql += " AND o.id <> ?"
            rest_params.append(operation_id)
        current_start = parse_dt(starts_at)
        current_end = parse_dt(ends_at)
        for row in db.execute(rest_sql, rest_params).fetchall():
            other_start = parse_dt(row["starts_at"])
            other_end = parse_dt(row["ends_at"])
            if other_end <= current_start:
                rest_hours = (current_start - other_end).total_seconds() / 3600
            elif current_end <= other_start:
                rest_hours = (other_start - current_end).total_seconds() / 3600
            else:
                continue
            if rest_hours < 12:
                warnings.append({
                    "type": "rest_conflict",
                    "message": f"{row['name']} terá apenas {rest_hours:.1f}h de folga em relação a {row['model_name']}. Mínimo: 12h.",
                })

    resources = payload.get("resources") or get_operation_resources(db, payload["model_id"], planned_people)
    for resource in resources:
        required = int(resource["quantity"])
        if required <= 0:
            continue
        resource_row = db.execute("SELECT name, quantity FROM resources WHERE id = ?", (resource["id"],)).fetchone()
        resource_name = resource.get("name") or resource_row["name"]
        sql = (
            "SELECT o.id, o.planned_people, o.model_id "
            "FROM operations o "
            "WHERE o." + overlaps_clause()
        )
        if operation_id:
            sql += " AND o.id <> ?"
            params_for_ops = [ends_at, starts_at, operation_id]
        else:
            params_for_ops = [ends_at, starts_at]
        used = 0
        for other in db.execute(sql, params_for_ops).fetchall():
            other_resources = get_operation_resources(db, other["model_id"], other["planned_people"], other["id"])
            used += sum(int(r["quantity"]) for r in other_resources if r["id"] == resource["id"])
        stock = resource_row["quantity"]
        if used + required > stock:
            warnings.append({
                "type": "resource_conflict",
                "message": f"Falta {used + required - stock} {resource_name} no intervalo. Estoque: {stock}, já reservado: {used}, necessário: {required}.",
            })
    return warnings


class Handler(SimpleHTTPRequestHandler):
    def is_authenticated(self):
        password = os.environ.get("APP_PASSWORD", "")
        if not password:
            return True
        cookies = self.headers.get("Cookie", "")
        return f"{SESSION_COOKIE}={auth_cookie_value(password)}" in cookies

    def translate_path(self, path):
        parsed = urlparse(path)
        if parsed.path.startswith("/api/"):
            return str(ROOT)
        if parsed.path == "/login.html":
            return str(STATIC_DIR / "login.html")
        rel = parsed.path.lstrip("/") or "index.html"
        return str(STATIC_DIR / rel)

    def do_HEAD(self):
        return self.do_GET()

    def send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def redirect_login(self):
        self.send_response(302)
        self.send_header("Location", "/login.html")
        self.end_headers()

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path != "/login.html" and not parsed.path.startswith("/api/") and not self.is_authenticated():
            return self.redirect_login()
        if not parsed.path.startswith("/api/"):
            return super().do_GET()
        if parsed.path != "/api/login" and not self.is_authenticated():
            return self.send_json({"error": "Não autorizado."}, 401)
        try:
            with connect() as db:
                self.route_get(db, parsed)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/login":
            return self.handle_login(self.read_json())
        if not self.is_authenticated():
            return self.send_json({"error": "Não autorizado."}, 401)
        try:
            with connect() as db:
                self.route_post(db, parsed, self.read_json())
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def do_PUT(self):
        parsed = urlparse(self.path)
        if not self.is_authenticated():
            return self.send_json({"error": "Não autorizado."}, 401)
        try:
            with connect() as db:
                self.route_put(db, parsed, self.read_json())
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if not self.is_authenticated():
            return self.send_json({"error": "Não autorizado."}, 401)
        try:
            with connect() as db:
                self.route_delete(db, parsed)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 500)

    def handle_login(self, payload):
        password = os.environ.get("APP_PASSWORD", "")
        if not password:
            return self.send_json({"ok": True})
        if payload.get("password") != password:
            return self.send_json({"error": "Senha incorreta."}, 401)
        body = json.dumps({"ok": True}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Set-Cookie", f"{SESSION_COOKIE}={auth_cookie_value(password)}; Path=/; SameSite=Lax")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def route_get(self, db, parsed):
        path = parsed.path
        qs = parse_qs(parsed.query)
        if path == "/api/bootstrap":
            data = {
                "people": [dict(r) for r in db.execute("SELECT * FROM people ORDER BY name")],
                "resources": [dict(r) for r in db.execute("SELECT * FROM resources ORDER BY name")],
                "models": self.models_payload(db),
            }
            return self.send_json(data)
        if path == "/api/operations":
            start = qs.get("start", ["1900-01-01T00:00"])[0]
            end = qs.get("end", ["2999-12-31T23:59"])[0]
            rows = db.execute(
                """
                SELECT o.*, m.name AS model_name, m.min_people, m.general_notes, m.procedure
                FROM operations o
                JOIN operation_models m ON m.id = o.model_id
                WHERE o.starts_at < ? AND o.ends_at > ?
                ORDER BY o.starts_at
                """,
                (end, start),
            ).fetchall()
            return self.send_json([self.operation_payload(db, r["id"]) for r in rows])
        if path.startswith("/api/operations/"):
            operation_id = int(path.rsplit("/", 1)[-1])
            return self.send_json(self.operation_payload(db, operation_id))
        if path == "/api/person-schedule":
            start = qs.get("start", ["1900-01-01T00:00"])[0]
            end = qs.get("end", ["2999-12-31T23:59"])[0]
            return self.send_json(self.person_schedule_payload(db, start, end))
        if path == "/api/calculate":
            model_id = int(qs["model_id"][0])
            people = int(qs.get("people", ["1"])[0])
            return self.send_json(get_operation_resources(db, model_id, people))
        self.send_json({"error": "Not found"}, 404)

    def route_post(self, db, parsed, payload):
        if parsed.path == "/api/operations/validate":
            return self.send_json({"warnings": validate_operation(db, payload)})
        if parsed.path == "/api/people":
            name = payload.get("name", "").strip().upper()
            if not name:
                return self.send_json({"error": "Nome é obrigatório."}, 400)
            cur = db.execute(
                "INSERT INTO people (name, groups, notes, active) VALUES (?, ?, ?, ?)",
                (name, payload.get("groups", "").strip(), payload.get("notes", "").strip(), int(payload.get("active", 1))),
            )
            db.commit()
            return self.send_json(row_to_dict(db.execute("SELECT * FROM people WHERE id = ?", (cur.lastrowid,)).fetchone()), 201)
        if parsed.path.startswith("/api/models/") and parsed.path.endswith("/resources"):
            model_id = int(parsed.path.split("/")[3])
            resource_id = int(payload.get("resource_id"))
            exists = db.execute(
                "SELECT id FROM model_resources WHERE model_id = ? AND resource_id = ?",
                (model_id, resource_id),
            ).fetchone()
            if exists:
                return self.send_json({"error": "Este recurso já está no modelo."}, 409)
            db.execute(
                "INSERT INTO model_resources (model_id, resource_id, rule_type, amount) VALUES (?, ?, ?, ?)",
                (model_id, resource_id, payload.get("rule_type", "fixed"), int(payload.get("amount", 1))),
            )
            db.commit()
            return self.send_json(self.models_payload(db), 201)
        if parsed.path == "/api/operations":
            warnings = validate_operation(db, payload)
            if warnings and not payload.get("justification", "").strip():
                return self.send_json({"warnings": warnings, "error": "Justificativa obrigatória para salvar com alertas."}, 409)
            cur = db.execute(
                "INSERT INTO operations (model_id, starts_at, ends_at, location, planned_people, status, justification) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (payload["model_id"], payload["starts_at"], payload["ends_at"], payload.get("location", ""), payload["planned_people"], payload.get("status", "planejada"), payload.get("justification", "")),
            )
            operation_id = cur.lastrowid
            self.save_children(db, operation_id, payload)
            db.commit()
            return self.send_json(self.operation_payload(db, operation_id), 201)
        self.send_json({"error": "Not found"}, 404)

    def route_put(self, db, parsed, payload):
        if parsed.path.startswith("/api/people/"):
            person_id = int(parsed.path.rsplit("/", 1)[-1])
            name = payload.get("name", "").strip().upper()
            if not name:
                return self.send_json({"error": "Nome é obrigatório."}, 400)
            db.execute(
                "UPDATE people SET name=?, groups=?, notes=?, active=? WHERE id=?",
                (name, payload.get("groups", "").strip(), payload.get("notes", "").strip(), int(payload.get("active", 1)), person_id),
            )
            db.commit()
            return self.send_json(row_to_dict(db.execute("SELECT * FROM people WHERE id = ?", (person_id,)).fetchone()))
        if parsed.path.startswith("/api/resources/"):
            resource_id = int(parsed.path.rsplit("/", 1)[-1])
            name = payload.get("name", "").strip().upper()
            if not name:
                return self.send_json({"error": "Nome é obrigatório."}, 400)
            db.execute(
                "UPDATE resources SET name=?, quantity=?, category=?, notes=? WHERE id=?",
                (name, int(payload.get("quantity", 0)), payload.get("category", "item").strip(), payload.get("notes", "").strip(), resource_id),
            )
            db.commit()
            return self.send_json(row_to_dict(db.execute("SELECT * FROM resources WHERE id = ?", (resource_id,)).fetchone()))
        if parsed.path.startswith("/api/models/"):
            model_id = int(parsed.path.rsplit("/", 1)[-1])
            name = payload.get("name", "").strip().upper()
            if not name:
                return self.send_json({"error": "Nome é obrigatório."}, 400)
            db.execute(
                """
                UPDATE operation_models
                SET name=?, min_people=?, recommended_people=?, general_notes=?, procedure=?
                WHERE id=?
                """,
                (
                    name,
                    int(payload.get("min_people", 1)),
                    int(payload.get("recommended_people", 1)),
                    payload.get("general_notes", "").strip(),
                    payload.get("procedure", "").strip(),
                    model_id,
                ),
            )
            db.commit()
            return self.send_json(row_to_dict(db.execute("SELECT * FROM operation_models WHERE id = ?", (model_id,)).fetchone()))
        if parsed.path.startswith("/api/model-resources/"):
            model_resource_id = int(parsed.path.rsplit("/", 1)[-1])
            db.execute(
                "UPDATE model_resources SET rule_type=?, amount=? WHERE id=?",
                (payload.get("rule_type", "fixed"), int(payload.get("amount", 1)), model_resource_id),
            )
            db.commit()
            return self.send_json(row_to_dict(db.execute("SELECT * FROM model_resources WHERE id = ?", (model_resource_id,)).fetchone()))
        if parsed.path.startswith("/api/operations/"):
            operation_id = int(parsed.path.rsplit("/", 1)[-1])
            warnings = validate_operation(db, payload, operation_id)
            if warnings and not payload.get("justification", "").strip():
                return self.send_json({"warnings": warnings, "error": "Justificativa obrigatória para salvar com alertas."}, 409)
            db.execute(
                "UPDATE operations SET model_id=?, starts_at=?, ends_at=?, location=?, planned_people=?, status=?, justification=? WHERE id=?",
                (payload["model_id"], payload["starts_at"], payload["ends_at"], payload.get("location", ""), payload["planned_people"], payload.get("status", "planejada"), payload.get("justification", ""), operation_id),
            )
            db.execute("DELETE FROM operation_people WHERE operation_id = ?", (operation_id,))
            db.execute("DELETE FROM operation_resource_overrides WHERE operation_id = ?", (operation_id,))
            self.save_children(db, operation_id, payload)
            db.commit()
            return self.send_json(self.operation_payload(db, operation_id))
        self.send_json({"error": "Not found"}, 404)

    def route_delete(self, db, parsed):
        if parsed.path.startswith("/api/operations/"):
            operation_id = int(parsed.path.rsplit("/", 1)[-1])
            db.execute("DELETE FROM operations WHERE id = ?", (operation_id,))
            db.commit()
            return self.send_json({"ok": True})
        if parsed.path.startswith("/api/model-resources/"):
            model_resource_id = int(parsed.path.rsplit("/", 1)[-1])
            db.execute("DELETE FROM model_resources WHERE id = ?", (model_resource_id,))
            db.commit()
            return self.send_json({"ok": True})
        if parsed.path.startswith("/api/resources/"):
            resource_id = int(parsed.path.rsplit("/", 1)[-1])
            linked_model = db.execute("SELECT 1 FROM model_resources WHERE resource_id = ? LIMIT 1", (resource_id,)).fetchone()
            linked_operation = db.execute("SELECT 1 FROM operation_resource_overrides WHERE resource_id = ? LIMIT 1", (resource_id,)).fetchone()
            if linked_model or linked_operation:
                return self.send_json({"error": "Recurso em uso. Remova-o dos modelos/operações antes de excluir."}, 409)
            db.execute("DELETE FROM resources WHERE id = ?", (resource_id,))
            db.commit()
            return self.send_json({"ok": True})
        if parsed.path.startswith("/api/people/"):
            person_id = int(parsed.path.rsplit("/", 1)[-1])
            linked_operation = db.execute("SELECT 1 FROM operation_people WHERE person_id = ? LIMIT 1", (person_id,)).fetchone()
            if linked_operation:
                return self.send_json({"error": "Pessoa em uso em operação. Remova-a das operações ou marque como inativa."}, 409)
            db.execute("DELETE FROM people WHERE id = ?", (person_id,))
            db.commit()
            return self.send_json({"ok": True})
        self.send_json({"error": "Not found"}, 404)

    def save_children(self, db, operation_id, payload):
        for person_id in payload.get("people_ids", []):
            db.execute("INSERT INTO operation_people (operation_id, person_id) VALUES (?, ?)", (operation_id, person_id))
        default_resources = get_operation_resources(db, payload["model_id"], payload["planned_people"])
        default_map = {r["id"]: r["quantity"] for r in default_resources}
        for resource in payload.get("resources", []):
            if int(resource["quantity"]) != int(default_map.get(resource["id"], 0)):
                db.execute(
                    "INSERT INTO operation_resource_overrides (operation_id, resource_id, quantity) VALUES (?, ?, ?)",
                    (operation_id, resource["id"], resource["quantity"]),
                )

    def models_payload(self, db):
        models = []
        for row in db.execute("SELECT * FROM operation_models ORDER BY name"):
            item = dict(row)
            item["resources"] = self.model_resources_payload(db, row["id"], row["recommended_people"])
            models.append(item)
        return models

    def model_resources_payload(self, db, model_id, people_count):
        rows = db.execute(
            """
            SELECT mr.id AS model_resource_id, r.id, r.name, r.quantity AS stock, mr.rule_type, mr.amount
            FROM model_resources mr
            JOIN resources r ON r.id = mr.resource_id
            WHERE mr.model_id = ?
            ORDER BY r.name
            """,
            (model_id,),
        ).fetchall()
        return [{
            "model_resource_id": row["model_resource_id"],
            "id": row["id"],
            "name": row["name"],
            "stock": row["stock"],
            "quantity": calc_resource(row["rule_type"], row["amount"], people_count),
            "rule_type": row["rule_type"],
            "amount": row["amount"],
        } for row in rows]

    def operation_payload(self, db, operation_id):
        row = db.execute(
            """
            SELECT o.*, m.name AS model_name, m.min_people, m.recommended_people, m.general_notes, m.procedure
            FROM operations o JOIN operation_models m ON m.id = o.model_id
            WHERE o.id = ?
            """,
            (operation_id,),
        ).fetchone()
        item = dict(row)
        item["people"] = [dict(r) for r in db.execute(
            "SELECT p.* FROM operation_people op JOIN people p ON p.id = op.person_id WHERE op.operation_id = ? ORDER BY p.name",
            (operation_id,),
        )]
        item["resources"] = get_operation_resources(db, row["model_id"], row["planned_people"], operation_id)
        item["warnings"] = validate_operation(db, {
            "model_id": row["model_id"],
            "starts_at": row["starts_at"],
            "ends_at": row["ends_at"],
            "planned_people": row["planned_people"],
            "people_ids": [p["id"] for p in item["people"]],
            "resources": item["resources"],
        }, operation_id)
        return item

    def person_schedule_payload(self, db, start, end):
        people = [dict(r) for r in db.execute("SELECT * FROM people ORDER BY name")]
        rows = db.execute(
            """
            SELECT p.id AS person_id, o.id AS operation_id, o.starts_at, o.ends_at, o.location,
                   m.name AS model_name
            FROM operation_people op
            JOIN people p ON p.id = op.person_id
            JOIN operations o ON o.id = op.operation_id
            JOIN operation_models m ON m.id = o.model_id
            WHERE o.starts_at < ? AND o.ends_at > ?
            ORDER BY p.name, o.starts_at
            """,
            (end, start),
        ).fetchall()
        by_person = {p["id"]: {**p, "assignments": [], "issues": []} for p in people}
        for row in rows:
            by_person[row["person_id"]]["assignments"].append({
                "operation_id": row["operation_id"],
                "model_name": row["model_name"],
                "starts_at": row["starts_at"],
                "ends_at": row["ends_at"],
                "location": row["location"],
            })
        for person in by_person.values():
            assignments = person["assignments"]
            for i, current in enumerate(assignments):
                current_start = parse_dt(current["starts_at"])
                current_end = parse_dt(current["ends_at"])
                for other in assignments[i + 1:]:
                    other_start = parse_dt(other["starts_at"])
                    other_end = parse_dt(other["ends_at"])
                    if current_start < other_end and current_end > other_start:
                        person["issues"].append({
                            "type": "overlap",
                            "message": f"Conflito simultâneo: {current['model_name']} e {other['model_name']}.",
                        })
                    elif current_end <= other_start:
                        rest_hours = (other_start - current_end).total_seconds() / 3600
                        if rest_hours < 12:
                            person["issues"].append({
                                "type": "rest",
                                "message": f"Folga de {rest_hours:.1f}h entre {current['model_name']} e {other['model_name']}.",
                            })
                    elif other_end <= current_start:
                        rest_hours = (current_start - other_end).total_seconds() / 3600
                        if rest_hours < 12:
                            person["issues"].append({
                                "type": "rest",
                                "message": f"Folga de {rest_hours:.1f}h entre {other['model_name']} e {current['model_name']}.",
                            })
        return list(by_person.values())


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"App rodando em http://127.0.0.1:{port}")
    server.serve_forever()
