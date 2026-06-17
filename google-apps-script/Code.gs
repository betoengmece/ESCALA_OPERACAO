const SPREADSHEET_ID = ""; // Opcional: cole o ID da planilha. Vazio = usa a planilha vinculada ao script.
const ALLOWED_EMAILS = []; // Opcional: ["pessoa@gmail.com"]. Vazio = libera quem tiver acesso ao Web App.

const SHEETS = {
  people: ["id", "name", "active", "groups", "notes"],
  resources: ["id", "name", "quantity", "category", "notes"],
  models: ["id", "name", "min_people", "recommended_people", "general_notes", "procedure"],
  model_resources: ["id", "model_id", "resource_id", "rule_type", "amount"],
  operations: ["id", "model_id", "starts_at", "ends_at", "location", "planned_people", "status", "justification", "created_at"],
  operation_people: ["operation_id", "person_id"],
  operation_resource_overrides: ["operation_id", "resource_id", "quantity"],
};

const SEED_PEOPLE = [
  "ADALBERTO", "OMAR", "BRENO", "ANDRADE", "BOA VENTURA", "PVR1", "PVR2", "PM1", "PM2",
  "PEREIRA", "RICARDO", "CASTIEL", "DOUGLAS", "BRUNO", "ANDRE", "CLAUDIO", "HELIO",
  "MARILUCE", "MARIZETE", "JOEL K9", "JONIO", "DANIEL", "RILDO", "HUGO", "FABIO",
  "JONILSON", "COZER", "OWADA", "JOAO", "GILSON", "ANTONIO", "DANILO", "EVER",
  "LUIS PORTO", "EVILAZIO", "GABRIEL"
];

const SEED_RESOURCES = [
  ["VIATURA STARLINK", 1, "viatura"], ["VIATURA BLAZER", 1, "viatura"], ["VIATURA L200", 1, "viatura"],
  ["VIATURA CRUZE", 1, "viatura"], ["VIATURA DESCARACTERIZADA ESTRADA CHAO", 0, "viatura"],
  ["VIATURA DESCARACTERIZADA PASSEIO", 0, "viatura"], ["FITA ABERTO ADUANA", 0, "item"],
  ["RADIOS", 3, "comunicacao"], ["VIATURA", 0, "viatura"], ["VIATURAS", 0, "viatura"],
  ["IMPRIMIR TERMO MANUAL", 0, "documento"], ["TERMO DE LACRACAO VOLUMES_TLV_CORREIOS-TRANSPORTADORAS.doc", 0, "documento"],
  ["FITA ESCRITO ABERTO PELA ADUANA", 0, "item"], ["CANIVETE OU ESTILETE", 0, "item"],
  ["CAIXAS", 5, "item"], ["CAMISA DESCARACTERIZADA", 0, "vestimenta"],
];

