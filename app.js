function viewerUrlFor(fileUrl){
  const ext = (fileUrl.split(".").pop() || "").toLowerCase().split("?")[0];
  if (ext === "doc" || ext === "docx" || ext === "xls" || ext === "xlsx" || ext === "ppt" || ext === "pptx"){
    return "https://docs.google.com/viewer?url=" + encodeURIComponent(fileUrl) + "&embedded=true";
  }
  return fileUrl;
}

let allDocs = [];
let customCategories = [];
let currentCategory = null; // null = dashboard, "__trash__" = cestino
let editingDocId = null;

// ---------- AUTH ----------
auth.onAuthStateChanged(user => {
  if (user) {
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("appScreen").style.display = "block";
    loadCustomCategories();
    loadDocs();
  } else {
    document.getElementById("loginScreen").style.display = "flex";
    document.getElementById("appScreen").style.display = "none";
  }
});

function doLogin(){
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPass").value;
  const err = document.getElementById("loginError");
  err.textContent = "";
  auth.signInWithEmailAndPassword(email, pass).catch(e => {
    err.textContent = "Accesso non riuscito: " + (e.message || e.code);
  });
}
function doLogout(){ auth.signOut(); }

// ---------- CATEGORIE (statiche + personalizzate) ----------
function loadCustomCategories(){
  db.collection(CUSTOM_CATEGORIES_COLLECTION).onSnapshot(snap => {
    customCategories = snap.docs.map(d => ({ id: d.id, custom: true, ...d.data() }));
    renderDashboard();
  });
}
function getAllCategories(){
  return [...CATEGORIES, ...customCategories];
}
function getCategory(id){
  return getAllCategories().find(c => c.id === id) || { id, name: id, icon:"📁", expiryMonths:null };
}

async function addCustomCategory(){
  const name = prompt("Nome della nuova categoria:");
  if (!name || !name.trim()) return;
  const icon = prompt("Emoji/icona per la categoria (es. 📁):", "📁") || "📁";
  const slug = "custom_" + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") + "_" + Date.now().toString(36);
  try {
    await db.collection(CUSTOM_CATEGORIES_COLLECTION).doc(slug).set({ name: name.trim(), icon, expiryMonths: null });
  } catch(e){
    alert("Errore creazione categoria: " + e.message);
  }
}

// ---------- LOAD DOCS ----------
function loadDocs(){
  db.collection(DOCS_COLLECTION).onSnapshot(snap => {
    allDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderDashboard();
    if (currentCategory) renderDocs();
  }, err => console.error(err));
}

function activeDocs(){ return allDocs.filter(d => !d.deleted); }
function trashedDocs(){ return allDocs.filter(d => d.deleted); }

// ---------- STATUS ----------
function computeStatus(doc){
  if (!doc.expiryDate) return "na";
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = new Date(doc.expiryDate);
  const diffDays = Math.floor((exp - today) / 86400000);
  if (diffDays < 0) return "expired";
  if (diffDays <= 60) return "warn";
  return "ok";
}
const STATUS_LABEL = { ok:"Valido", warn:"In scadenza", expired:"Scaduto", na:"N/D" };

