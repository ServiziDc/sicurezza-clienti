function viewerUrlFor(fileUrl){
  const ext = (fileUrl.split(".").pop() || "").toLowerCase().split("?")[0];
  if (ext === "doc" || ext === "docx" || ext === "xls" || ext === "xlsx" || ext === "ppt" || ext === "pptx"){
    return "https://docs.google.com/viewer?url=" + encodeURIComponent(fileUrl) + "&embedded=true";
  }
  return fileUrl;
}

// Restituisce sempre un array di file per un documento, sia che usi il nuovo
// campo "files" (import cartella / multi-file) sia il vecchio fileUrl singolo.
function docFiles(d){
  if (Array.isArray(d.files) && d.files.length) return d.files;
  if (d.fileUrl) return [{ url: d.fileUrl, fileName: d.fileName || "documento" }];
  return [];
}
function fileIcon(fileName){
  const ext = (fileName||"").split(".").pop().toLowerCase();
  if (ext === "pdf") return "📕";
  if (["jpg","jpeg","png","gif","webp","heic"].includes(ext)) return "🖼️";
  if (["doc","docx"].includes(ext)) return "📄";
  if (["xls","xlsx"].includes(ext)) return "📊";
  return "📎";
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
    initFolderDragDrop();
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
  try {
    await creaCategoriaSeNonEsiste(name.trim(), icon);
  } catch(e){
    alert("Errore creazione categoria: " + e.message);
  }
}

