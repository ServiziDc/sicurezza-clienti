// Configurazione Firebase (progetto gama-service)
const firebaseConfig = {
  apiKey: "AIzaSyCp7WCI9wWBH1hLNXdYA0LTvRmKYjVo53o",
  authDomain: "gama-service.firebaseapp.com",
  projectId: "gama-service",
  storageBucket: "gama-service.firebasestorage.app",
  messagingSenderId: "440236038955",
  appId: "1:440236038955:web:24eaa8dca617b54b1b836e",
  measurementId: "G-VHEXPTJFWX"
};

// Configurazione Cloudinary
const CLOUDINARY_CLOUD_NAME = "n784cou4";
const CLOUDINARY_UPLOAD_PRESET = "sicurezza_clienti";
const CLOUDINARY_API_KEY = "251883537552826";
const CLOUDINARY_API_SECRET = "eczOsvsZvOPRqURC1D63hLdBbjY";

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const DOCS_COLLECTION = "sicurezza_documenti";
const CUSTOM_CATEGORIES_COLLECTION = "sicurezza_categorie_custom";
