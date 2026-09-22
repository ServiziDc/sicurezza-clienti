// Categorie documenti sicurezza.
// expiryMonths: numero di mesi di validità standard dalla data di emissione (null = nessuna scadenza fissa / da valutare caso per caso)
const CATEGORIES = [
  { id: "idoneita_sanitaria", name: "Idoneità Sanitaria", icon: "🩺", expiryMonths: 24 },
  { id: "formazione_generale", name: "Formazione Generale", icon: "📘", expiryMonths: null },
  { id: "formazione_specifica", name: "Formazione Specifica / Aggiornamento", icon: "📗", expiryMonths: 60 },
  { id: "antincendio", name: "Nomine e Formazione Antincendio", icon: "🧯", expiryMonths: 36 },
  { id: "primo_soccorso", name: "Nomine e Formazione Primo Soccorso", icon: "⛑️", expiryMonths: 36 },
  { id: "pav_pes_pei", name: "Nomina PAV - PES - PEI", icon: "⚡", expiryMonths: null },
  { id: "dpi", name: "Verbale Consegna DPI", icon: "🦺", expiryMonths: null },
  { id: "dpi_formazione", name: "Formazione DPI III Categoria", icon: "🪖", expiryMonths: 36 },
  { id: "fgas", name: "F-GAS (Attestati / Tesserini)", icon: "❄️", expiryMonths: 60 },
  { id: "rspp", name: "Nomina e Formazione RSPP", icon: "🏗️", expiryMonths: 60 },
  { id: "preposto", name: "Nomina e Formazione Preposto", icon: "👷", expiryMonths: 60 },
  { id: "rls", name: "Nomina e Formazione RLS", icon: "🗣️", expiryMonths: null },
  { id: "medico_competente", name: "Nomina Medico Competente", icon: "⚕️", expiryMonths: null },
  { id: "documenti_identita", name: "Documenti Identità", icon: "🪪", expiryMonths: null },
  { id: "tesserini", name: "Tesserini di Riconoscimento", icon: "🎫", expiryMonths: null },
  { id: "unilav", name: "UNILAV Assunzione", icon: "📄", expiryMonths: null },
  { id: "distacchi", name: "Distacchi", icon: "🔁", expiryMonths: null },
  { id: "cud", name: "CUD", icon: "💶", expiryMonths: null },
  { id: "durc_visura", name: "DURC + Visura + Vari", icon: "🏛️", expiryMonths: 4 },
  { id: "dvr", name: "DVR", icon: "📋", expiryMonths: null },
  { id: "libretti_veicoli", name: "Libretti Veicoli", icon: "🚐", expiryMonths: null },
  { id: "vestiario", name: "Vestiario Dipendenti", icon: "👕", expiryMonths: null },
  { id: "firme", name: "Firme e Timbri", icon: "✍️", expiryMonths: null },
  { id: "documenti_word", name: "Documenti in Word", icon: "📝", expiryMonths: null },
  { id: "altro", name: "Altro", icon: "📁", expiryMonths: null },
];

function getCategory(id){
  return CATEGORIES.find(c => c.id === id) || { id, name: id, icon:"📁", expiryMonths:null };
}