const SEED_MODELS = [
  ["CORREIOS", 3, 5, "Acompanhar caminhão dos Correios e conferir preenchimento das mercadorias apreendidas.", "Operação nos Correios, com abertura, análise, retenção, lacração e registro fotográfico das encomendas com indícios de irregularidade.",
    [["TERMO DE LACRACAO VOLUMES_TLV_CORREIOS-TRANSPORTADORAS.doc", "fixed", 2], ["FITA ESCRITO ABERTO PELA ADUANA", "per_people_divisor", 2], ["CANIVETE OU ESTILETE", "per_people_divisor", 2], ["CAIXAS", "fixed", 5], ["VIATURA L200", "fixed", 1], ["CAMISA DESCARACTERIZADA", "fixed", 1]]],
  ["PONTE", 3, 4, "Verificar procedimentos para PRF.", "Abordagem aleatória próximo da PRF/Ponte, com comunicação com a base quando houver internet.", [["IMPRIMIR TERMO MANUAL", "fixed", 2], ["RADIOS", "fixed", 1], ["VIATURA", "fixed", 1]]],
  ["ZS PRF", 3, 4, "Verificar procedimentos para PRF.", "Abordagem aleatória na PRF, com apoio da base para escolha de alvos quando possível.", [["IMPRIMIR TERMO MANUAL", "fixed", 2], ["RADIOS", "fixed", 1], ["VIATURA", "fixed", 1]]],
  ["BAGAGEM", 1, 7, "Verificar alvo SIVANA.", "Abordagem aleatória em bagagens, com conferência e apoio dos sistemas internos.", [["RADIOS", "fixed", 0], ["VIATURAS", "fixed", 1]]],
  ["SUPORTE", 1, 2, "Verificar alvo SIVANA.", "Suporte na escolha de alvos e acesso a sistemas internos para equipes externas.", [["RADIOS", "fixed", 1], ["VIATURA", "fixed", 0]]],
  ["DESPACHO", 3, 4, "Verificar alvo SIVANA.", "Abordagem aleatória e fiscalização em despacho.", [["RADIOS", "fixed", 1], ["VIATURA", "per_people_divisor", 4]]],
  ["DEPOSITO_GUAIRA", 3, 5, "Verificar alvo SIVANA.", "Fiscalização em depósito com abordagem aleatória.", [["RADIOS", "fixed", 1], ["VIATURA", "per_people_divisor", 4]]],
  ["DEPOSITO_MUNDO_NOVO", 3, 5, "Verificar alvo SIVANA.", "Fiscalização em depósito com abordagem aleatória.", [["RADIOS", "fixed", 1], ["VIATURA", "per_people_divisor", 4]]],
  ["ENTRADA PY", 2, 7, "Verificar alvo SIVANA.", "Abordagem noturna de veículos, identificação de condutor/proprietário, verificação de rota, dinheiro e registro no SAP.", [["RADIOS", "fixed", 1], ["VIATURA", "fixed", 1]]],
  ["SHOPEE", 1, 5, "Verificar alvo SIVANA.", "Apoio operacional e fiscalização relacionada a cargas Shopee.", [["CAIXAS", "fixed", 5], ["RADIOS", "fixed", 1], ["VIATURA", "fixed", 1]]],
];

function doGet(e) {
  return handle(e, null);
}

function doPost(e) {
  const body = e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  return handle(e, body);
}

function handle(e, body) {
  try {
    assertAccess();
    setup();
    const route = (e.parameter.route || "bootstrap").replace(/^\/+/, "");
    const result = dispatch(route, e.parameter, body || {});
    return json(result);
  } catch (err) {
    return json({ error: String(err.message || err) });
  }
}

function assertAccess() {
  if (!ALLOWED_EMAILS.length) return;
  const email = Session.getActiveUser().getEmail();
  if (!email || ALLOWED_EMAILS.indexOf(email) === -1) throw new Error("Acesso não autorizado.");
}