// ---------- DASHBOARD ----------
function renderDashboard(){
  document.getElementById("dashboardView").style.display = "block";
  document.getElementById("categoryView").style.display = "none";
  document.getElementById("headerBack").style.display = "none";
  document.getElementById("headerTitle").textContent = "🔒 Sicurezza Clienti";
  document.getElementById("fabAdd").style.display = "none";
  currentCategory = null;

  const docs = activeDocs();
  const total = docs.length;
  const expired = docs.filter(d => computeStatus(d) === "expired").length;
  const warn = docs.filter(d => computeStatus(d) === "warn").length;
  const trashCount = trashedDocs().length;
  document.getElementById("statsRow").innerHTML = `
    <div class="stat-card"><div class="num">${total}</div><div class="lbl">Documenti totali</div></div>
    <div class="stat-card red"><div class="num">${expired}</div><div class="lbl">Scaduti</div></div>
    <div class="stat-card yellow"><div class="num">${warn}</div><div class="lbl">In scadenza (60gg)</div></div>
  `;

  const grid = document.getElementById("catGrid");
  const cats = getAllCategories();
  grid.innerHTML = cats.map(cat => {
    const docsInCat = docs.filter(d => d.category === cat.id);
    const expiredCount = docsInCat.filter(d => computeStatus(d) === "expired").length;
    return `
      <div class="cat-card" onclick="openCategory('${cat.id}')">
        ${expiredCount > 0 ? `<div class="badge">${expiredCount}</div>` : ""}
        <div class="icon">${cat.icon}</div>
        <div class="name">${escapeHtml(cat.name)}</div>
        <div class="count">${docsInCat.length} documento${docsInCat.length===1?"":"i"}</div>
      </div>`;
  }).join("") + `
      <div class="cat-card" onclick="addCustomCategory()" style="border:2px dashed var(--border); display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
        <div class="icon">➕</div>
        <div class="name">Nuova categoria</div>
      </div>
      <div class="cat-card" onclick="openTrash()" style="background:#fff5f5;">
        ${trashCount > 0 ? `<div class="badge" style="background:var(--gray);">${trashCount}</div>` : ""}
        <div class="icon">🗑️</div>
        <div class="name">Cestino</div>
        <div class="count">${trashCount} documento${trashCount===1?"":"i"}</div>
      </div>`;
}

function openCategory(catId){
  currentCategory = catId;
  const cat = getCategory(catId);
  document.getElementById("dashboardView").style.display = "none";
  document.getElementById("categoryView").style.display = "block";
  document.getElementById("headerBack").style.display = "inline";
  document.getElementById("headerBack").onclick = renderDashboard;
  document.getElementById("headerTitle").textContent = `${cat.icon} ${cat.name}`;
  document.getElementById("fabAdd").style.display = "block";
  document.getElementById("searchBox").value = "";
  document.getElementById("filterStatus").value = "";
  renderDocs();
}

function openTrash(){
  currentCategory = "__trash__";
  document.getElementById("dashboardView").style.display = "none";
  document.getElementById("categoryView").style.display = "block";
  document.getElementById("headerBack").style.display = "inline";
  document.getElementById("headerBack").onclick = renderDashboard;
  document.getElementById("headerTitle").textContent = "🗑️ Cestino";
  document.getElementById("fabAdd").style.display = "none";
  document.getElementById("searchBox").value = "";
  document.getElementById("filterStatus").value = "";
  renderDocs();
}

let catSelection = new Set();