// Usata dall'import IA: crea una categoria nuova solo se non esiste già una con
// lo stesso nome (case-insensitive), sia tra quelle esistenti sia tra quelle
// appena create nello stesso import (per non farne due uguali se più file dello
// stesso tipo arrivano in parallelo durante la stessa importazione).
const categorieAppenaCreate = new Map(); // nome normalizzato -> id, valido per la durata di un import
async function creaCategoriaSeNonEsiste(name, icon){
  const norm = name.trim().toLowerCase();
  const esistente = getAllCategories().find(c => (c.name||"").trim().toLowerCase() === norm);
  if (esistente) return esistente.id;
  if (categorieAppenaCreate.has(norm)) return categorieAppenaCreate.get(norm);

  const slug = "custom_" + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") + "_" + Date.now().toString(36);
  await db.collection(CUSTOM_CATEGORIES_COLLECTION).doc(slug).set({ name: name.trim(), icon: icon || "📁", expiryMonths: null });
  customCategories.push({ id: slug, custom: true, name: name.trim(), icon: icon || "📁", expiryMonths: null }); // aggiorna subito la lista locale, senza aspettare il listener
  categorieAppenaCreate.set(norm, slug);
  return slug;
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

// ---------- IMPORT CARTELLA: RISPECCHIA LA STRUTTURA DELLO ZIP, SENZA IA ----------
// Nessuna chiamata esterna, nessuna classificazione "intelligente": la cartella
// di primo livello nello zip/nella cartella trascinata DIVENTA la sezione
// (categoria). Se una sezione con quel nome esiste già (anche solo simile,
// es. maiuscole/minuscole o spazi diversi) i file finiscono lì; altrimenti la
// sezione viene creata al volo con lo stesso nome della cartella.

function normalizzaNome(s){
  return String(s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // toglie accenti
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Trova (o crea) la categoria corrispondente al nome della cartella di primo
// livello. Match esatto sul nome normalizzato, poi match "contiene" in
// entrambe le direzioni (es. cartella "F-GAS" combacia con categoria
// "F-GAS (Attestati / Tesserini)"). Se non trova nulla, crea una categoria
// nuova con lo stesso nome della cartella.
async function trovaOCreaCategoriaPerCartella(nomeCartella){
  const norm = normalizzaNome(nomeCartella);
  if (!norm) return "altro";
  const cats = getAllCategories();

  let match = cats.find(c => normalizzaNome(c.name) === norm);
  if (!match) {
    match = cats.find(c => {
      const cn = normalizzaNome(c.name);
      return cn && (cn.includes(norm) || norm.includes(cn));
    });
  }
  if (match) return match.id;

  try {
    return await creaCategoriaSeNonEsiste(nomeCartella.trim(), "📁");
  } catch(e){
    console.error("Errore creazione categoria automatica \"" + nomeCartella + "\"", e);
    return "altro";
  }
}

function extractYear(text){
  const m = String(text || "").match(/\b(20\d{2})\b/);
  return m ? m[1] : null;
}

// Se tra i file c'è uno ZIP, lo apre e ne tira fuori i file mantenendo le
// sottocartelle interne (es. "BILIANSKI IVAN/scan1.pdf" dentro lo zip). Se lo
// zip contiene i file "sciolti" senza una cartella, usa il nome dello zip
// stesso come nome della cartella/dipendente.
async function expandZipFile(zipFile){
  const zip = await JSZip.loadAsync(zipFile);
  const zipBaseName = stripExtension(zipFile.name);
  const results = [];
  for (const entry of Object.values(zip.files)){
    if (entry.dir) continue;
    const parts = entry.name.split("/").filter(Boolean);
    const fileName = parts[parts.length - 1];
    if (!fileName || fileName.startsWith(".")) continue;
    const blob = await entry.async("blob");
    const asFile = new File([blob], fileName, { type: blob.type });
    const relPath = parts.length > 1 ? parts.join("/") : (zipBaseName + "/" + fileName);
    results.push({ file: asFile, relPath });
  }
  return results;
}
async function expandEntries(rawEntries){
  const out = [];
  for (const e of rawEntries){
    if (/\.zip$/i.test(e.file.name)){
      try {
        out.push(...(await expandZipFile(e.file)));
      } catch(err){
        console.error("Errore apertura ZIP " + e.file.name, err);
        alert("Impossibile aprire lo ZIP \"" + e.file.name + "\": " + err.message);
      }
    } else {
      out.push(e);
    }
  }
  return out;
}

// Punto d'ingresso 1: pulsante "Importa cartella" (input file con webkitdirectory)
async function importFolder(fileList){
  if (!fileList || fileList.length === 0) return;
  const rawEntries = Array.from(fileList)
    .filter(f => !f.name.startsWith("."))
    .map(f => ({ file: f, relPath: f.webkitRelativePath || f.name }));
  const entries = await expandEntries(rawEntries);
  runFolderImport(entries);
}

// Punto d'ingresso 1b: pulsante "Importa ZIP" (input file semplice, accetta .zip, anche più di uno)
async function importZipInput(fileList){
  if (!fileList || fileList.length === 0) return;
  const rawEntries = Array.from(fileList).map(f => ({ file: f, relPath: f.name }));
  const entries = await expandEntries(rawEntries);
  runFolderImport(entries);
}

// Punto d'ingresso 2: trascinamento (drag & drop) di una o più cartelle sulla pagina
async function importDroppedItems(dataTransferItems){
  const entries = [];
  const walkEntry = (entry, prefix) => new Promise(resolve => {
    if (entry.isFile){
      entry.file(file => {
        if (!file.name.startsWith(".")) entries.push({ file, relPath: prefix + file.name });
        resolve();
      }, () => resolve());
    } else if (entry.isDirectory){
      const reader = entry.createReader();
      const readBatch = () => {
        reader.readEntries(async (children) => {
          if (children.length === 0){ resolve(); return; }
          for (const child of children) await walkEntry(child, prefix + entry.name + "/");
          readBatch(); // readEntries può restituire i risultati a lotti
        }, () => resolve());
      };
      readBatch();
    } else {
      resolve();
    }
  });

  const roots = [];
  for (const item of dataTransferItems){
    const entry = item.webkitGetAsEntry && item.webkitGetAsEntry();
    if (entry) roots.push(entry);
  }
  for (const root of roots) await walkEntry(root, "");
  const expanded = await expandEntries(entries);
  runFolderImport(expanded);
}

async function runFolderImport(entries){
  if (!entries || entries.length === 0) return;

  const totalFiles = entries.length;
  const progressWrap = document.getElementById("importProgress");
  const bar = document.getElementById("importBar");
  const hint = document.getElementById("importHint");
  progressWrap.style.display = "block";

  let processed = 0, errors = 0, saltatiDoppioni = 0;

  // 1) FASE ANALISI: la cartella di primo livello del percorso diventa la
  //    sezione (creata se non esiste ancora); la cartella più interna (se
  //    c'è, es. dentro ARTIGIANI/OLEG/BILIANSKI IVAN/...) diventa il nome
  //    del documento/persona; l'anno viene letto dal percorso stesso (es.
  //    "CUD 2025" -> 2025). Nessuna chiamata esterna: tutto deterministico,
  //    la struttura dello zip viene rispecchiata così com'è.
  const cacheCategoriaCartella = new Map(); // nome cartella top-level -> categoryId (evita richieste ripetute per lo stesso nome)
  const groups = new Map(); // chiave "categoria||persona||anno" -> { categoryId, personName, year, files:[File,...] }
  for (const { file, relPath } of entries){
    const parts = relPath.split("/");
    const dirParts = parts.slice(0, -1);
    hint.textContent = `📂 Analisi (${processed + 1}/${totalFiles}): ${relPath}`;

    let categoryId = "altro";
    if (dirParts.length > 0){
      const topFolder = dirParts[0];
      const normTop = normalizzaNome(topFolder);
      if (cacheCategoriaCartella.has(normTop)){
        categoryId = cacheCategoriaCartella.get(normTop);
      } else {
        try {
          categoryId = await trovaOCreaCategoriaPerCartella(topFolder);
        } catch(e){
          console.error("Errore determinazione categoria per cartella " + topFolder, e);
          errors++;
        }
        cacheCategoriaCartella.set(normTop, categoryId);
      }
    }

    // Nome persona/documento: la cartella più interna (diversa dalla top-level,
    // così non usiamo il nome della sezione stessa come nome documento), oppure
    // il nome del file senza estensione se il file è direttamente nella sezione.
    let personName = (dirParts.length > 1) ? dirParts[dirParts.length - 1] : stripExtension(file.name);
    const year = extractYear(relPath);

    const key = categoryId + "||" + personName.trim().toLowerCase() + "||" + (year || "");
    if (!groups.has(key)) groups.set(key, { categoryId, personName, year, files: [] });
    groups.get(key).files.push(file);

    processed++;
    bar.style.width = Math.round((processed / totalFiles) * 60) + "%"; // 60% della barra per l'analisi
  }

  // 2) FASE CARICAMENTO: carica i file su Cloudinary e crea/aggiorna un documento
  //    per ogni gruppo (persona + categoria + anno), saltando i file già presenti
  //    (stesso nome file già allegato allo stesso documento = doppione, non lo ricarica)
  let uploadedSoFar = 0;
  const totalToUpload = [...groups.values()].reduce((n, g) => n + g.files.length, 0) || 1;
  let docsTouched = 0;

  for (const { categoryId, personName, year, files } of groups.values()){
    const existing = activeDocs().find(d =>
      d.category === categoryId &&
      (d.name||"").trim().toLowerCase() === personName.trim().toLowerCase() &&
      (d.year || null) === (year || null)
    );
    const existingFileNames = existing ? new Set(docFiles(existing).map(f => (f.fileName||"").toLowerCase())) : new Set();

    const uploadedFiles = [];
    for (const file of files){
      if (existingFileNames.has(file.name.toLowerCase())){
        // stesso nome file già presente su questo stesso documento: doppione, non lo ricarico
        saltatiDoppioni++;
        uploadedSoFar++;
        bar.style.width = (60 + Math.round((uploadedSoFar / totalToUpload) * 40)) + "%";
        continue;
      }
      hint.textContent = `⬆️ Caricamento: ${personName} / ${file.name} (${getCategory(categoryId).name}${year ? ", " + year : ""})`;
      try {
        const uploaded = await uploadToCloudinary(file);
        uploadedFiles.push({ url: uploaded.url, fileName: file.name });
        existingFileNames.add(file.name.toLowerCase());
      } catch(e){
        console.error("Errore caricamento " + file.name, e);
        errors++;
      }
      uploadedSoFar++;
      bar.style.width = (60 + Math.round((uploadedSoFar / totalToUpload) * 40)) + "%";
    }
    if (uploadedFiles.length === 0) continue;

    try {
      if (existing){
        const merged = docFiles(existing).concat(uploadedFiles);
        await db.collection(DOCS_COLLECTION).doc(existing.id).update({ files: merged, updatedAt: new Date().toISOString() });
      } else {
        const expiryDate = computeExpiryDate(categoryId, null, null);
        await db.collection(DOCS_COLLECTION).add({
          name: personName, category: categoryId, year: year || null,
          issueDate: null, expiryOverride: null, expiryDate,
          notes: "", files: uploadedFiles,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          deleted: false
        });
      }
      docsTouched++;
    } catch(e){
      console.error("Errore salvataggio documento " + personName + " / " + categoryId, e);
      errors++;
    }
  }

  progressWrap.style.display = "none";
  bar.style.width = "0%";
  const folderInputEl = document.getElementById("folderInput");
  if (folderInputEl) folderInputEl.value = "";
  const zipInputEl = document.getElementById("zipInput");
  if (zipInputEl) zipInputEl.value = "";

  let msg = `Import completato: ${docsTouched} documenti creati/aggiornati.`;
  if (saltatiDoppioni > 0) msg += ` ${saltatiDoppioni} file già presenti sono stati saltati (doppioni).`;
  if (errors > 0) msg += ` ${errors} errori: controlla la console per i dettagli.`;
  alert(msg);
}

function stripExtension(fileName){
  const idx = fileName.lastIndexOf(".");
  return idx > 0 ? fileName.slice(0, idx) : fileName;
}

// ---------- ELIMINA TUTTI I DOCUMENTI (ripartenza pulita) ----------
async function deleteAllDocuments(){
  const total = allDocs.length;
  const totalCustomCats = customCategories.length;
  if (total === 0 && totalCustomCats === 0){ alert("Non c'è nulla da eliminare."); return; }
  const typed = prompt(`Stai per eliminare DEFINITIVAMENTE tutti i ${total} documenti (attivi + cestino), i relativi file su Cloudinary, e tutte le ${totalCustomCats} sezioni personalizzate create finora (le sezioni di base restano, pronte per essere riempite da zero).\nQuesta operazione NON è reversibile.\n\nScrivi CANCELLA per confermare:`);
  if (typed !== "CANCELLA") { alert("Operazione annullata."); return; }

  const progressWrap = document.getElementById("importProgress");
  const bar = document.getElementById("importBar");
  const hint = document.getElementById("importHint");
  progressWrap.style.display = "block";

  const docsToDelete = allDocs.slice();
  let done = 0, errors = 0;
  const totalSteps = docsToDelete.length + totalCustomCats;
  for (const d of docsToDelete){
    hint.textContent = `🗑️ Eliminazione documento ${done + 1} di ${docsToDelete.length}: ${d.name || d.id}`;
    try {
      for (const f of docFiles(d)){
        await deleteFromCloudinary(f.url).catch(e => console.warn("Cloudinary delete warning:", e.message));
      }
      await db.collection(DOCS_COLLECTION).doc(d.id).delete();
    } catch(e){
      console.error("Errore eliminazione " + d.id, e);
      errors++;
    }
    done++;
    bar.style.width = Math.round((done / (totalSteps || 1)) * 100) + "%";
  }

  // Ricrea le sezioni da zero: elimina tutte le categorie personalizzate,
  // così restano solo quelle di base (già allineate allo screenshot).
  for (const c of customCategories.slice()){
    hint.textContent = `🔄 Rimozione sezione personalizzata: ${c.name}`;
    try {
      await db.collection(CUSTOM_CATEGORIES_COLLECTION).doc(c.id).delete();
    } catch(e){
      console.error("Errore eliminazione categoria " + c.id, e);
      errors++;
    }
    done++;
    bar.style.width = Math.round((done / (totalSteps || 1)) * 100) + "%";
  }
  customCategories = [];
  categorieAppenaCreate.clear();

  progressWrap.style.display = "none";
  bar.style.width = "0%";
  alert(errors > 0 ? `Eliminati ${done - errors} elementi, ${errors} errori.` : `Tutto eliminato: documenti e sezioni personalizzate. Le sezioni di base sono pronte da riempire da zero.`);
}

// ---------- DRAG & DROP CARTELLE ----------
// Listener a livello di documento (non solo sulla zona visibile): così funziona
// ovunque si trascini il mouse, indipendentemente da cosa c'è sotto il puntatore.
let dragCounter = 0;
function canImportNow(){
  // L'import funziona ovunque nell'app (dashboard o dentro una categoria):
  // la categoria di ogni file viene decisa dall'IA, non dalla vista corrente.
  return document.getElementById("appScreen").style.display !== "none";
}
function initFolderDragDrop(){
  if (document.body.dataset.dndReady) return;
  document.body.dataset.dndReady = "1";
  const overlay = document.getElementById("dropOverlay");

  document.addEventListener("dragenter", e => {
    if (!canImportNow()) return;
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types||[]).includes("Files")) return;
    e.preventDefault();
    dragCounter++;
    overlay.style.display = "flex";
  });
  document.addEventListener("dragover", e => {
    if (!canImportNow()) return;
    e.preventDefault();
  });
  document.addEventListener("dragleave", () => {
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) overlay.style.display = "none";
  });
  document.addEventListener("drop", e => {
    if (!canImportNow()){ return; }
    e.preventDefault();
    dragCounter = 0;
    overlay.style.display = "none";
    if (!e.dataTransfer || !e.dataTransfer.items || e.dataTransfer.items.length === 0) return;
    importDroppedItems(Array.from(e.dataTransfer.items));
  });
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
      <thead><tr><th style="width:36px;"></th><th>Nome</th><th>Emissione</th><th>Scadenza</th><th>Stato</th><th>Note</th><th>Sposta in</th><th>File</th><th></th></tr></thead>
      <tbody>
        ${docs.map(d => {
          const status = computeStatus(d);
          const checked = catSelection.has(d.id);
          return `<tr>
            <td data-label=""><input type="checkbox" ${checked ? "checked" : ""} onchange="toggleCatSelect('${d.id}', this.checked)"></td>
            <td data-label="Nome"><strong>${escapeHtml(d.name||"-")}</strong>${d.year ? ` <span style="color:var(--gray); font-size:12px;">(${d.year})</span>` : ""}</td>
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
            <td data-label="File">
              <div class="row-actions" style="flex-wrap:wrap;">
                ${docFiles(d).map(f => `<button class="icon-btn" title="${escapeHtml(f.fileName||"")}" onclick="window.open(viewerUrlFor('${f.url}'),'_blank')">${fileIcon(f.fileName)} ${escapeHtml((f.fileName||"file").slice(0,18))}</button>`).join("")}
              </div>
            </td>
            <td data-label="">
              <div class="row-actions">
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
      <thead><tr><th style="width:36px;"></th><th>Nome</th><th>Categoria</th><th>Note</th><th>File</th><th></th></tr></thead>
      <tbody>
        ${docs.map(d => {
          const cat = getCategory(d.category);
          const checked = trashSelection.has(d.id);
          return `<tr>
            <td data-label=""><input type="checkbox" ${checked ? "checked" : ""} onchange="toggleTrashSelect('${d.id}', this.checked)"></td>
            <td data-label="Nome"><strong>${escapeHtml(d.name||"-")}</strong></td>
            <td data-label="Categoria">${cat.icon} ${escapeHtml(cat.name)}</td>
            <td data-label="Note">${escapeHtml(d.notes||"")}</td>
            <td data-label="File">
              <div class="row-actions" style="flex-wrap:wrap;">
                ${docFiles(d).map(f => `<button class="icon-btn" title="${escapeHtml(f.fileName||"")}" onclick="window.open(viewerUrlFor('${f.url}'),'_blank')">${fileIcon(f.fileName)} ${escapeHtml((f.fileName||"file").slice(0,18))}</button>`).join("")}
              </div>
            </td>
            <td data-label="">
              <div class="row-actions">
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
      if (d) for (const f of docFiles(d)) await deleteFromCloudinary(f.url).catch(e => console.warn("Cloudinary delete warning:", e.message));
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
  if (!confirm(`Eliminare definitivamente "${d.name}"? I file verranno rimossi anche da Cloudinary. L'operazione non è reversibile.`)) return;
  try {
    for (const f of docFiles(d)){
      await deleteFromCloudinary(f.url).catch(e => console.warn("Cloudinary delete warning:", e.message));
    }
    await db.collection(DOCS_COLLECTION).doc(docId).delete();
  } catch(e){
    alert("Errore eliminazione: " + e.message);
  }
}

// ---------- MODAL ----------
let modalFiles = []; // file già presenti sul documento in modifica (eventualmente ridotti da removeModalFile)
let modalOriginalFiles = []; // snapshot dei file al momento dell'apertura, per sapere cosa è stato rimosso

function renderModalFiles(){
  const wrap = document.getElementById("currentFileHint");
  if (modalFiles.length === 0){ wrap.innerHTML = ""; return; }
  wrap.innerHTML = "File attuali:<br>" + modalFiles.map((f, i) => `
    <span style="display:inline-flex; align-items:center; gap:4px; background:#f0f4f8; border-radius:6px; padding:3px 8px; margin:3px 4px 0 0; font-size:12px;">
      <a href="${viewerUrlFor(f.url)}" target="_blank" style="color:var(--primary); text-decoration:none;">${fileIcon(f.fileName)} ${escapeHtml(f.fileName||"file")}</a>
      <span style="cursor:pointer; color:var(--red);" title="Rimuovi" onclick="removeModalFile(${i})">✕</span>
    </span>`).join("");
}
function removeModalFile(i){
  modalFiles.splice(i, 1);
  renderModalFiles();
}

function openDocModal(docId){
  editingDocId = docId || null;
  const catSelect = document.getElementById("fCategory");
  catSelect.innerHTML = getAllCategories().map(c => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join("");
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
    modalFiles = docFiles(d).slice();
    modalOriginalFiles = modalFiles.slice();
  } else {
    document.getElementById("modalTitle").textContent = "Nuovo documento";
    document.getElementById("fName").value = "";
    catSelect.value = (currentCategory && currentCategory !== "__trash__") ? currentCategory : getAllCategories()[0].id;
    document.getElementById("fIssueDate").value = "";
    document.getElementById("fExpiryOverride").value = "";
    document.getElementById("fNotes").value = "";
    document.getElementById("deleteBtn").style.display = "none";
    modalFiles = [];
    modalOriginalFiles = [];
  }
  renderModalFiles();
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

  const files = modalFiles.slice(); // file esistenti rimasti dopo eventuali rimozioni

  if (fileInput.files && fileInput.files.length){
    for (const f of Array.from(fileInput.files)){
      try {
        const uploaded = await uploadToCloudinary(f);
        files.push({ url: uploaded.url, fileName: f.name });
      } catch(e){
        alert("Errore durante il caricamento del file \"" + f.name + "\": " + e.message);
        return;
      }
    }
  }

  const payload = { name, category, issueDate, expiryOverride, expiryDate, notes, files, updatedAt: new Date().toISOString() };

  try {
    if (editingDocId){
      await db.collection(DOCS_COLLECTION).doc(editingDocId).update(payload);
      const removed = modalOriginalFiles.filter(orig => !files.some(f => f.url === orig.url));
      for (const f of removed){
        await deleteFromCloudinary(f.url).catch(e => console.warn("Cloudinary delete warning:", e.message));
      }
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
