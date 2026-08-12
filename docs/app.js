const state = {
  people: [],
  resources: [],
  models: [],
  operations: [],
  calculatedResources: [],
  personSchedule: [],
};

const $ = (id) => document.getElementById(id);
const DEFAULT_REMOTE_API_URL = "https://script.google.com/macros/s/AKfycbwHN8ApnIya9OuP1yrXsOFoqIRT6sZjOz4hZsM9IVZB_TE-7PerYuJ_x6JW-sdJpMT1kQ/exec";
const REMOTE_API_URL = cleanApiUrl(localStorage.getItem("operations_api_url") || DEFAULT_REMOTE_API_URL);
const REMOTE_ACCESS_KEY = String(localStorage.getItem("operations_access_key") || "").trim();
const LOCAL_DATA_KEY = "operations_local_snapshot_v1";

function cleanApiUrl(value) {
  return String(value || "").trim().split("?")[0];
}

function today(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function fmtDateTime(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[c]));
}

async function api(path, options = {}) {
  const isRemote = Boolean(REMOTE_API_URL);
  let url = path;
  let fetchOptions = { ...options };
  if (isRemote) {
    const [route, query = ""] = path.split("?");
    const params = new URLSearchParams(query);
    const requestedMethod = options.method || "GET";
    params.set("route", route.replace(/^\/api\/?/, ""));
    if (REMOTE_ACCESS_KEY) params.set("access_key", REMOTE_ACCESS_KEY);
    if (requestedMethod !== "GET" && requestedMethod !== "POST") {
      params.set("_method", requestedMethod);
    }
    url = `${REMOTE_API_URL}?${params.toString()}`;
    fetchOptions = {
      method: requestedMethod === "GET" ? "GET" : "POST",
      body: options.body,
    };
    if (requestedMethod !== "GET") {
      fetchOptions.headers = { "Content-Type": "text/plain;charset=utf-8" };
    }
  } else {
    fetchOptions.headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  }
  const res = await fetch(url, fetchOptions);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error("O Apps Script retornou uma página HTML em vez de JSON. Verifique a implantação: ela precisa estar como Aplicativo da Web e acessível para quem usa o app.");
  }
  if (!res.ok && !data.warnings) throw new Error(data.error || "Erro na requisição");
  if (data.error) throw new Error(data.error);
  return data;
}

async function bootstrap() {
  initApiSetup();
  $("filterStart").value = today(-7);
  $("filterEnd").value = today(30);
  $("scheduleStart").value = today(-7);
  $("scheduleEnd").value = today(30);
  $("opDate").value = today();
  const cached = loadLocalData();
  if (cached) {
    Object.assign(state, cached);
    refreshViews();
  } else {
    await downloadFromCloud();
  }
}

function initApiSetup() {
  const panel = $("apiSetup");
  const input = $("apiUrlInput");
  if (!panel || !input) return;
  input.value = REMOTE_API_URL;
  $("apiAccessKeyInput").value = REMOTE_ACCESS_KEY;
  panel.style.display = "grid";
}

async function reloadData() {
  refreshViews();
}

function loadLocalData() {
  try { return JSON.parse(localStorage.getItem(LOCAL_DATA_KEY) || "null"); } catch (_) { return null; }
}

function saveLocalData() {
  localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify({ people: state.people, resources: state.resources, models: state.models, operations: state.operations }));
  updateSyncStatus();
}

function updateSyncStatus(message) {
  const el = $("syncStatus");
  if (el) el.textContent = message || `Dados locais: ${new Date().toLocaleString("pt-BR")}`;
}

function refreshViews() {
  renderSelectors();
  renderPeoplePicker();
  renderModels();
  renderPeople();
  renderResources();
  calculateResources();
  loadOperations();
  updateSyncStatus();
}

async function downloadFromCloud() {
  if (state.operations.length && !confirm("Baixar da nuvem substituirá os dados locais deste navegador. Continuar?")) return;
  const data = await api("/api/snapshot");
  Object.assign(state, data, { calculatedResources: [], personSchedule: [] });
  saveLocalData();
  refreshViews();
  updateSyncStatus("Dados baixados da nuvem agora.");
}