function dispatch(route, params, body) {
  const method = (params._method || "").toUpperCase();
  const effectiveMethod = method || (Object.keys(body || {}).length ? "POST" : "GET");
  if (route === "bootstrap") return bootstrapPayload();
  if (route === "calculate") return getOperationResources(Number(params.model_id), Number(params.people || 1));
  if (route === "operations" && effectiveMethod === "GET") return listOperations(params.start || "1900-01-01T00:00", params.end || "2999-12-31T23:59");
  if (route === "operations/validate") return { warnings: validateOperation(body, null) };
  if (route === "operations" && effectiveMethod === "POST" && body.model_id) return createOperation(body);
  if (route === "people" && effectiveMethod === "POST" && body.name) return createPerson(body);
  if (route === "person-schedule") return personSchedulePayload(params.start || "1900-01-01T00:00", params.end || "2999-12-31T23:59");

  let match = route.match(/^operations\/(\d+)$/);
  if (match && method === "DELETE") return deleteOperation(Number(match[1]));
  if (match && method === "PUT") return updateOperation(Number(match[1]), body);
  if (match) return operationPayload(Number(match[1]));

  match = route.match(/^people\/(\d+)$/);
  if (match && method === "PUT") return updateById("people", Number(match[1]), body, ["name", "groups", "notes", "active"]);
  if (match && method === "DELETE") return deletePerson(Number(match[1]));

  match = route.match(/^resources\/(\d+)$/);
  if (match && method === "PUT") return updateById("resources", Number(match[1]), body, ["name", "quantity", "category", "notes"]);
  if (match && method === "DELETE") return deleteResource(Number(match[1]));

  match = route.match(/^models\/(\d+)$/);
  if (match && method === "PUT") return updateById("models", Number(match[1]), body, ["name", "min_people", "recommended_people", "general_notes", "procedure"]);

  match = route.match(/^models\/(\d+)\/resources$/);
  if (match && effectiveMethod === "POST" && body.resource_id) return addModelResource(Number(match[1]), body);

  match = route.match(/^model-resources\/(\d+)$/);
  if (match && method === "PUT") return updateById("model_resources", Number(match[1]), body, ["rule_type", "amount"]);
  if (match && method === "DELETE") return deleteRowById("model_resources", "id", Number(match[1]));

  throw new Error("Rota não encontrada: " + route);
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function ss() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty("OPERATIONS_SPREADSHEET_ID");
  if (existingId) return SpreadsheetApp.openById(existingId);
  const created = SpreadsheetApp.create("ESCALA_OPERACAO_DADOS");
  props.setProperty("OPERATIONS_SPREADSHEET_ID", created.getId());
  return created;
}

function setup() {
  const book = ss();
  Object.keys(SHEETS).forEach(name => {
    let sheet = book.getSheetByName(name);
    if (!sheet) sheet = book.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(SHEETS[name]);
  });
  if (rows("people").length) return;
  SEED_PEOPLE.forEach((name, index) => append("people", {
    id: index + 1,
    name,
    active: 1,
    groups: ["BRENO", "ANDRADE", "BOA VENTURA", "PEREIRA", "RICARDO", "CASTIEL", "DOUGLAS", "BRUNO"].indexOf(name) >= 0 ? "Equipe_24x72" : "",
    notes: "",
  }));
  SEED_RESOURCES.forEach((r, index) => append("resources", { id: index + 1, name: r[0], quantity: r[1], category: r[2], notes: "" }));
  let mrId = 1;
  SEED_MODELS.forEach((m, index) => {
    const modelId = index + 1;
    append("models", { id: modelId, name: m[0], min_people: m[1], recommended_people: m[2], general_notes: m[3], procedure: m[4] });
    m[5].forEach(resource => append("model_resources", { id: mrId++, model_id: modelId, resource_id: resourceByName(resource[0]).id, rule_type: resource[1], amount: resource[2] }));
  });
}

function sheet(name) {
  return ss().getSheetByName(name);
}

function rows(name) {
  const sh = sheet(name);
  const values = sh.getDataRange().getValues();
  const headers = values.shift() || [];
  return values.filter(r => r.some(v => v !== "")).map(r => objectFrom(headers, r));
}

function objectFrom(headers, row) {
  const obj = {};
  headers.forEach((h, i) => obj[h] = row[i]);
  return obj;
}

function append(name, obj) {
  sheet(name).appendRow(SHEETS[name].map(h => obj[h] === undefined ? "" : obj[h]));
  return obj;
}

function nextId(name) {
  return rows(name).reduce((max, r) => Math.max(max, Number(r.id || 0)), 0) + 1;
}