function renderDocs(){
  if (currentCategory === "__trash__"){ renderTrash(); return; }
  const search = (document.getElementById("searchBox").value || "").toLowerCase();
  const statusFilter = document.getElementById("filterStatus").value;
  let docs = activeDocs().filter(d => d.category === currentCategory);
  if (search) docs = docs.filter(d => (d.name||"").toLowerCase().includes(search));
  if (statusFilter) docs = docs.filter(d => computeStatus(d) === statusFilter);
  docs.sort((a,b) => (a.name||"").localeCompare(b.name||""));

  const wrap = document.getElementById("docsTableWrap");
  catSelection = new Set([...catSelection].filter(id => docs.some(d => d.id === id)));

  if (docs.length === 0){
    wrap.innerHTML = `<div class="empty-state"><div class="emoji">📭</div>Nessun documento in questa categoria.</div>`;
    return;
  }
  const catOptions = getAllCategories().map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join("");
  const allSelected = docs.length > 0 && docs.every(d => catSelection.has(d.id));
  wrap.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
      <label style="display:flex; align-items:center; gap:6px; font-size:14px; cursor:pointer;">
        <input type="checkbox" ${allSelected ? "checked" : ""} onchange="toggleSelectAllCat(this.checked)">
        Seleziona tutto (${catSelection.size} selezionati)
      </label>
      <select onchange="bulkMove(this.value); this.value='';" style="padding:8px; border:1px solid var(--border); border-radius:8px; font-size:13px;" ${catSelection.size===0?"disabled":""}>
        <option value="">Sposta selezionati in...</option>
        ${catOptions}
      </select>
      <button class="btn btn-danger" onclick="bulkTrash()" ${catSelection.size===0?"disabled":""}>🗑️ Cestina selezionati</button>
    </div>
    <table>
      <thead><tr><th style="width:36px;"></th><th>Nome</th><th>Emissione</th><th>Scadenza</th><th>Stato</th><th>Note</th><th>Sposta in</th><th></th></tr></thead>
      <tbody>
        ${docs.map(d => {
          const status = computeStatus(d);
          const checked = catSelection.has(d.id);
          return `<tr>
            <td data-label=""><input type="checkbox" ${checked ? "checked" : ""} onchange="toggleCatSelect('${d.id}', this.checked)"></td>
            <td data-label="Nome"><strong>${escapeHtml(d.name||"-")}</strong></td>
            <td data-label="Emissione">${formatDate(d.issueDate)}</td>
            <td data-label="Scadenza">${formatDate(d.expiryDate) || "-"}</td>
            <td data-label="Stato"><span class="status-dot ${status}"></span>${STATUS_LABEL[status]}</td>
            <td data-label="Note">${escapeHtml(d.notes||"")}</td>
            <td data-label="Sposta in">
              <select onchange="quickMove('${d.id}', this.value)" style="padding:6px; border:1px solid var(--border); border-radius:6px; font-size:12px;">
                <option value="">Sposta...</option>
                ${catOptions}
              </select>
            </td>
            <td data-label="">
              <div class="row-actions">
                ${d.fileUrl ? `<button class="icon-btn" onclick="window.open(viewerUrlFor('${d.fileUrl}'),'_blank')">👁️ Vedi</button>` : ""}
                <button class="icon-btn" onclick="openDocModal('${d.id}')">✏️ Modifica</button>
                <button class="icon-btn" onclick="moveToTrash('${d.id}')" title="Sposta nel cestino">🗑️</button>
              </div>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

function toggleCatSelect(docId, checked){
  if (checked) catSelection.add(docId); else catSelection.delete(docId);
  renderDocs();
}
function toggleSelectAllCat(checked){
  const docs = activeDocs().filter(d => d.category === currentCategory);
  if (checked) docs.forEach(d => catSelection.add(d.id));
  else catSelection.clear();
  renderDocs();
}
async function bulkMove(newCategory){
  if (!newCategory) return;
  const ids = [...catSelection];
  if (ids.length === 0) return;
  if (!confirm(`Spostare ${ids.length} documenti selezionati in "${getCategory(newCategory).name}"?`)) return;
  for (const id of ids){
    try { await db.collection(DOCS_COLLECTION).doc(id).update({ category: newCategory, updatedAt: new Date().toISOString() }); }
    catch(e){ console.error(e); }
  }
  catSelection.clear();
}
async function bulkTrash(){
  const ids = [...catSelection];
  if (ids.length === 0) return;
  if (!confirm(`Spostare ${ids.length} documenti selezionati nel cestino?`)) return;
  for (const id of ids){
    try { await db.collection(DOCS_COLLECTION).doc(id).update({ deleted: true, deletedAt: new Date().toISOString() }); }
    catch(e){ console.error(e); }
  }
  catSelection.clear();
}

let trashSelection = new Set();

function renderTrash(){
  const docs = trashedDocs().sort((a,b) => (a.name||"").localeCompare(b.name||""));
  const wrap = document.getElementById("docsTableWrap");
  // pulisci selezioni di documenti non più presenti
  trashSelection = new Set([...trashSelection].filter(id => docs.some(d => d.id === id)));

  if (docs.length === 0){
    wrap.innerHTML = `<div class="empty-state"><div class="emoji">🗑️</div>Il cestino è vuoto.</div>`;
    return;
  }
  const allSelected = docs.length > 0 && docs.every(d => trashSelection.has(d.id));
  wrap.innerHTML = `
    <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
      <label style="display:flex; align-items:center; gap:6px; font-size:14px; cursor:pointer;">
        <input type="checkbox" id="trashSelectAll" ${allSelected ? "checked" : ""} onchange="toggleSelectAllTrash(this.checked)">
        Seleziona tutto (${trashSelection.size} selezionati)
      </label>
      <button class="btn btn-ghost" onclick="bulkRestore()" ${trashSelection.size===0?"disabled":""}>↩️ Ripristina selezionati</button>
      <button class="btn btn-danger" onclick="bulkPermanentDelete()" ${trashSelection.size===0?"disabled":""}>❌ Elimina definitivamente selezionati</button>
    </div>
    <table>
      <thead><tr><th style="width:36px;"></th><th>Nome</th><th>Categoria</th><th>Note</th><th></th></tr></thead>
      <tbody>
        ${docs.map(d => {
          const cat = getCategory(d.category);
          const checked = trashSelection.has(d.id);
          return `<tr>
            <td data-label=""><input type="checkbox" ${checked ? "checked" : ""} onchange="toggleTrashSelect('${d.id}', this.checked)"></td>
            <td data-label="Nome"><strong>${escapeHtml(d.name||"-")}</strong></td>
            <td data-label="Categoria">${cat.icon} ${escapeHtml(cat.name)}</td>
            <td data-label="Note">${escapeHtml(d.notes||"")}</td>
            <td data-label="">
              <div class="row-actions">
                ${d.fileUrl ? `<button class="icon-btn" onclick="window.open(viewerUrlFor('${d.fileUrl}'),'_blank')">👁️ Vedi</button>` : ""}
                <button class="icon-btn" onclick="restoreFromTrash('${d.id}')">↩️ Ripristina</button>
                <button class="icon-btn" onclick="permanentDelete('${d.id}')" style="color:var(--red); border-color:var(--red);">❌ Elimina def.</button>
              </div>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

function toggleTrashSelect(docId, checked){
  if (checked) trashSelection.add(docId); else trashSelection.delete(docId);
  renderTrash();
}
function toggleSelectAllTrash(checked){
  const docs = trashedDocs();
  if (checked) docs.forEach(d => trashSelection.add(d.id));
  else trashSelection.clear();
  renderTrash();
}
async function bulkRestore(){
  const ids = [...trashSelection];
  if (ids.length === 0) return;
  if (!confirm(`Ripristinare ${ids.length} documenti selezionati?`)) return;
  for (const id of ids){
    try { await db.collection(DOCS_COLLECTION).doc(id).update({ deleted: false, deletedAt: null }); }
    catch(e){ console.error(e); }
  }
  trashSelection.clear();
}
async function bulkPermanentDelete(){
  const ids = [...trashSelection];
  if (ids.length === 0) return;
  if (!confirm(`Eliminare DEFINITIVAMENTE ${ids.length} documenti selezionati? I file verranno rimossi anche da Cloudinary. L'operazione non è reversibile.`)) return;
  for (const id of ids){
    const d = allDocs.find(x => x.id === id);
    try {
      if (d && d.fileUrl) await deleteFromCloudinary(d.fileUrl).catch(e => console.warn("Cloudinary delete warning:", e.message));
      await db.collection(DOCS_COLLECTION).doc(id).delete();
    } catch(e){ console.error(e); }
  }
  trashSelection.clear();
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function formatDate(iso){ if(!iso) return ""; const d = new Date(iso); return d.toLocaleDateString("it-IT"); }

// ---------- SPOSTA / CESTINO ----------
async function quickMove(docId, newCategory){
  if (!newCategory) return;
  try {
    await db.collection(DOCS_COLLECTION).doc(docId).update({ category: newCategory, updatedAt: new Date().toISOString() });
  } catch(e){
    alert("Errore spostamento: " + e.message);
  }
}
async function moveToTrash(docId){
  if (!confirm("Spostare questo documento nel cestino?")) return;
  try {
    await db.collection(DOCS_COLLECTION).doc(docId).update({ deleted: true, deletedAt: new Date().toISOString() });
  } catch(e){
    alert("Errore: " + e.message);
  }
}
async function restoreFromTrash(docId){
  try {
    await db.collection(DOCS_COLLECTION).doc(docId).update({ deleted: false, deletedAt: null });
  } catch(e){
    alert("Errore: " + e.message);
  }
}
async function permanentDelete(docId){
  const d = allDocs.find(x => x.id === docId);
  if (!d) return;
  if (!confirm(`Eliminare definitivamente "${d.name}"? Il file verrà rimosso anche da Cloudinary. L'operazione non è reversibile.`)) return;
  try {
    if (d.fileUrl){
      await deleteFromCloudinary(d.fileUrl).catch(e => console.warn("Cloudinary delete warning:", e.message));
    }
    await db.collection(DOCS_COLLECTION).doc(docId).delete();
  } catch(e){
    alert("Errore eliminazione: " + e.message);
  }
}

// ---------- MODAL ----------
function openDocModal(docId){
  editingDocId = docId || null;
  const catSelect = document.getElementById("fCategory");
  catSelect.innerHTML = getAllCategories().map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join("");
  document.getElementById("currentFileHint").textContent = "";
  document.getElementById("uploadProgress").style.display = "none";
  document.getElementById("fFile").value = "";

  if (editingDocId){
    const d = allDocs.find(x => x.id === editingDocId);
    document.getElementById("modalTitle").textContent = "Modifica documento";
    document.getElementById("fName").value = d.name || "";
    catSelect.value = d.category || currentCategory || CATEGORIES[0].id;
    document.getElementById("fIssueDate").value = d.issueDate || "";
    document.getElementById("fExpiryOverride").value = d.expiryOverride || "";
    document.getElementById("fNotes").value = d.notes || "";
    document.getElementById("deleteBtn").style.display = "block";
    document.getElementById("deleteBtn").textContent = "Sposta nel cestino";
    if (d.fileUrl) document.getElementById("currentFileHint").textContent = "File attuale: " + (d.fileName || "documento caricato");
  } else {
    document.getElementById("modalTitle").textContent = "Nuovo documento";
    document.getElementById("fName").value = "";
    catSelect.value = (currentCategory && currentCategory !== "__trash__") ? currentCategory : getAllCategories()[0].id;
    document.getElementById("fIssueDate").value = "";
    document.getElementById("fExpiryOverride").value = "";
    document.getElementById("fNotes").value = "";
    document.getElementById("deleteBtn").style.display = "none";
  }
  updateExpiryHint();
  catSelect.onchange = updateExpiryHint;
  document.getElementById("fIssueDate").oninput = updateExpiryHint;
  document.getElementById("modalOverlay").classList.add("open");
}
function closeDocModal(){
  document.getElementById("modalOverlay").classList.remove("open");
  editingDocId = null;
}
function updateExpiryHint(){
  const cat = getCategory(document.getElementById("fCategory").value);
  const issueDate = document.getElementById("fIssueDate").value;
  const hint = document.getElementById("expiryHint");
  if (cat.expiryMonths == null){
    hint.textContent = "Questa categoria non ha una scadenza standard: imposta manualmente una data se necessario.";
  } else if (issueDate){
    const d = new Date(issueDate);
    d.setMonth(d.getMonth() + cat.expiryMonths);
    hint.textContent = `Scadenza calcolata automaticamente (${cat.expiryMonths} mesi): ${d.toLocaleDateString("it-IT")}`;
  } else {
    hint.textContent = `Validità standard di questa categoria: ${cat.expiryMonths} mesi dalla data di emissione.`;
  }
}

function computeExpiryDate(catId, issueDate, override){
  if (override) return override;
  const cat = getCategory(catId);
  if (cat.expiryMonths == null || !issueDate) return null;
  const d = new Date(issueDate);
  d.setMonth(d.getMonth() + cat.expiryMonths);
  return d.toISOString().slice(0,10);
}

// ---------- SAVE / DELETE ----------
async function saveDoc(){
  const name = document.getElementById("fName").value.trim();
  const category = document.getElementById("fCategory").value;
  const issueDate = document.getElementById("fIssueDate").value || null;
  const expiryOverride = document.getElementById("fExpiryOverride").value || null;
  const notes = document.getElementById("fNotes").value.trim();
  const fileInput = document.getElementById("fFile");

  if (!name){ alert("Inserisci il nome del dipendente/cliente."); return; }

  const expiryDate = computeExpiryDate(category, issueDate, expiryOverride);

  let fileUrl = null, fileName = null;
  if (editingDocId){
    const existing = allDocs.find(x => x.id === editingDocId);
    fileUrl = existing.fileUrl || null;
    fileName = existing.fileName || null;
  }

  if (fileInput.files && fileInput.files[0]){
    try {
      const uploaded = await uploadToCloudinary(fileInput.files[0]);
      fileUrl = uploaded.url;
      fileName = fileInput.files[0].name;
    } catch(e){
      alert("Errore durante il caricamento del file: " + e.message);
      return;
    }
  }

  const payload = { name, category, issueDate, expiryOverride, expiryDate, notes, fileUrl, fileName, updatedAt: new Date().toISOString() };

  try {
    if (editingDocId){
      await db.collection(DOCS_COLLECTION).doc(editingDocId).update(payload);
    } else {
      payload.createdAt = new Date().toISOString();
      payload.deleted = false;
      await db.collection(DOCS_COLLECTION).add(payload);
    }
    closeDocModal();
  } catch(e){
    alert("Errore salvataggio: " + e.message);
  }
}

async function deleteCurrentDoc(){
  if (!editingDocId) return;
  await moveToTrash(editingDocId);
  closeDocModal();
}

// ---------- CLOUDINARY UPLOAD ----------
function uploadToCloudinary(file){
  return new Promise((resolve, reject) => {
    const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    const progressWrap = document.getElementById("uploadProgress");
    const bar = document.getElementById("uploadBar");
    progressWrap.style.display = "block";
    xhr.upload.onprogress = e => {
      if (e.lengthComputable){
        bar.style.width = Math.round((e.loaded / e.total) * 100) + "%";
      }
    };
    xhr.onload = () => {
      progressWrap.style.display = "none";
      if (xhr.status >= 200 && xhr.status < 300){
        const res = JSON.parse(xhr.responseText);
        resolve({ url: res.secure_url });
      } else {
        reject(new Error("Upload fallito (" + xhr.status + ")"));
      }
    };
    xhr.onerror = () => { progressWrap.style.display = "none"; reject(new Error("Errore di rete durante l'upload")); };
    xhr.send(formData);
  });
}

// ---------- CLOUDINARY DELETE (signed) ----------
async function sha1Hex(str){
  const enc = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-1", enc);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,"0")).join("");
}
async function deleteFromCloudinary(fileUrl){
  const match = fileUrl.match(/\/(image|video|raw)\/upload\/(?:[^/]*\/)*?(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+(?:\?.*)?$/);
  if (!match) return;
  const resourceType = match[1];
  const publicId = match[2];
  const timestamp = Math.floor(Date.now()/1000);
  const paramsToSign = `public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
  const signature = await sha1Hex(paramsToSign);

  const form = new FormData();
  form.append("public_id", publicId);
  form.append("timestamp", timestamp);
  form.append("api_key", CLOUDINARY_API_KEY);
  form.append("signature", signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/destroy`, { method: "POST", body: form });
  if (!res.ok){
    const data = await res.json().catch(()=>({}));
    throw new Error(data.error?.message || "Eliminazione Cloudinary fallita");
  }
}

// Register service worker for PWA
if ("serviceWorker" in navigator){
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(()=>{});
  });
}