async function uploadToCloud() {
  if (!confirm("Enviar estes dados locais substituirá a cópia atual da nuvem. Continuar?")) return;
  await api("/api/snapshot", {
    method: "POST",
    body: JSON.stringify({ people: state.people, resources: state.resources, models: state.models, operations: state.operations }),
  });
  updateSyncStatus("Dados locais enviados para a nuvem agora.");
}

function renderSelectors() {
  const modelOptions = state.models.map((m) => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join("");
  $("modelSelect").innerHTML = modelOptions;
  $("filterModel").innerHTML = `<option value="">Todas</option>${modelOptions}`;
  const peopleOptions = state.people.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  $("filterPerson").innerHTML = `<option value="">Todas</option>${peopleOptions}`;
  $("schedulePerson").innerHTML = `<option value="">Todas</option>${peopleOptions}`;
}

function renderPeoplePicker() {
  $("peoplePicker").innerHTML = state.people.map((p) => `
    <label class="check">
      <input type="checkbox" value="${p.id}" class="person-check">
      <span>${escapeHtml(p.name)}</span>
    </label>
  `).join("");
}

function calculateResources() {
  const modelId = $("modelSelect").value;
  const people = Number($("plannedPeople").value || 1);
  const model = state.models.find((item) => String(item.id) === String(modelId));
  state.calculatedResources = (model?.resources || []).map((resource) => ({
    ...resource,
    stock: Number(state.resources.find((item) => Number(item.id) === Number(resource.id))?.quantity || 0),
    quantity: resource.rule_type === "per_people_divisor" ? Math.ceil(people / Number(resource.amount || 1)) : Number(resource.amount || 0),
  }));
  $("resourceEditor").innerHTML = state.calculatedResources.map((r) => `
    <div class="resource-row">
      <div>
        <strong>${escapeHtml(r.name)}</strong>
        <div class="muted">Estoque: ${r.stock}</div>
      </div>
      <input type="number" min="0" value="${r.quantity}" data-resource="${r.id}">
    </div>
  `).join("") || "<p>Nenhum recurso cadastrado para este modelo.</p>";
}

function buildPayload() {
  const date = $("opDate").value;
  const start = `${date}T${$("opStart").value}`;
  let endDate = date;
  if ($("opEnd").value <= $("opStart").value) {
    const d = new Date(`${date}T00:00`);
    d.setDate(d.getDate() + 1);
    endDate = d.toISOString().slice(0, 10);
  }
  const end = `${endDate}T${$("opEnd").value}`;
  return {
    model_id: Number($("modelSelect").value),
    starts_at: start,
    ends_at: end,
    location: $("opLocation").value.trim(),
    planned_people: Number($("plannedPeople").value),
    justification: $("justification").value.trim(),
    people_ids: [...document.querySelectorAll(".person-check:checked")].map((el) => Number(el.value)),
    resources: [...document.querySelectorAll("#resourceEditor input")].map((el) => ({
      id: Number(el.dataset.resource),
      quantity: Number(el.value),
    })),
  };
}

function renderWarnings(warnings) {
  const box = $("warningBox");
  if (!warnings.length) {
    box.className = "warnings ok";
    box.innerHTML = "Nenhum conflito encontrado.";
    return;
  }
  box.className = "warnings";
  box.innerHTML = warnings.map((w) => `<div>${escapeHtml(w.message)}</div>`).join("");
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

function operationWarnings(payload, excludedId) {
  const model = state.models.find((item) => Number(item.id) === Number(payload.model_id));
  const warnings = [];
  const people = payload.people_ids || (payload.people || []).map((person) => Number(person.id));
  if (Number(payload.planned_people) < Number(model?.min_people || 0)) warnings.push({ message: `${model?.name || "Este modelo"} precisa de no mínimo ${model?.min_people || 0} pessoas.` });
  if (people.length !== Number(payload.planned_people)) warnings.push({ message: `Quantidade planejada (${payload.planned_people}) difere da equipe escalada (${people.length}).` });
  people.forEach((personId) => {
    const person = state.people.find((item) => Number(item.id) === Number(personId));
    state.operations.filter((op) => Number(op.id) !== Number(excludedId) && (op.people || []).some((item) => Number(item.id) === Number(personId))).forEach((op) => {
      if (overlaps(payload.starts_at, payload.ends_at, op.starts_at, op.ends_at)) warnings.push({ message: `${person?.name || "Pessoa"} já está em ${op.model_name} no mesmo intervalo.` });
      const rest = restHours(payload.starts_at, payload.ends_at, op.starts_at, op.ends_at);
      if (rest !== null && rest < 12) warnings.push({ message: `${person?.name || "Pessoa"} terá apenas ${rest.toFixed(1)}h de folga em relação a ${op.model_name}. Mínimo: 12h.` });
    });
  });
  (payload.resources || []).forEach((resource) => {
    const stock = Number(state.resources.find((item) => Number(item.id) === Number(resource.id))?.quantity || 0);
    const used = state.operations.filter((op) => Number(op.id) !== Number(excludedId) && overlaps(payload.starts_at, payload.ends_at, op.starts_at, op.ends_at)).reduce((total, op) => total + Number((op.resources || []).find((item) => Number(item.id) === Number(resource.id))?.quantity || 0), 0);
    if (used + Number(resource.quantity || 0) > stock) warnings.push({ message: `Falta ${used + Number(resource.quantity || 0) - stock} ${resource.name} no intervalo. Estoque: ${stock}, já reservado: ${used}, necessário: ${resource.quantity}.` });
  });
  return warnings;
}

function decorateOperation(op) {
  const model = state.models.find((item) => Number(item.id) === Number(op.model_id)) || {};
  const people = (op.people || []).map((person) => state.people.find((item) => Number(item.id) === Number(person.id)) || person);
  const resources = (op.resources || []).map((resource) => {
    const registered = state.resources.find((item) => Number(item.id) === Number(resource.id));
    return { ...registered, ...resource, name: registered?.name || resource.name || "Recurso não encontrado" };
  });
  const item = { ...op, model_name: model.name || op.model_name, min_people: model.min_people, recommended_people: model.recommended_people, general_notes: model.general_notes, procedure: model.procedure, people, resources };
  item.warnings = operationWarnings(item, item.id);
  return item;
}

function validateCurrent() {
  const warnings = operationWarnings(buildPayload());
  renderWarnings(warnings);
  return warnings;
}

function saveOperation(event) {
  event.preventDefault();
  const payload = buildPayload();
  const warnings = operationWarnings(payload);
  if (warnings.length && !payload.justification) {
    renderWarnings(warnings);
    $("justification").focus();
    return;
  }
  const id = state.operations.reduce((max, op) => Math.max(max, Number(op.id || 0)), 0) + 1;
  state.operations.push(decorateOperation({ ...payload, id, people: payload.people_ids.map((personId) => state.people.find((person) => Number(person.id) === personId)), created_at: new Date().toISOString(), status: "planejada" }));
  saveLocalData();
  $("operationForm").reset();
  $("opDate").value = today();
  $("opStart").value = "09:00";
  $("opEnd").value = "19:00";
  renderPeoplePicker();
  calculateResources();
  loadOperations();
  switchView("agenda");
}

function loadOperations() {
  const start = `${$("filterStart").value || "1900-01-01"}T00:00`;
  const end = `${$("filterEnd").value || "2999-12-31"}T23:59`;
  state.operations = state.operations.map(decorateOperation);
  renderAgenda();
  renderExecutionSelect();
  loadPersonSchedule(start, end);
}

function loadPersonSchedule(defaultStart, defaultEnd) {
  const start = defaultStart || `${$("scheduleStart").value || $("filterStart").value || "1900-01-01"}T00:00`;
  const end = defaultEnd || `${$("scheduleEnd").value || $("filterEnd").value || "2999-12-31"}T23:59`;
  state.personSchedule = state.people.map((person) => {
    const assignments = state.operations.filter((op) => (op.people || []).some((item) => Number(item.id) === Number(person.id)) && op.starts_at < end && op.ends_at > start).map((op) => ({ operation_id: op.id, model_name: op.model_name, starts_at: op.starts_at, ends_at: op.ends_at, location: op.location }));
    const issues = [];
    assignments.forEach((a, index) => assignments.slice(index + 1).forEach((b) => {
      if (overlaps(a.starts_at, a.ends_at, b.starts_at, b.ends_at)) issues.push({ message: `Conflito simultâneo: ${a.model_name} e ${b.model_name}.` });
      const rest = restHours(a.starts_at, a.ends_at, b.starts_at, b.ends_at);
      if (rest !== null && rest < 12) issues.push({ message: `Folga de ${rest.toFixed(1)}h entre ${a.model_name} e ${b.model_name}.` });
    }));
    return { ...person, assignments, issues };
  });
  renderPersonSchedule();
}

function renderAgenda() {
  const modelFilter = $("filterModel").value;
  const personFilter = Number($("filterPerson").value || 0);
  const operations = state.operations.filter((op) => {
    if (modelFilter && String(op.model_id) !== modelFilter) return false;
    if (personFilter && !op.people.some((p) => p.id === personFilter)) return false;
    return true;
  });
  $("agendaList").innerHTML = operations.map((op) => `
    <article class="operation-card">
      <div class="card-head">
        <strong>${escapeHtml(op.model_name)}</strong>
        <span class="badge ${op.warnings.length ? "bad" : ""}">${op.warnings.length ? `${op.warnings.length} alerta(s)` : "OK"}</span>
      </div>
      <div class="meta">
        <span>${fmtDateTime(op.starts_at)} até ${fmtDateTime(op.ends_at)}</span>
        <span>${escapeHtml(op.location || "Sem local")}</span>
        <span>${op.people.length}/${op.planned_people} pessoas</span>
      </div>
      <div class="chips">${op.people.map((p) => `<span class="chip">${escapeHtml(p.name)}</span>`).join("")}</div>
      <div class="chips">${op.resources.filter((r) => r.quantity > 0).map((r) => `<span class="chip">${r.quantity} ${escapeHtml(r.name)}</span>`).join("")}</div>
      <div class="card-actions">
        ${op.justification ? `<span class="badge warn">Justificado</span>` : "<span></span>"}
        <button type="button" class="danger" data-delete-operation="${op.id}">Excluir</button>
      </div>
    </article>
  `).join("") || `<p>Nenhuma operação no período.</p>`;
}

function renderModels() {
  const resourceOptions = state.resources.map((r) => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("");
  $("modelsList").innerHTML = state.models.map((m) => `
    <article class="list-item editable-model" data-id="${m.id}">
      <div class="model-grid">
        <label>Nome <input data-field="name" value="${escapeHtml(m.name)}"></label>
        <label>Mínimo <input data-field="min_people" type="number" min="1" value="${m.min_people}"></label>
        <label>Recomendado <input data-field="recommended_people" type="number" min="1" value="${m.recommended_people}"></label>
      </div>
      <label>Observações gerais <textarea data-field="general_notes" rows="2">${escapeHtml(m.general_notes)}</textarea></label>
      <label>Descrição/procedimento <textarea data-field="procedure" rows="5">${escapeHtml(m.procedure)}</textarea></label>
      <section class="model-resources">
        <h3>Recursos do modelo</h3>
        ${m.resources.map((r) => `
          <div class="model-resource-row" data-model-resource="${r.model_resource_id}">
            <strong>${escapeHtml(r.name)}</strong>
            <select data-field="rule_type">
              <option value="fixed" ${r.rule_type === "fixed" ? "selected" : ""}>Quantidade fixa</option>
              <option value="per_people_divisor" ${r.rule_type === "per_people_divisor" ? "selected" : ""}>1 a cada N pessoas</option>
            </select>
            <input data-field="amount" type="number" min="0" value="${r.amount}">
            <span class="muted">Agora: ${r.quantity}</span>
            <button type="button" data-save-model-resource="${r.model_resource_id}">Salvar</button>
            <button type="button" class="danger" data-delete-model-resource="${r.model_resource_id}">Remover</button>
          </div>
        `).join("") || `<p>Nenhum recurso neste modelo.</p>`}
        <div class="add-model-resource" data-model-add="${m.id}">
          <select data-new-resource>${resourceOptions}</select>
          <select data-new-rule>
            <option value="fixed">Quantidade fixa</option>
            <option value="per_people_divisor">1 a cada N pessoas</option>
          </select>
          <input data-new-amount type="number" min="0" value="1">
          <button type="button" data-add-model-resource="${m.id}">Adicionar recurso</button>
        </div>
      </section>
      <div class="actions compact"><button type="button" data-save-model="${m.id}" class="primary">Salvar modelo</button></div>
    </article>
  `).join("");
}

function renderPeople() {
  $("peopleList").innerHTML = `
    <div class="table-row editable header"><span>Nome</span><span>Grupo</span><span>Status</span><span></span></div>
    ${state.people.map((p) => `
      <div class="table-row editable" data-id="${p.id}">
        <input data-field="name" value="${escapeHtml(p.name)}">
        <input data-field="groups" value="${escapeHtml(p.groups || "")}">
        <select data-field="active">
          <option value="1" ${p.active ? "selected" : ""}>Ativo</option>
          <option value="0" ${!p.active ? "selected" : ""}>Inativo</option>
        </select>
        <div class="row-buttons">
          <button type="button" data-save-person="${p.id}">Salvar</button>
          <button type="button" class="danger" data-delete-person="${p.id}">Excluir</button>
        </div>
      </div>
    `).join("")}
  `;
}

function renderPersonSchedule() {
  const personId = Number($("schedulePerson").value || 0);
  const status = $("scheduleStatus").value;
  const rows = state.personSchedule.filter((person) => {
    if (personId && person.id !== personId) return false;
    if (status === "issues" && !person.issues.length) return false;
    if (status === "assigned" && !person.assignments.length) return false;
    return true;
  });
  $("personScheduleList").innerHTML = rows.map((person) => `
    <article class="person-card ${person.issues.length ? "has-issue" : ""}">
      <div class="card-head">
        <strong>${escapeHtml(person.name)}</strong>
        <span class="badge ${person.issues.length ? "bad" : ""}">${person.issues.length ? `${person.issues.length} alerta(s)` : `${person.assignments.length} escala(s)`}</span>
      </div>
      ${person.issues.length ? `<div class="warnings">${person.issues.map((issue) => `<div>${escapeHtml(issue.message)}</div>`).join("")}</div>` : ""}
      <div class="assignment-list">
        ${person.assignments.map((op) => `
          <div class="assignment">
            <strong>${escapeHtml(op.model_name)}</strong>
            <span>${fmtDateTime(op.starts_at)} até ${fmtDateTime(op.ends_at)}</span>
            <span>${escapeHtml(op.location || "Sem local")}</span>
          </div>
        `).join("") || `<p>Sem escala no período.</p>`}
      </div>
    </article>
  `).join("") || `<p>Nenhuma pessoa encontrada para os filtros.</p>`;
}

function renderResources() {
  $("resourcesList").innerHTML = `
    <div class="table-row editable header"><span>Recurso</span><span>Categoria</span><span>Quantidade</span><span></span></div>
    ${state.resources.map((r) => `
      <div class="table-row editable" data-id="${r.id}">
        <input data-field="name" value="${escapeHtml(r.name)}">
        <input data-field="category" value="${escapeHtml(r.category)}">
        <input data-field="quantity" type="number" min="0" value="${r.quantity}">
        <div class="row-buttons">
          <button type="button" data-save-resource="${r.id}">Salvar</button>
          <button type="button" class="danger" data-delete-resource="${r.id}">Excluir</button>
        </div>
      </div>
    `).join("")}
  `;
}

function valuesFrom(container) {
  const data = {};
  container.querySelectorAll("[data-field]").forEach((input) => {
    data[input.dataset.field] = input.value;
  });
  return data;
}

function addPerson(event) {
  event.preventDefault();
  state.people.push({ id: state.people.reduce((max, person) => Math.max(max, Number(person.id || 0)), 0) + 1, name: $("newPersonName").value.trim().toUpperCase(), groups: $("newPersonGroup").value.trim(), active: 1, notes: "" });
  $("addPersonForm").reset();
  saveLocalData();
  reloadData();
}

function savePerson(id) {
  const row = document.querySelector(`#peopleList [data-id="${id}"]`);
  Object.assign(state.people.find((person) => Number(person.id) === Number(id)), valuesFrom(row));
  state.people.find((person) => Number(person.id) === Number(id)).active = Number(state.people.find((person) => Number(person.id) === Number(id)).active);
  saveLocalData();
  reloadData();
}

function saveResource(id) {
  const row = document.querySelector(`#resourcesList [data-id="${id}"]`);
  const resource = state.resources.find((item) => Number(item.id) === Number(id));
  Object.assign(resource, valuesFrom(row));
  resource.name = resource.name.trim().toUpperCase();
  resource.quantity = Number(resource.quantity || 0);
  saveLocalData();
  reloadData();
}

function saveModel(id) {
  const row = document.querySelector(`#modelsList [data-id="${id}"]`);
  const model = state.models.find((item) => Number(item.id) === Number(id));
  Object.assign(model, valuesFrom(row));
  model.name = model.name.trim().toUpperCase();
  model.min_people = Number(model.min_people || 0);
  model.recommended_people = Number(model.recommended_people || 0);
  saveLocalData();
  reloadData();
}

function saveModelResource(id) {
  const row = document.querySelector(`[data-model-resource="${id}"]`);
  const resource = state.models.flatMap((model) => model.resources || []).find((item) => Number(item.model_resource_id) === Number(id));
  Object.assign(resource, valuesFrom(row));
  resource.amount = Number(resource.amount || 0);
  saveLocalData();
  reloadData();
}

function addModelResource(modelId) {
  const row = document.querySelector(`[data-model-add="${modelId}"]`);
  try {
    const model = state.models.find((item) => Number(item.id) === Number(modelId));
    const resourceId = Number(row.querySelector("[data-new-resource]").value);
    if ((model.resources || []).some((item) => Number(item.id) === resourceId)) throw new Error("Este recurso já está no modelo.");
    const resource = state.resources.find((item) => Number(item.id) === resourceId);
    model.resources.push({ model_resource_id: state.models.flatMap((item) => item.resources || []).reduce((max, item) => Math.max(max, Number(item.model_resource_id || 0)), 0) + 1, id: resourceId, name: resource.name, stock: Number(resource.quantity), rule_type: row.querySelector("[data-new-rule]").value, amount: Number(row.querySelector("[data-new-amount]").value), quantity: 0 });
    saveLocalData();
    reloadData();
  } catch (err) {
    alert(err.message);
  }
}

function deleteOperation(id) {
  if (!confirm("Excluir esta operação?")) return;
  state.operations = state.operations.filter((operation) => Number(operation.id) !== Number(id));
  saveLocalData();
  loadOperations();
}

function deleteResource(id) {
  if (!confirm("Excluir este recurso? Se ele estiver em uso por algum modelo, o app vai bloquear.")) return;
  try {
    if (state.models.some((model) => (model.resources || []).some((resource) => Number(resource.id) === Number(id)))) throw new Error("Recurso em uso. Remova-o dos modelos antes de excluir.");
    state.resources = state.resources.filter((resource) => Number(resource.id) !== Number(id));
    saveLocalData();
    reloadData();
  } catch (err) {
    alert(err.message);
  }
}

function deletePerson(id) {
  if (!confirm("Excluir esta pessoa? Se ela estiver em alguma operação, o app vai bloquear.")) return;
  try {
    if (state.operations.some((operation) => (operation.people || []).some((person) => Number(person.id) === Number(id)))) throw new Error("Pessoa em uso em operação. Remova-a das operações ou marque como inativa.");
    state.people = state.people.filter((person) => Number(person.id) !== Number(id));
    saveLocalData();
    reloadData();
  } catch (err) {
    alert(err.message);
  }
}

function deleteModelResource(id) {
  if (!confirm("Remover este recurso deste modelo de operação?")) return;
  state.models.forEach((model) => { model.resources = (model.resources || []).filter((resource) => Number(resource.model_resource_id) !== Number(id)); });
  saveLocalData();
  reloadData();
}

function renderExecutionSelect() {
  $("executionSelect").innerHTML = state.operations.map((op) => `
    <option value="${op.id}">${escapeHtml(op.model_name)} - ${fmtDateTime(op.starts_at)}</option>
  `).join("");
  renderExecution();
}

function renderExecution() {
  const op = state.operations.find((item) => String(item.id) === $("executionSelect").value) || state.operations[0];
  if (!op) {
    $("executionSheet").innerHTML = "<p>Nenhuma operação selecionada.</p>";
    return;
  }
  $("executionSheet").innerHTML = `
    <h2>${escapeHtml(op.model_name)}</h2>
    <p>${fmtDateTime(op.starts_at)} até ${fmtDateTime(op.ends_at)} · ${escapeHtml(op.location || "Sem local")}</p>
    <div class="execution-grid">
      <section>
        <h3>Equipe</h3>
        <ul>${op.people.map((p) => `<li>${escapeHtml(p.name)}</li>`).join("")}</ul>
      </section>
      <section>
        <h3>Recursos</h3>
        <ul>${op.resources.filter((r) => r.quantity > 0).map((r) => `<li>${r.quantity} - ${escapeHtml(r.name)}</li>`).join("")}</ul>
      </section>
    </div>
    ${op.warnings.length ? `<div class="warnings">${op.warnings.map((w) => `<div>${escapeHtml(w.message)}</div>`).join("")}</div>` : `<div class="warnings ok">Operação sem alertas.</div>`}
    ${op.justification ? `<div class="print-block"><strong>Justificativa</strong>\n${escapeHtml(op.justification)}</div>` : ""}
    <div class="print-block"><strong>Observações gerais</strong>\n${escapeHtml(op.general_notes)}</div>
    <div class="print-block"><strong>Procedimento operacional</strong>\n${escapeHtml(op.procedure)}</div>
  `;
}

function switchView(view) {
  document.querySelectorAll(".nav").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === `view-${view}`));
}

document.querySelectorAll(".nav").forEach((btn) => btn.addEventListener("click", () => switchView(btn.dataset.view)));
$("modelSelect").addEventListener("change", calculateResources);
$("plannedPeople").addEventListener("input", calculateResources);
$("validateBtn").addEventListener("click", validateCurrent);
$("operationForm").addEventListener("submit", saveOperation);
$("refreshBtn").addEventListener("click", loadOperations);
$("downloadCloudBtn").addEventListener("click", () => downloadFromCloud().catch((err) => alert(err.message)));
$("uploadCloudBtn").addEventListener("click", () => uploadToCloud().catch((err) => alert(err.message)));
$("filterStart").addEventListener("change", loadOperations);
$("filterEnd").addEventListener("change", loadOperations);
$("filterModel").addEventListener("change", renderAgenda);
$("filterPerson").addEventListener("change", renderAgenda);
$("executionSelect").addEventListener("change", renderExecution);
$("addPersonForm").addEventListener("submit", addPerson);
$("saveApiUrlBtn").addEventListener("click", () => {
  const value = cleanApiUrl($("apiUrlInput").value);
  if (!value) return;
  localStorage.setItem("operations_api_url", value);
  localStorage.setItem("operations_access_key", $("apiAccessKeyInput").value.trim());
  window.location.reload();
});
$("scheduleRefreshBtn").addEventListener("click", loadPersonSchedule);
$("scheduleStart").addEventListener("change", loadPersonSchedule);
$("scheduleEnd").addEventListener("change", loadPersonSchedule);
$("schedulePerson").addEventListener("change", renderPersonSchedule);
$("scheduleStatus").addEventListener("change", renderPersonSchedule);
document.addEventListener("click", (event) => {
  const personId = event.target.dataset.savePerson;
  const resourceId = event.target.dataset.saveResource;
  const modelId = event.target.dataset.saveModel;
  const modelResourceId = event.target.dataset.saveModelResource;
  const addModelResourceId = event.target.dataset.addModelResource;
  const deleteOperationId = event.target.dataset.deleteOperation;
  const deleteResourceId = event.target.dataset.deleteResource;
  const deleteModelResourceId = event.target.dataset.deleteModelResource;
  const deletePersonId = event.target.dataset.deletePerson;
  if (personId) savePerson(personId);
  if (resourceId) saveResource(resourceId);
  if (modelId) saveModel(modelId);
  if (modelResourceId) saveModelResource(modelResourceId);
  if (addModelResourceId) addModelResource(addModelResourceId);
  if (deleteOperationId) deleteOperation(deleteOperationId);
  if (deleteResourceId) deleteResource(deleteResourceId);
  if (deleteModelResourceId) deleteModelResource(deleteModelResourceId);
  if (deletePersonId) deletePerson(deletePersonId);
});

bootstrap().catch((err) => {
  const panel = $("apiSetup");
  if (panel) {
    panel.style.display = "grid";
    panel.insertAdjacentHTML("beforeend", `<div class="warnings">${escapeHtml(err.message)}</div>`);
  } else {
    document.body.innerHTML = `<main><h1>Erro ao iniciar</h1><p>${escapeHtml(err.message)}</p></main>`;
  }
});