function updateById(name, id, body, fields) {
  const sh = sheet(name);
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const idCol = headers.indexOf("id");
  for (let i = 1; i < values.length; i++) {
    if (Number(values[i][idCol]) === id) {
      fields.forEach(field => {
        const col = headers.indexOf(field);
        if (col >= 0 && body[field] !== undefined) values[i][col] = normalize(field, body[field]);
      });
      sh.getRange(i + 1, 1, 1, headers.length).setValues([values[i]]);
      return objectFrom(headers, values[i]);
    }
  }
  throw new Error("Registro não encontrado.");
}

function deleteRowById(name, idField, id) {
  const sh = sheet(name);
  const values = sh.getDataRange().getValues();
  const col = values[0].indexOf(idField);
  for (let i = 1; i < values.length; i++) {
    if (Number(values[i][col]) === id) {
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: true };
}

function normalize(field, value) {
  if (["id", "model_id", "resource_id", "quantity", "amount", "min_people", "recommended_people", "planned_people", "active"].indexOf(field) >= 0) return Number(value || 0);
  if (field === "name") return String(value || "").trim().toUpperCase();
  return String(value || "").trim();
}

function bootstrapPayload() {
  return { people: rows("people").sort(byName), resources: rows("resources").sort(byName), models: modelsPayload() };
}

function byName(a, b) {
  return String(a.name).localeCompare(String(b.name));
}

function resourceByName(name) {
  return rows("resources").find(r => r.name === name);
}

function modelById(id) {
  return rows("models").find(m => Number(m.id) === Number(id));
}

function calcResource(ruleType, amount, peopleCount) {
  amount = Number(amount || 0);
  if (ruleType === "per_people_divisor") return amount ? Math.ceil(Number(peopleCount || 0) / amount) : 0;
  return amount;
}

function getOperationResources(modelId, peopleCount, operationId) {
  const resources = rows("resources");
  const overrides = operationId ? rows("operation_resource_overrides").filter(o => Number(o.operation_id) === Number(operationId)) : [];
  return rows("model_resources")
    .filter(mr => Number(mr.model_id) === Number(modelId))
    .map(mr => {
      const resource = resources.find(r => Number(r.id) === Number(mr.resource_id));
      const override = overrides.find(o => Number(o.resource_id) === Number(resource.id));
      return {
        id: Number(resource.id),
        name: resource.name,
        stock: Number(resource.quantity || 0),
        quantity: override ? Number(override.quantity) : calcResource(mr.rule_type, mr.amount, peopleCount),
        rule_type: mr.rule_type,
        amount: Number(mr.amount || 0),
      };
    }).sort(byName);
}

function modelResourcesPayload(modelId, peopleCount) {
  const resources = rows("resources");
  return rows("model_resources")
    .filter(mr => Number(mr.model_id) === Number(modelId))
    .map(mr => {
      const resource = resources.find(r => Number(r.id) === Number(mr.resource_id));
      return {
        model_resource_id: Number(mr.id),
        id: Number(resource.id),
        name: resource.name,
        stock: Number(resource.quantity || 0),
        quantity: calcResource(mr.rule_type, mr.amount, peopleCount),
        rule_type: mr.rule_type,
        amount: Number(mr.amount || 0),
      };
    }).sort(byName);
}

function modelsPayload() {
  return rows("models").sort(byName).map(m => ({ ...m, resources: modelResourcesPayload(m.id, m.recommended_people) }));
}

function listOperations(start, end) {
  return rows("operations")
    .filter(o => o.starts_at < end && o.ends_at > start)
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
    .map(o => operationPayload(o.id));
}

function operationPayload(id) {
  const op = rows("operations").find(o => Number(o.id) === Number(id));
  const model = modelById(op.model_id);
  const personIds = rows("operation_people").filter(p => Number(p.operation_id) === Number(id)).map(p => Number(p.person_id));
  const people = rows("people").filter(p => personIds.indexOf(Number(p.id)) >= 0).sort(byName);
  const item = {
    ...op,
    id: Number(op.id),
    model_id: Number(op.model_id),
    planned_people: Number(op.planned_people),
    model_name: model.name,
    min_people: Number(model.min_people),
    recommended_people: Number(model.recommended_people),
    general_notes: model.general_notes,
    procedure: model.procedure,
    people,
    resources: getOperationResources(op.model_id, op.planned_people, op.id),
  };
  item.warnings = validateOperation({ ...item, people_ids: people.map(p => Number(p.id)) }, item.id);
  return item;
}

function createOperation(body) {
  const warnings = validateOperation(body, null);
  if (warnings.length && !String(body.justification || "").trim()) return { warnings, error: "Justificativa obrigatória para salvar com alertas." };
  const id = nextId("operations");
  append("operations", {
    id,
    model_id: Number(body.model_id),
    starts_at: body.starts_at,
    ends_at: body.ends_at,
    location: body.location || "",
    planned_people: Number(body.planned_people || 1),
    status: body.status || "planejada",
    justification: body.justification || "",
    created_at: new Date().toISOString(),
  });
  saveOperationChildren(id, body);
  return operationPayload(id);
}

function updateOperation(id, body) {
  const warnings = validateOperation(body, id);
  if (warnings.length && !String(body.justification || "").trim()) return { warnings, error: "Justificativa obrigatória para salvar com alertas." };
  updateById("operations", id, body, ["model_id", "starts_at", "ends_at", "location", "planned_people", "status", "justification"]);
  deleteLinks("operation_people", "operation_id", id);
  deleteLinks("operation_resource_overrides", "operation_id", id);
  saveOperationChildren(id, body);
  return operationPayload(id);
}

function saveOperationChildren(operationId, body) {
  (body.people_ids || []).forEach(personId => append("operation_people", { operation_id: operationId, person_id: Number(personId) }));
  const defaults = {};
  getOperationResources(body.model_id, body.planned_people).forEach(r => defaults[r.id] = r.quantity);
  (body.resources || []).forEach(r => {
    if (Number(r.quantity) !== Number(defaults[Number(r.id)] || 0)) append("operation_resource_overrides", { operation_id: operationId, resource_id: Number(r.id), quantity: Number(r.quantity) });
  });
}

function deleteLinks(name, field, id) {
  const sh = sheet(name);
  const values = sh.getDataRange().getValues();
  const col = values[0].indexOf(field);
  for (let i = values.length - 1; i >= 1; i--) if (Number(values[i][col]) === Number(id)) sh.deleteRow(i + 1);
}

function createPerson(body) {
  return append("people", { id: nextId("people"), name: normalize("name", body.name), active: Number(body.active === undefined ? 1 : body.active), groups: body.groups || "", notes: body.notes || "" });
}

function addModelResource(modelId, body) {
  const exists = rows("model_resources").some(r => Number(r.model_id) === Number(modelId) && Number(r.resource_id) === Number(body.resource_id));
  if (exists) throw new Error("Este recurso já está no modelo.");
  append("model_resources", { id: nextId("model_resources"), model_id: modelId, resource_id: Number(body.resource_id), rule_type: body.rule_type || "fixed", amount: Number(body.amount || 1) });
  return modelsPayload();
}

function deleteResource(id) {
  if (rows("model_resources").some(r => Number(r.resource_id) === Number(id)) || rows("operation_resource_overrides").some(r => Number(r.resource_id) === Number(id))) {
    throw new Error("Recurso em uso. Remova-o dos modelos/operações antes de excluir.");
  }
  return deleteRowById("resources", "id", id);
}

function deleteOperation(id) {
  deleteLinks("operation_people", "operation_id", id);
  deleteLinks("operation_resource_overrides", "operation_id", id);
  return deleteRowById("operations", "id", id);
}

function deletePerson(id) {
  if (rows("operation_people").some(r => Number(r.person_id) === Number(id))) throw new Error("Pessoa em uso em operação. Remova-a das operações ou marque como inativa.");
  return deleteRowById("people", "id", id);
}

function validateOperation(body, operationId) {
  const model = modelById(body.model_id);
  const peopleIds = (body.people_ids || []).map(Number);
  const warnings = [];
  if (Number(body.planned_people || 0) < Number(model.min_people)) warnings.push({ type: "min_people", message: `${model.name} precisa de no mínimo ${model.min_people} pessoas.` });
  if (peopleIds.length !== Number(body.planned_people || 0)) warnings.push({ type: "people_count", message: `Quantidade planejada (${body.planned_people}) difere da equipe escalada (${peopleIds.length}).` });
  const operations = rows("operations").filter(o => !operationId || Number(o.id) !== Number(operationId));
  peopleIds.forEach(personId => {
    const person = rows("people").find(p => Number(p.id) === personId);
    rows("operation_people").filter(op => Number(op.person_id) === personId).forEach(link => {
      const other = operations.find(o => Number(o.id) === Number(link.operation_id));
      if (!other) return;
      const otherModel = modelById(other.model_id);
      if (overlaps(body.starts_at, body.ends_at, other.starts_at, other.ends_at)) warnings.push({ type: "person_conflict", message: `${person.name} já está em ${otherModel.name} no mesmo intervalo.` });
      const rest = restHours(body.starts_at, body.ends_at, other.starts_at, other.ends_at);
      if (rest !== null && rest < 12) warnings.push({ type: "rest_conflict", message: `${person.name} terá apenas ${rest.toFixed(1)}h de folga em relação a ${otherModel.name}. Mínimo: 12h.` });
    });
  });
  (body.resources || getOperationResources(body.model_id, body.planned_people)).forEach(resource => {
    const required = Number(resource.quantity || 0);
    if (required <= 0) return;
    const stockResource = rows("resources").find(r => Number(r.id) === Number(resource.id));
    let used = 0;
    operations.filter(o => overlaps(body.starts_at, body.ends_at, o.starts_at, o.ends_at)).forEach(o => {
      getOperationResources(o.model_id, o.planned_people, o.id).forEach(r => { if (Number(r.id) === Number(resource.id)) used += Number(r.quantity || 0); });
    });
    const stock = Number(stockResource.quantity || 0);
    if (used + required > stock) warnings.push({ type: "resource_conflict", message: `Falta ${used + required - stock} ${stockResource.name} no intervalo. Estoque: ${stock}, já reservado: ${used}, necessário: ${required}.` });
  });
  return warnings;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function restHours(aStart, aEnd, bStart, bEnd) {
  const as = new Date(aStart), ae = new Date(aEnd), bs = new Date(bStart), be = new Date(bEnd);
  if (be <= as) return (as - be) / 36e5;
  if (ae <= bs) return (bs - ae) / 36e5;
  return null;
}

function personSchedulePayload(start, end) {
  return rows("people").sort(byName).map(person => {
    const assignments = rows("operation_people")
      .filter(link => Number(link.person_id) === Number(person.id))
      .map(link => rows("operations").find(o => Number(o.id) === Number(link.operation_id)))
      .filter(o => o && o.starts_at < end && o.ends_at > start)
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)))
      .map(o => ({ operation_id: Number(o.id), model_name: modelById(o.model_id).name, starts_at: o.starts_at, ends_at: o.ends_at, location: o.location }));
    const issues = [];
    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        const a = assignments[i], b = assignments[j];
        if (overlaps(a.starts_at, a.ends_at, b.starts_at, b.ends_at)) issues.push({ type: "overlap", message: `Conflito simultâneo: ${a.model_name} e ${b.model_name}.` });
        const rest = restHours(a.starts_at, a.ends_at, b.starts_at, b.ends_at);
        if (rest !== null && rest < 12) issues.push({ type: "rest", message: `Folga de ${rest.toFixed(1)}h entre ${a.model_name} e ${b.model_name}.` });
      }
    }
    return { ...person, assignments, issues };
  });
}
