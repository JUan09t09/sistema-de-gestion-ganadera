// ============================================================
// MI FINCA — Gestión Ganadera
// app.js — Toda la lógica JavaScript de la aplicación
// ============================================================

// ============================================================
// CONFIGURACIÓN FIREBASE (fija para todos los usuarios)
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAk1p71Kws4P6FBJINkpvat7PtXlYR3oA0",
  authDomain: "finca-e350f.firebaseapp.com",
  projectId: "finca-e350f",
  storageBucket: "finca-e350f.firebasestorage.app",
  messagingSenderId: "465392032945",
  appId: "1:465392032945:web:99e6eb26e5388291f01690",
  measurementId: "G-JC35C3W5Y1"
};

const DB_CACHE_KEY = 'miFincaDBCache';

let firebaseApp    = null;
let auth           = null;
let firestore      = null;
let usuarioActual  = null;
let db             = crearDBVacia();
let idAnimalEnEdicion = null;
let idFichaActual    = null;
let syncTimeout    = null;
let modoTab        = 'login';

function crearDBVacia() {
  return {
    config: { nombre: 'Mi Finca', propietario: 'Administrador', lugar: '' },
    animales: [], leche: [], reproductivo: [], salud: [], alimentacion: [], finanzas: [], carne: [], medicamentos: [], servicios: [],
    protocolos: protocolosICA()
  };
}

function normalizarDB(datos) {
  const base  = crearDBVacia();
  const seguro = (datos && typeof datos === 'object') ? datos : {};
  return {
    config:       Object.assign({}, base.config, seguro.config || {}),
    animales:     Array.isArray(seguro.animales)     ? seguro.animales     : [],
    leche:        Array.isArray(seguro.leche)        ? seguro.leche        : [],
    reproductivo: Array.isArray(seguro.reproductivo) ? seguro.reproductivo : [],
    salud:        Array.isArray(seguro.salud)        ? seguro.salud        : [],
    alimentacion: Array.isArray(seguro.alimentacion) ? seguro.alimentacion : [],
    finanzas:     Array.isArray(seguro.finanzas)     ? seguro.finanzas     : [],
    carne:        Array.isArray(seguro.carne)        ? seguro.carne        : [],
    medicamentos: Array.isArray(seguro.medicamentos) ? seguro.medicamentos : [],
    servicios:    Array.isArray(seguro.servicios)    ? seguro.servicios    : [],
    protocolos:   Array.isArray(seguro.protocolos)   ? seguro.protocolos   : protocolosICA()
  };
}

// Protocolos ICA estándar iniciales
function protocolosICA() {
  return [
    { id: 'P001', nombre: 'Bovino — Protocolo estándar ICA', tipo: 'bovino',
      eventos: [
        { nombre: 'Vacuna Fiebre Aftosa', tipo: 'vacuna', diasDesdeInicio: 0,    intervaloRepeticion: 180 },
        { nombre: 'Vacuna Brucelosis (hembras)', tipo: 'vacuna', diasDesdeInicio: 30,   intervaloRepeticion: 365 },
        { nombre: 'Garrapaticida (baño o inyectable)', tipo: 'desparasitacion', diasDesdeInicio: 0, intervaloRepeticion: 90 },
        { nombre: 'Desparasitante interno', tipo: 'desparasitacion', diasDesdeInicio: 0, intervaloRepeticion: 120 },
        { nombre: 'Vacuna Carbón sintomático', tipo: 'vacuna', diasDesdeInicio: 60,   intervaloRepeticion: 365 },
        { nombre: 'Vacuna Septicemia hemorrágica', tipo: 'vacuna', diasDesdeInicio: 60, intervaloRepeticion: 365 },
        { nombre: 'Vitaminas ADE', tipo: 'vitamina', diasDesdeInicio: 0, intervaloRepeticion: 90 },
      ]
    },
    { id: 'P002', nombre: 'Equino — Protocolo estándar ICA', tipo: 'equino',
      eventos: [
        { nombre: 'Vacuna Encefalomielitis', tipo: 'vacuna', diasDesdeInicio: 0,   intervaloRepeticion: 180 },
        { nombre: 'Vacuna Influenza equina', tipo: 'vacuna', diasDesdeInicio: 30,  intervaloRepeticion: 180 },
        { nombre: 'Desparasitante interno (ivermectina)', tipo: 'desparasitacion', diasDesdeInicio: 0, intervaloRepeticion: 90 },
        { nombre: 'Garrapaticida', tipo: 'desparasitacion', diasDesdeInicio: 0,  intervaloRepeticion: 90 },
        { nombre: 'Vitaminas ADE', tipo: 'vitamina', diasDesdeInicio: 0, intervaloRepeticion: 90 },
        { nombre: 'Herraje', tipo: 'herraje', diasDesdeInicio: 0, intervaloRepeticion: 60 },
      ]
    },
  ];
}

function inicializarFirebase(config) {
  try {
    if (firebase.apps.length > 0) {
      firebase.apps.forEach(function(app) { app.delete(); });
    }
    firebaseApp = firebase.initializeApp(config);
    auth        = firebase.auth();
    firestore   = firebase.firestore();

    mostrarCargando('Conectando con Firebase...');

    auth.onAuthStateChanged(function(user) {
      if (user) {
        usuarioActual = user;
        cargarDatosNube(user.uid);
      } else {
        usuarioActual = null;
        mostrarLogin();
      }
    });
  } catch(e) {
    alert('Error inicializando Firebase: ' + e.message);
  }
}

// ============================================================
// INICIO DE LA APP
// ============================================================
window.addEventListener('DOMContentLoaded', function() {
  inicializarFirebase(FIREBASE_CONFIG);

  document.querySelectorAll('.modal-overlay').forEach(function(m) {
    m.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('open'); });
  });
  document.getElementById('menu-toggle').addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', cerrarSidebar);
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') cerrarSidebar(); });
});

function mostrarCargando(texto) {
  document.getElementById('pantalla-login').style.display      = 'none';
  document.getElementById('app-principal').style.display       = 'none';
  document.getElementById('pantalla-cargando').style.display   = 'flex';
  document.getElementById('texto-cargando').textContent = texto || 'Cargando...';
}

function mostrarLogin() {
  document.getElementById('pantalla-cargando').style.display = 'none';
  document.getElementById('app-principal').style.display     = 'none';
  document.getElementById('pantalla-login').style.display    = 'flex';
  document.getElementById('login-email').focus && document.getElementById('login-email').focus();
}

function mostrarApp(user) {
  document.getElementById('pantalla-cargando').style.display = 'none';
  document.getElementById('pantalla-login').style.display    = 'none';
  document.getElementById('app-principal').style.display     = 'block';

  const nombre = db.config.propietario || user.displayName || 'Usuario';
  document.getElementById('nombre-usuario').textContent        = nombre;
  document.getElementById('email-usuario').textContent         = user.email;
  document.getElementById('avatar-inicial').textContent        = nombre[0].toUpperCase();
  document.getElementById('sidebar-titulo-finca').textContent  = '🌿 ' + db.config.nombre;

  renderDashboard();
}

// ============================================================
// AUTENTICACIÓN
// ============================================================
function cambiarTab(tab) {
  modoTab = tab;
  document.getElementById('tab-login').classList.toggle('active',   tab === 'login');
  document.getElementById('tab-registro').classList.toggle('active', tab === 'registro');
  document.getElementById('btn-accion-login').textContent = tab === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
  document.getElementById('campo-nombre').style.display  = tab === 'registro' ? 'block' : 'none';
  document.getElementById('campo-finca').style.display   = tab === 'registro' ? 'block' : 'none';
  document.getElementById('login-error').style.display   = 'none';
  document.getElementById('login-success').style.display = 'none';
}

function accionLogin() {
  const email  = document.getElementById('login-email').value.trim();
  const pass   = document.getElementById('login-password').value;
  const errDiv = document.getElementById('login-error');
  const sucDiv = document.getElementById('login-success');
  errDiv.style.display = 'none';
  sucDiv.style.display = 'none';
  if (!email || !pass) { errDiv.textContent = 'Completa correo y contraseña'; errDiv.style.display = 'block'; return; }

  const btn = document.getElementById('btn-accion-login');
  btn.disabled = true;

  if (modoTab === 'login') {
    auth.signInWithEmailAndPassword(email, pass)
      .then(function() { mostrarCargando('Cargando tu finca...'); })
      .catch(function(e) { btn.disabled = false; errDiv.textContent = tradError(e.code); errDiv.style.display = 'block'; });
  } else {
    const nombre = document.getElementById('login-nombre').value.trim() || 'Propietario';
    const finca  = document.getElementById('login-finca').value.trim()  || 'Mi Finca';
    auth.createUserWithEmailAndPassword(email, pass)
      .then(function(cred) {
        return firestore.collection('usuarios').doc(cred.user.uid).set({
          config: { nombre: finca, propietario: nombre, lugar: '' },
          animales: [], leche: [], reproductivo: [], salud: [], alimentacion: [], finanzas: [], carne: [], medicamentos: [], servicios: [],
          protocolos: protocolosICA(),
          creadoEn: firebase.firestore.FieldValue.serverTimestamp()
        });
      })
      .then(function() { mostrarCargando('Configurando tu finca...'); })
      .catch(function(e) { btn.disabled = false; errDiv.textContent = tradError(e.code); errDiv.style.display = 'block'; });
  }
}

function olvidoContrasena() {
  const email = document.getElementById('login-email').value.trim();
  if (!email) { alert('Primero ingresa tu correo electrónico'); return; }
  auth.sendPasswordResetEmail(email)
    .then(function() {
      document.getElementById('login-success').textContent    = '✅ Revisa tu correo para restablecer la contraseña';
      document.getElementById('login-success').style.display  = 'block';
    })
    .catch(function(e) {
      document.getElementById('login-error').textContent  = tradError(e.code);
      document.getElementById('login-error').style.display = 'block';
    });
}

function cerrarSesion() {
  if (!confirm('¿Cerrar sesión?')) return;
  auth.signOut().then(function() { db = crearDBVacia(); mostrarLogin(); });
}

function tradError(code) {
  const errores = {
    'auth/user-not-found':        'No existe una cuenta con ese correo',
    'auth/wrong-password':        'Contraseña incorrecta',
    'auth/email-already-in-use':  'Ese correo ya está registrado',
    'auth/weak-password':         'La contraseña debe tener al menos 6 caracteres',
    'auth/invalid-email':         'El correo no es válido',
    'auth/too-many-requests':     'Demasiados intentos. Espera unos minutos',
    'auth/network-request-failed':'Error de conexión. Verifica tu internet',
  };
  return errores[code] || 'Error: ' + code;
}

// ============================================================
// FIRESTORE — CARGA Y GUARDADO
// ============================================================
function cargarDatosNube(uid) {
  mostrarCargando('Cargando datos de tu finca...');
  setSyncState('syncing', 'Cargando...');

  firestore.collection('usuarios').doc(uid).get()
    .then(function(doc) {
      if (doc.exists) {
        db = normalizarDB(doc.data());
        localStorage.setItem(DB_CACHE_KEY, JSON.stringify(db));
      } else {
        db = crearDBVacia();
        localStorage.setItem(DB_CACHE_KEY, JSON.stringify(db));
        return firestore.collection('usuarios').doc(uid).set(db);
      }
    })
    .then(function() { setSyncState('ok', 'Sincronizado'); mostrarApp(usuarioActual); })
    .catch(function(e) {
      console.error('Error cargando datos:', e);
      setSyncState('error', 'Error de conexión');
      const cache = localStorage.getItem(DB_CACHE_KEY);
      if (cache) {
        try { db = normalizarDB(JSON.parse(cache)); } catch(ex) { db = crearDBVacia(); }
      } else { db = crearDBVacia(); }
      mostrarApp(usuarioActual);
    });
}

function guardarDB() {
  localStorage.setItem(DB_CACHE_KEY, JSON.stringify(db));
  if (!usuarioActual) return;
  setSyncState('syncing', 'Guardando...');

  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(function() {
    firestore.collection('usuarios').doc(usuarioActual.uid).set(db)
      .then(function() {
        setSyncState('ok', 'Sincronizado ✓');
        setTimeout(function() { setSyncState('ok', 'Sincronizado'); }, 2000);
      })
      .catch(function(e) {
        console.error('Error guardando:', e);
        setSyncState('error', 'Error al guardar');
      });
  }, 800);
}

function setSyncState(estado, texto) {
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-texto');
  if (!dot || !txt) return;
  dot.className = 'sync-dot' + (estado === 'syncing' ? ' syncing' : estado === 'error' ? ' error' : '');
  txt.textContent = texto;
}

// ============================================================
// NAVEGACIÓN
// ============================================================
const TITULOS = {
  dashboard:    '🏠 Panel principal',
  calendario:   '📅 Calendario de la finca',
  animales:     '🐴 Mis animales',
  leche:        '🥛 Producción de leche',
  carne:        '🥩 Producción de carne',
  reproduccion: '🧬 Reproducción',
  salud:        '💉 Salud y vacunas',
  alimentacion: '🌾 Alimentación',
  finanzas:     '💰 Control financiero',
  inventario:   '📦 Inventario general',
  protocolos:   '🛡️ Protocolos sanitarios',
};

function mostrarPagina(nombre) {
  window.scrollTo(0, 0);
  cerrarSidebar();
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  document.querySelectorAll('.nav-item').forEach(function(n) { n.classList.remove('active'); });
  document.getElementById('page-' + nombre).classList.add('active');
  document.getElementById('topbar-titulo').textContent = TITULOS[nombre];
  document.querySelectorAll('.nav-item').forEach(function(n) {
    if ((n.getAttribute('onclick') || '').indexOf(nombre) !== -1) n.classList.add('active');
  });
  if (nombre === 'dashboard')    renderDashboard();
  if (nombre === 'calendario')   renderCalendario();
  if (nombre === 'animales')     renderTablaAnimales();
  if (nombre === 'leche')        renderLeche();
  if (nombre === 'carne')        renderCarne();
  if (nombre === 'reproduccion') renderReproduccion();
  if (nombre === 'salud')        renderSalud();
  if (nombre === 'alimentacion') renderAlimentacion();
  if (nombre === 'finanzas')     renderFinanzas();
  if (nombre === 'inventario')   renderInventario();
  if (nombre === 'protocolos')   renderProtocolos();
}

function toggleSidebar() {
  const sb  = document.getElementById('sidebar');
  const ov  = document.getElementById('sidebar-overlay');
  const btn = document.getElementById('menu-toggle');
  const isOpen = sb.classList.toggle('open');
  ov.classList.toggle('active', isOpen);
  btn.textContent = isOpen ? '✕' : '☰';
}

function cerrarSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('active');
  document.getElementById('menu-toggle').textContent = '☰';
}

// ============================================================
// UTILIDADES
// ============================================================
function fmt(fecha) {
  if (!fecha) return '-';
  const [y, m, d] = fecha.split('-');
  return d + '/' + m + '/' + y;
}

function edad(nacimiento) {
  if (!nacimiento) return '-';
  const hoy   = new Date();
  const nac   = new Date(nacimiento);
  const meses = (hoy.getFullYear() - nac.getFullYear()) * 12 + (hoy.getMonth() - nac.getMonth());
  if (meses < 24) return meses + ' meses';
  return Math.floor(meses / 12) + ' años';
}

function diasPara(fecha) {
  if (!fecha) return null;
  return Math.ceil((new Date(fecha) - new Date()) / 86400000);
}

function moneda(v) {
  const n = Math.round(Number(v));
  return '$' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function nuevoId(prefijo) {
  return prefijo + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();
}

function deduplicar(arr) {
  return arr.filter(function(v, i, a) { return a.indexOf(v) === i; });
}

function badgeEstado(estado) {
  const cls = { activo: 'badge-verde', vendido: 'badge-azul', muerto: 'badge-rojo' };
  return '<span class="badge ' + (cls[estado] || 'badge-gris') + '">' + estado + '</span>';
}

function hoyISO() {
  return new Date().toISOString().split('T')[0];
}

// ============================================================
// MODALES
// ============================================================
function abrirModal(id) {
  document.getElementById(id).classList.add('open');
  if (id === 'modal-animal' && idAnimalEnEdicion === null) resetFormularioAnimal();
  if (id === 'modal-leche')  llenarSelectVacas();
  if (id === 'modal-repro')  llenarSelectHembras();
  if (id === 'modal-salud') { llenarSelectAnimales(); llenarSelectMedicamentos(); }
  if (id === 'modal-pesaje') llenarSelectAnimalesCarne();
  if (id === 'modal-servicio') llenarSelectSementales();
  if (id === 'modal-protocolo' && _idProtocoloEnEdicion === null) {
    document.getElementById('prot-nombre').value = '';
    document.getElementById('prot-tipo').value   = 'bovino';
    document.getElementById('prot-eventos-lista').innerHTML = '';
  }
  ['l-fecha','r-fecha','s-fecha','al-fecha','g-fecha','v-fecha','p-fecha','m-vencimiento','sv-fecha','ap-fecha-inicio'].forEach(function(fid) {
    const el = document.getElementById(fid);
    if (el && !el.value && fid !== 'm-vencimiento') el.value = hoyISO();
  });
  if (id === 'modal-config') {
    document.getElementById('config-nombre').value      = db.config.nombre;
    document.getElementById('config-propietario').value = db.config.propietario;
    document.getElementById('config-lugar').value       = db.config.lugar;
  }
}

function cerrarModal(id) {
  document.getElementById(id).classList.remove('open');
}

// ============================================================
// SELECTS DINÁMICOS
// ============================================================
function llenarSelectVacas() {
  const sel = document.getElementById('l-vaca');
  sel.innerHTML = '<option value="">Seleccionar vaca...</option>';
  db.animales
    .filter(function(a) { return a.tipo === 'bovino' && a.sexo === 'hembra' && a.estado === 'activo'; })
    .forEach(function(v) { sel.innerHTML += '<option value="' + v.id + '">' + v.nombre + ' (' + v.id + ')</option>'; });
}

function llenarSelectHembras() {
  const sel = document.getElementById('r-animal');
  sel.innerHTML = '<option value="">Seleccionar hembra...</option>';
  db.animales
    .filter(function(a) { return a.sexo === 'hembra' && a.estado === 'activo'; })
    .forEach(function(a) { sel.innerHTML += '<option value="' + a.id + '">' + (a.tipo === 'bovino' ? '🐄' : '🐎') + ' ' + a.nombre + '</option>'; });
}

function llenarSelectAnimales() {
  const sel = document.getElementById('s-animal');
  sel.innerHTML = '<option value="">Seleccionar animal...</option>';
  db.animales
    .filter(function(a) { return a.estado === 'activo'; })
    .forEach(function(a) { sel.innerHTML += '<option value="' + a.id + '">' + (a.tipo === 'bovino' ? '🐄' : '🐎') + ' ' + a.nombre + '</option>'; });
}

function llenarSelectAnimalesCarne() {
  const sel = document.getElementById('p-animal');
  sel.innerHTML = '<option value="">Seleccionar animal...</option>';
  db.animales
    .filter(function(a) { return a.estado === 'activo'; })
    .forEach(function(a) {
      sel.innerHTML += '<option value="' + a.id + '">' + (a.tipo === 'bovino' ? '🐄' : '🐎') + ' ' + a.nombre + ' (' + a.id + ')</option>';
    });
}

function llenarSelectMedicamentos() {
  const sel = document.getElementById('s-medicamento-inv');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Ninguno / escribir manualmente —</option>';
  db.medicamentos.forEach(function(m) {
    sel.innerHTML += '<option value="' + m.id + '">' + m.nombre + ' (' + m.cantidad + ' ' + m.unidad + ' disponibles)</option>';
  });
}

function seleccionarMedicamentoSalud(medId) {
  if (!medId) return;
  const m = db.medicamentos.find(function(x) { return x.id === medId; });
  if (!m) return;
  document.getElementById('s-medicamento').value = m.nombre;
}

function llenarSelectSementales() {
  const sel = document.getElementById('sv-semental');
  sel.innerHTML = '<option value="">Seleccionar semental...</option>';
  db.animales
    .filter(function(a) { return a.tipo === 'equino' && a.sexo === 'macho' && a.estado === 'activo' && a.estadoReproductivo === 'entero'; })
    .forEach(function(a) { sel.innerHTML += '<option value="' + a.id + '">' + a.nombre + ' (' + a.id + ')</option>'; });
  if (sel.options.length === 1) {
    sel.innerHTML += '<option value="" disabled>— No tienes caballos enteros registrados —</option>';
  }
}

// ============================================================
// GUARDAR DATOS — CONFIGURACIÓN
// ============================================================
function guardarConfig() {
  db.config.nombre      = document.getElementById('config-nombre').value      || 'Mi Finca';
  db.config.propietario = document.getElementById('config-propietario').value  || 'Administrador';
  db.config.lugar       = document.getElementById('config-lugar').value;
  guardarDB();
  document.getElementById('sidebar-titulo-finca').textContent = '🌿 ' + db.config.nombre;
  document.getElementById('nombre-usuario').textContent       = db.config.propietario;
  document.getElementById('avatar-inicial').textContent       = db.config.propietario[0].toUpperCase();
  cerrarModal('modal-config');
  alert('✅ Configuración guardada y sincronizada');
}

// ============================================================
// GUARDAR DATOS — ANIMALES
// ============================================================
function resetFormularioAnimal() {
  idAnimalEnEdicion = null;
  ['a-nombre','a-raza','a-nacimiento','a-peso','a-madre','a-padre','a-notas',
   'a-potrero','a-potrero-fecha','a-arete','a-marca-candela'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  document.getElementById('a-tipo').value        = 'bovino';
  document.getElementById('a-sexo').value        = 'hembra';
  document.getElementById('a-procedencia').value = 'nacido';
  document.getElementById('a-estado').value      = 'activo';
  document.getElementById('a-estado-reproductivo').value = 'entero';
  document.getElementById('a-foto-input').value  = '';
  fotoTemporal = null;
  actualizarPreviewFoto(null);
  actualizarVisibilidadReproductivo();
}

function actualizarVisibilidadReproductivo() {
  const tipo = document.getElementById('a-tipo').value;
  const sexo = document.getElementById('a-sexo').value;
  const grupo = document.getElementById('grupo-estado-reproductivo');
  grupo.style.display = (tipo === 'equino' && sexo === 'macho') ? 'flex' : 'none';
}

// — FOTO DEL ANIMAL —
let fotoTemporal = undefined; // undefined = sin cambios, null = quitar, string = nueva foto base64

function actualizarPreviewFoto(src) {
  const img   = document.getElementById('a-foto-preview');
  const vacio = document.getElementById('a-foto-vacio');
  if (src) {
    img.src = src;
    img.style.display   = 'block';
    vacio.style.display = 'none';
  } else {
    img.src = '';
    img.style.display   = 'none';
    vacio.style.display = 'flex';
  }
}

function cargarFotoAnimal(input) {
  const file = input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('⚠️ Selecciona un archivo de imagen'); return; }
  const reader = new FileReader();
  reader.onload = function(e) {
    // Redimensionar/comprimir la imagen para no exceder el límite de Firestore
    const img = new Image();
    img.onload = function() {
      const maxDim = 500;
      let w = img.width, h = img.height;
      if (w > h && w > maxDim)      { h = Math.round(h * maxDim / w); w = maxDim; }
      else if (h > maxDim)          { w = Math.round(w * maxDim / h); h = maxDim; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      fotoTemporal = dataUrl;
      actualizarPreviewFoto(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function quitarFotoAnimal() {
  fotoTemporal = null;
  document.getElementById('a-foto-input').value = '';
  actualizarPreviewFoto(null);
}

// Temporal para protocolo: guardamos el objeto animal en memoria mientras el modal de protocolo está abierto
let _animalPendiente = null;

function guardarAnimal() {
  const nombre = document.getElementById('a-nombre').value.trim();
  const nac    = document.getElementById('a-nacimiento').value;
  const peso   = document.getElementById('a-peso').value;
  if (!nombre || !nac || !peso) { alert('⚠️ Completa los campos obligatorios'); return; }
  const tipo   = document.getElementById('a-tipo').value;

  let foto = null;
  if (fotoTemporal === undefined) {
    if (idAnimalEnEdicion) {
      const existente = db.animales.find(function(a) { return a.id === idAnimalEnEdicion; });
      foto = (existente && existente.foto) || null;
    }
  } else {
    foto = fotoTemporal;
  }

  const animal = {
    id:          idAnimalEnEdicion || nuevoId(tipo === 'bovino' ? 'BOV' : 'EQU'),
    tipo,
    nombre,
    foto,
    sexo:        document.getElementById('a-sexo').value,
    raza:        document.getElementById('a-raza').value,
    nacimiento:  nac,
    peso:        Number(peso),
    estado:      document.getElementById('a-estado').value,
    procedencia: document.getElementById('a-procedencia').value,
    potrero:       document.getElementById('a-potrero').value.trim(),
    potreroFecha:  document.getElementById('a-potrero-fecha').value,
    estadoReproductivo: (tipo === 'equino' && document.getElementById('a-sexo').value === 'macho')
      ? document.getElementById('a-estado-reproductivo').value : null,
    arete:         document.getElementById('a-arete').value.trim(),
    marcaCandela:  document.getElementById('a-marca-candela').value.trim(),
    madre:       document.getElementById('a-madre').value,
    padre:       document.getElementById('a-padre').value,
    notas:       document.getElementById('a-notas').value,
  };

  // Si estamos editando, guardamos directamente sin preguntar protocolo
  if (idAnimalEnEdicion) {
    const i = db.animales.findIndex(function(a) { return a.id === idAnimalEnEdicion; });
    if (i !== -1) db.animales[i] = animal;
    guardarDB();
    cerrarModal('modal-animal');
    renderTablaAnimales();
    resetFormularioAnimal();
    alert('✅ Animal "' + nombre + '" actualizado');
    return;
  }

  // Animal nuevo: guardar temporal y preguntar por protocolo
  _animalPendiente = animal;
  cerrarModal('modal-animal');

  const protDisponibles = db.protocolos.filter(function(p) {
    return p.tipo === tipo || p.tipo === 'ambos';
  });

  if (protDisponibles.length === 0) {
    // No hay protocolos compatibles, guardar directo
    guardarAnimalSinProtocolo();
    return;
  }

  // Abrir modal de aplicar protocolo
  const sel = document.getElementById('ap-protocolo');
  sel.innerHTML = protDisponibles.map(function(p) {
    return '<option value="' + p.id + '">' + p.nombre + '</option>';
  }).join('');
  document.getElementById('ap-fecha-inicio').value = hoyISO();
  previsualizarProtocolo();
  abrirModal('modal-aplicar-protocolo');
}

function guardarAnimalSinProtocolo() {
  if (!_animalPendiente) return;
  db.animales.push(_animalPendiente);
  guardarDB();
  renderTablaAnimales();
  alert('✅ Animal "' + _animalPendiente.nombre + '" guardado · ID: ' + _animalPendiente.id);
  _animalPendiente = null;
  resetFormularioAnimal();
}

function editarAnimal(id) {
  const a = db.animales.find(function(x) { return x.id === id; });
  if (!a) return;
  document.getElementById('a-tipo').value        = a.tipo;
  document.getElementById('a-nombre').value      = a.nombre;
  document.getElementById('a-sexo').value        = a.sexo;
  document.getElementById('a-raza').value        = a.raza;
  document.getElementById('a-nacimiento').value  = a.nacimiento;
  document.getElementById('a-peso').value        = a.peso;
  document.getElementById('a-procedencia').value = a.procedencia;
  document.getElementById('a-estado').value      = a.estado;
  document.getElementById('a-potrero').value       = a.potrero || '';
  document.getElementById('a-potrero-fecha').value = a.potreroFecha || '';
  document.getElementById('a-estado-reproductivo').value = a.estadoReproductivo || 'entero';
  document.getElementById('a-arete').value         = a.arete || '';
  document.getElementById('a-marca-candela').value = a.marcaCandela || '';
  document.getElementById('a-madre').value       = a.madre || '';
  document.getElementById('a-padre').value       = a.padre || '';
  document.getElementById('a-notas').value       = a.notas || '';
  document.getElementById('a-foto-input').value  = '';
  fotoTemporal = undefined;
  actualizarPreviewFoto(a.foto || null);
  idAnimalEnEdicion = id;
  abrirModal('modal-animal');
  actualizarVisibilidadReproductivo();
}

function eliminarAnimal(id) {
  if (!confirm('¿Eliminar este animal?')) return;
  db.animales     = db.animales.filter(function(a) { return a.id !== id; });
  db.leche        = db.leche.filter(function(r) { return r.animalId !== id; });
  db.reproductivo = db.reproductivo.filter(function(r) { return r.animalId !== id; });
  db.salud        = db.salud.filter(function(r) { return r.animalId !== id; });
  db.carne        = db.carne.filter(function(r) { return r.animalId !== id; });
  db.servicios    = db.servicios.filter(function(r) { return r.sementalId !== id; });
  guardarDB();
  renderTablaAnimales(); renderDashboard(); renderInventario();
}

function eliminarCompleto(id) {
  const animal = db.animales.find(function(a) { return a.id === id; });
  if (!animal) return;
  if (!confirm('⚠️ Eliminar "' + animal.nombre + '" y TODOS sus registros. ¿Continuar?')) return;
  db.animales     = db.animales.filter(function(a) { return a.id !== id; });
  db.leche        = db.leche.filter(function(r) { return r.animalId !== id; });
  db.reproductivo = db.reproductivo.filter(function(r) { return r.animalId !== id; });
  db.salud        = db.salud.filter(function(r) { return r.animalId !== id; });
  db.carne        = db.carne.filter(function(r) { return r.animalId !== id; });
  db.servicios    = db.servicios.filter(function(r) { return r.sementalId !== id; });
  guardarDB();
  renderTablaAnimales(); renderDashboard(); renderLeche(); renderReproduccion(); renderSalud(); renderInventario(); renderCarne();
}

// ============================================================
// GUARDAR DATOS — MÓDULOS (con eliminación)
// ============================================================

// — LECHE —
function guardarLeche() {
  const animalId = document.getElementById('l-vaca').value;
  const fecha    = document.getElementById('l-fecha').value;
  const litros   = document.getElementById('l-litros').value;
  if (!animalId || !fecha || !litros) { alert('⚠️ Completa todos los campos'); return; }
  db.leche.push({ id: nuevoId('L'), animalId, fecha, litros: Number(litros), nota: document.getElementById('l-nota').value });
  guardarDB();
  cerrarModal('modal-leche');
  renderLeche();
  document.getElementById('l-litros').value = '';
  document.getElementById('l-nota').value   = '';
}

function eliminarLeche(id) {
  if (!confirm('¿Eliminar este registro de leche?')) return;
  db.leche = db.leche.filter(function(r) { return r.id !== id; });
  guardarDB();
  renderLeche();
  renderDashboard();
}

// — REPRODUCCIÓN —
function calcularFechaParto(fecha, tipo) {
  if (!fecha || !tipo) return null;
  const d = new Date(fecha);
  d.setDate(d.getDate() + (tipo === 'bovino' ? 283 : 340));
  return d.toISOString().split('T')[0];
}

function cambiarGestante(id, valor) {
  const r = db.reproductivo.find(function(x) { return x.id === id; });
  if (!r) return;
  r.gestante   = valor;
  const a      = db.animales.find(function(x) { return x.id === r.animalId; });
  r.fechaParto = valor === 'si' ? calcularFechaParto(r.fecha, a && a.tipo) : null;
  guardarDB();
  renderReproduccion();
}

function guardarRepro() {
  const animalId = document.getElementById('r-animal').value;
  const fecha    = document.getElementById('r-fecha').value;
  if (!animalId || !fecha) { alert('⚠️ Selecciona el animal y la fecha'); return; }
  const a          = db.animales.find(function(x) { return x.id === animalId; });
  const gestante   = document.getElementById('r-gestante').value;
  const fechaParto = gestante === 'si' ? calcularFechaParto(fecha, a && a.tipo) : null;
  db.reproductivo.push({
    id: nuevoId('R'), animalId,
    tipo:     document.getElementById('r-tipo').value,
    fecha,
    macho:    document.getElementById('r-macho').value,
    gestante, fechaParto,
    obs:      document.getElementById('r-obs').value,
  });
  guardarDB();
  cerrarModal('modal-repro');
  renderReproduccion();
  if (fechaParto) alert('✅ Gestación registrada\n🗓️ Parto estimado: ' + fmt(fechaParto));
}

function eliminarRepro(id) {
  if (!confirm('¿Eliminar este evento reproductivo?')) return;
  db.reproductivo = db.reproductivo.filter(function(r) { return r.id !== id; });
  guardarDB();
  renderReproduccion();
  renderDashboard();
}

// — SERVICIOS DE MONTA (caballos enteros) —
function guardarServicio() {
  const sementalId = document.getElementById('sv-semental').value;
  const yegua      = document.getElementById('sv-yegua').value.trim();
  const dueno      = document.getElementById('sv-dueno').value.trim();
  const fecha      = document.getElementById('sv-fecha').value;
  const valor      = document.getElementById('sv-valor').value;
  if (!sementalId || !yegua || !dueno || !fecha || !valor) { alert('⚠️ Completa los campos obligatorios'); return; }
  const semental = db.animales.find(function(a) { return a.id === sementalId; });
  const servicio = {
    id: nuevoId('SV'),
    sementalId,
    sementalNombre: semental ? semental.nombre : '',
    yegua, dueno, fecha,
    valor: Number(valor),
    estado: document.getElementById('sv-estado').value,
    notas: document.getElementById('sv-notas').value,
    finanzaId: null,
  };
  if (servicio.estado === 'pagado') {
    registrarIngresoServicio(servicio);
  }
  db.servicios.push(servicio);
  guardarDB();
  cerrarModal('modal-servicio');
  renderReproduccion();
  renderFinanzas();
  ['sv-yegua','sv-dueno','sv-valor','sv-notas'].forEach(function(id) { document.getElementById(id).value = ''; });
}

function registrarIngresoServicio(servicio) {
  const fin = {
    id: nuevoId('F'),
    fecha: servicio.fecha,
    tipo: 'ingreso',
    cat: 'servicio_monta',
    desc: 'Servicio de monta: ' + servicio.sementalNombre + ' × yegua "' + servicio.yegua + '"',
    valor: servicio.valor,
    extra: servicio.dueno,
    origen: 'servicio',
    origenId: servicio.id,
  };
  db.finanzas.push(fin);
  servicio.finanzaId = fin.id;
}

function marcarServicioPagado(id) {
  const sv = db.servicios.find(function(x) { return x.id === id; });
  if (!sv || sv.estado === 'pagado') return;
  sv.estado = 'pagado';
  registrarIngresoServicio(sv);
  guardarDB();
  renderReproduccion();
  renderFinanzas();
}

function eliminarServicio(id) {
  if (!confirm('¿Eliminar este servicio de monta?')) return;
  const sv = db.servicios.find(function(x) { return x.id === id; });
  if (sv && sv.finanzaId) {
    db.finanzas = db.finanzas.filter(function(f) { return f.id !== sv.finanzaId; });
  }
  db.servicios = db.servicios.filter(function(x) { return x.id !== id; });
  guardarDB();
  renderReproduccion();
  renderFinanzas();
}

// — SALUD —
function guardarSalud() {
  const animalId = document.getElementById('s-animal').value;
  const fecha    = document.getElementById('s-fecha').value;
  if (!animalId || !fecha) { alert('⚠️ Selecciona el animal y la fecha'); return; }

  const medInvId       = document.getElementById('s-medicamento-inv').value;
  const cantidadUsada  = Number(document.getElementById('s-cantidad-usada').value) || 0;
  const pendienteId    = document.getElementById('s-protocolo-id').value;  // ID del recordatorio pendiente (si aplica)
  const intervaloDias  = Number(document.getElementById('s-intervalo-dias').value) || 0;
  const desc           = document.getElementById('s-desc').value;

  // Descontar inventario si aplica
  if (medInvId && cantidadUsada > 0) {
    const med = db.medicamentos.find(function(m) { return m.id === medInvId; });
    if (med) {
      if (cantidadUsada > med.cantidad) {
        if (!confirm('⚠️ Solo quedan ' + med.cantidad + ' ' + med.unidad + ' de "' + med.nombre + '". ¿Continuar y dejar el inventario en 0?')) return;
        med.cantidad = 0;
      } else {
        med.cantidad = Math.round((med.cantidad - cantidadUsada) * 100) / 100;
      }
    }
  }

  const proxima = document.getElementById('s-proxima').value;

  // Si viene de un botón de protocolo (pendienteId es el ID del recordatorio pendiente)
  // lo marcamos como ejecutado y creamos el próximo recordatorio automáticamente
  if (pendienteId) {
    const pendiente = db.salud.find(function(s) { return s.id === pendienteId; });
    if (pendiente) {
      // Convertir el recordatorio pendiente en un evento real ejecutado hoy
      pendiente.pendiente    = false;
      pendiente.fecha        = fecha;
      pendiente.medicamento  = document.getElementById('s-medicamento').value;
      pendiente.medicamentoInvId = medInvId || null;
      pendiente.cantidadUsada    = cantidadUsada;
      pendiente.dosis        = document.getElementById('s-dosis').value;
      pendiente.veterinario  = document.getElementById('s-vet').value;
      pendiente.proxima      = proxima;

      // Si tiene intervalo, crear el próximo recordatorio pendiente automáticamente
      if (intervaloDias > 0 && proxima) {
        db.salud.push({
          id:              nuevoId('S'),
          animalId,
          tipo:            pendiente.tipo,
          desc:            pendiente.desc || desc,
          medicamento:     '', medicamentoInvId: null, cantidadUsada: 0, dosis: '',
          fecha:           proxima,
          proxima:         calcularProximaFecha(proxima, intervaloDias),
          veterinario:     '',
          origenProtocolo: pendiente.origenProtocolo,
          eventoProtocolo: pendiente.eventoProtocolo,
          intervaloDias,
          pendiente:       true,
        });
      }
    }
  } else {
    // Evento nuevo normal (no viene de un protocolo pendiente)
    db.salud.push({
      id: nuevoId('S'), animalId,
      tipo:             document.getElementById('s-tipo').value,
      desc,
      medicamento:      document.getElementById('s-medicamento').value,
      medicamentoInvId: medInvId || null,
      cantidadUsada,
      dosis:            document.getElementById('s-dosis').value,
      fecha,
      proxima,
      veterinario:      document.getElementById('s-vet').value,
      intervaloDias,
    });

    // Si tiene intervalo y próxima, crear recordatorio pendiente automáticamente
    if (intervaloDias > 0 && proxima) {
      db.salud.push({
        id:              nuevoId('S'),
        animalId,
        tipo:            document.getElementById('s-tipo').value,
        desc,
        medicamento:     '', medicamentoInvId: null, cantidadUsada: 0, dosis: '',
        fecha:           proxima,
        proxima:         calcularProximaFecha(proxima, intervaloDias),
        veterinario:     '',
        eventoProtocolo: desc,
        intervaloDias,
        pendiente:       true,
      });
    }
  }

  guardarDB();
  cerrarModal('modal-salud');
  renderSalud();
  renderInventario();
  // Reset form
  ['s-desc','s-medicamento','s-dosis','s-proxima','s-vet','s-cantidad-usada',
   's-protocolo-id','s-intervalo-dias'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  document.getElementById('s-medicamento-inv').value = '';
  document.getElementById('s-proxima-label').textContent = '';
  document.getElementById('s-panel-protocolos').style.display = 'none';
}

function eliminarSalud(id) {
  if (!confirm('¿Eliminar este registro médico?')) return;
  db.salud = db.salud.filter(function(r) { return r.id !== id; });
  guardarDB();
  renderSalud();
  renderDashboard();
}

// — MEDICAMENTOS (INVENTARIO) —
function guardarMedicamento() {
  const nombre   = document.getElementById('m-nombre').value.trim();
  const cantidad = document.getElementById('m-cantidad').value;
  if (!nombre || !cantidad) { alert('⚠️ Completa nombre y cantidad'); return; }
  const costo = Number(document.getElementById('m-costo').value) || 0;
  const med = {
    id: nuevoId('M'),
    nombre,
    cantidad:    Number(cantidad),
    unidad:      document.getElementById('m-unidad').value,
    vencimiento: document.getElementById('m-vencimiento').value,
    costo,
    notas:       document.getElementById('m-notas').value,
    finanzaId:   null,
  };
  if (costo > 0) {
    const fin = {
      id: nuevoId('F'), fecha: hoyISO(), tipo: 'gasto', cat: 'medicamentos',
      desc: 'Compra de medicamento: ' + nombre, valor: costo, extra: '',
      origen: 'medicamento', origenId: med.id,
    };
    db.finanzas.push(fin);
    med.finanzaId = fin.id;
  }
  db.medicamentos.push(med);
  guardarDB();
  cerrarModal('modal-medicamento');
  renderInventario();
  renderFinanzas();
  ['m-nombre','m-cantidad','m-vencimiento','m-costo','m-notas'].forEach(function(id) { document.getElementById(id).value = ''; });
}

function editarMedicamento(id) {
  const m = db.medicamentos.find(function(x) { return x.id === id; });
  if (!m) return;
  const nuevaCantidad = prompt('Nueva cantidad disponible de "' + m.nombre + '" (' + m.unidad + '):', m.cantidad);
  if (nuevaCantidad === null) return;
  const n = Number(nuevaCantidad);
  if (isNaN(n) || n < 0) { alert('⚠️ Cantidad no válida'); return; }
  m.cantidad = n;
  guardarDB();
  renderInventario();
}

function eliminarMedicamento(id) {
  if (!confirm('¿Eliminar este medicamento del inventario? Esto también eliminará el gasto asociado en Finanzas, si lo hay.')) return;
  const m = db.medicamentos.find(function(x) { return x.id === id; });
  if (m && m.finanzaId) {
    db.finanzas = db.finanzas.filter(function(f) { return f.id !== m.finanzaId; });
  }
  db.medicamentos = db.medicamentos.filter(function(m) { return m.id !== id; });
  guardarDB();
  renderInventario();
  renderFinanzas();
}

// — ALIMENTACIÓN —
function guardarAlimento() {
  const producto = document.getElementById('al-producto').value.trim();
  const cantidad = document.getElementById('al-cantidad').value;
  if (!producto || !cantidad) { alert('⚠️ Completa producto y cantidad'); return; }
  const costo = Number(document.getElementById('al-costo').value) || 0;
  const alim = {
    id: nuevoId('A'),
    producto,
    categoria:     document.getElementById('al-categoria').value,
    fecha:         document.getElementById('al-fecha').value,
    cantidad:      Number(cantidad),
    unidad:        document.getElementById('al-unidad').value,
    kg:            Number(document.getElementById('al-kg').value) || 1,
    consumoDiario: Number(document.getElementById('al-consumo').value) || 0,
    costo,
    notas:         document.getElementById('al-notas').value,
    finanzaId:     null,
  };
  if (costo > 0) {
    const fin = {
      id: nuevoId('F'), fecha: alim.fecha || hoyISO(), tipo: 'gasto', cat: 'alimentacion',
      desc: 'Compra de alimento/insumo: ' + producto, valor: costo, extra: '',
      origen: 'alimentacion', origenId: alim.id,
    };
    db.finanzas.push(fin);
    alim.finanzaId = fin.id;
  }
  db.alimentacion.push(alim);
  guardarDB();
  cerrarModal('modal-alimento');
  renderAlimentacion();
  renderFinanzas();
  ['al-producto','al-cantidad','al-kg','al-consumo','al-costo','al-notas'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
}

function eliminarAlimento(id) {
  if (!confirm('¿Eliminar este registro de alimento? Esto también eliminará el gasto asociado en Finanzas, si lo hay.')) return;
  const a = db.alimentacion.find(function(r) { return r.id === id; });
  if (a && a.finanzaId) {
    db.finanzas = db.finanzas.filter(function(f) { return f.id !== a.finanzaId; });
  }
  db.alimentacion = db.alimentacion.filter(function(r) { return r.id !== id; });
  guardarDB();
  renderAlimentacion();
  renderFinanzas();
}

// — FINANZAS —
function guardarGasto() {
  const valor = document.getElementById('g-valor').value;
  const desc  = document.getElementById('g-desc').value.trim();
  if (!valor || !desc) { alert('⚠️ Completa valor y descripción'); return; }
  db.finanzas.push({
    id: nuevoId('F'), fecha: document.getElementById('g-fecha').value,
    tipo: 'gasto', cat: document.getElementById('g-cat').value,
    desc, valor: Number(valor), extra: document.getElementById('g-prov').value,
  });
  guardarDB();
  cerrarModal('modal-gasto');
  renderFinanzas();
  ['g-valor','g-desc','g-prov'].forEach(function(id) { document.getElementById(id).value = ''; });
}

function guardarVenta() {
  const valor = document.getElementById('v-valor').value;
  const desc  = document.getElementById('v-desc').value.trim();
  if (!valor || !desc) { alert('⚠️ Completa valor y descripción'); return; }
  db.finanzas.push({
    id: nuevoId('F'), fecha: document.getElementById('v-fecha').value,
    tipo: 'ingreso', cat: document.getElementById('v-tipo').value,
    desc, valor: Number(valor), extra: document.getElementById('v-cliente').value,
  });
  guardarDB();
  cerrarModal('modal-venta');
  renderFinanzas();
  ['v-valor','v-desc','v-cliente'].forEach(function(id) { document.getElementById(id).value = ''; });
}

function eliminarFinanza(id) {
  const f = db.finanzas.find(function(r) { return r.id === id; });
  if (f && f.origen) { alert('⚠️ Este movimiento se generó automáticamente. Elimínalo desde su sección original (' + f.origen + ') para mantener todo sincronizado.'); return; }
  if (!confirm('¿Eliminar esta transacción?')) return;
  db.finanzas = db.finanzas.filter(function(r) { return r.id !== id; });
  guardarDB();
  renderFinanzas();
}

// ============================================================
// MÓDULO PRODUCCIÓN DE CARNE
// ============================================================
function guardarPesaje() {
  const animalId = document.getElementById('p-animal').value;
  const fecha    = document.getElementById('p-fecha').value;
  const peso     = document.getElementById('p-peso').value;
  if (!animalId || !fecha || !peso) { alert('⚠️ Completa animal, fecha y peso'); return; }

  const pesoN     = Number(peso);
  const destino   = document.getElementById('p-destino').value;
  const precioKg  = Number(document.getElementById('p-precio').value) || 0;
  const animal    = db.animales.find(function(a) { return a.id === animalId; });

  // Actualizar peso actual del animal también
  if (animal) animal.peso = pesoN;

  const pesajeObj = {
    id:         nuevoId('C'),
    animalId,
    fecha,
    peso:       pesoN,
    destino,
    precioKg,
    obs:        document.getElementById('p-obs').value,
    finanzaId:  null,
  };

  // Si es venta o faena y hay precio por kg, generar ingreso automático
  const esVentaConPrecio = (destino === 'venta' || destino === 'faena' || destino === 'subasta') && precioKg > 0;
  if (esVentaConPrecio) {
    const totalVenta = Math.round(pesoN * precioKg);
    const fin = {
      id: nuevoId('F'), fecha, tipo: 'ingreso', cat: 'venta_animal',
      desc: 'Venta/faena de ' + (animal ? animal.nombre : animalId) + ' (' + pesoN + ' kg)',
      valor: totalVenta, extra: '',
      origen: 'carne', origenId: pesajeObj.id,
    };
    db.finanzas.push(fin);
    pesajeObj.finanzaId = fin.id;
    // Si fue venta o faena, el animal pasa a estado "vendido" automáticamente
    if (animal && animal.estado === 'activo') animal.estado = 'vendido';
  }

  db.carne.push(pesajeObj);
  guardarDB();
  cerrarModal('modal-pesaje');
  renderCarne();
  renderFinanzas();
  renderTablaAnimales();
  ['p-peso','p-precio','p-obs'].forEach(function(id) { document.getElementById(id).value = ''; });
}

function eliminarPesaje(id) {
  if (!confirm('¿Eliminar este registro de pesaje? Esto también eliminará el ingreso asociado en Finanzas, si lo hay.')) return;
  const c = db.carne.find(function(r) { return r.id === id; });
  if (c && c.finanzaId) {
    db.finanzas = db.finanzas.filter(function(f) { return f.id !== c.finanzaId; });
  }
  db.carne = db.carne.filter(function(r) { return r.id !== id; });
  guardarDB();
  renderCarne();
  renderFinanzas();
}

// ============================================================
// RENDER — DASHBOARD
// ============================================================
function renderDashboard() {
  try {
    const hoy   = new Date();
    const dias  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    document.getElementById('fecha-hoy').textContent =
      dias[hoy.getDay()] + ', ' + hoy.getDate() + ' de ' + meses[hoy.getMonth()] + ' de ' + hoy.getFullYear();

    const sidebarTitulo = document.getElementById('sidebar-titulo-finca');
    if (sidebarTitulo) sidebarTitulo.textContent = '🌿 ' + (db.config.nombre || 'Mi Finca');
    const nombreUsuario = document.getElementById('nombre-usuario');
    if (nombreUsuario) nombreUsuario.textContent = db.config.propietario || 'Administrador';
    const avatarInicial = document.getElementById('avatar-inicial');
    if (avatarInicial) avatarInicial.textContent = (db.config.propietario || 'A')[0].toUpperCase();

    const activos   = db.animales.filter(function(a) { return a.estado === 'activo'; });
    const bovinos   = activos.filter(function(a) { return a.tipo === 'bovino'; });
    const equinos   = activos.filter(function(a) { return a.tipo === 'equino'; });
    const gestantes = db.reproductivo.filter(function(r) { return r.gestante === 'si'; }).length;
    const ultFechas = deduplicar(db.leche.map(function(l) { return l.fecha; })).sort().reverse();
    const lechHoy   = ultFechas[0]
      ? db.leche.filter(function(l) { return l.fecha === ultFechas[0]; }).reduce(function(s, l) { return s + l.litros; }, 0)
      : 0;

    document.getElementById('stats-dashboard').innerHTML =
      '<div class="stat-card"><div class="stat-label">Bovinos activos<span>🐄</span></div><div class="stat-value" style="color:var(--verde-medio)">' + bovinos.length + '</div><div class="stat-sub">en inventario</div></div>' +
      '<div class="stat-card"><div class="stat-label">Equinos activos<span>🐎</span></div><div class="stat-value" style="color:var(--tierra)">' + equinos.length + '</div><div class="stat-sub">en inventario</div></div>' +
      '<div class="stat-card"><div class="stat-label">Gestantes<span>🤰</span></div><div class="stat-value" style="color:var(--azul)">' + gestantes + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Leche último registro<span>🥛</span></div><div class="stat-value" style="color:var(--verde-claro)">' + lechHoy.toFixed(1) + '</div><div class="stat-sub">litros</div></div>';

    const alertas = calcularAlertas();
    const panelAl = document.getElementById('alertas-panel');
    if (alertas.length === 0) {
      panelAl.innerHTML = '<p style="color:var(--gris-texto);font-size:0.85rem">✅ Sin alertas pendientes</p>';
    } else {
      panelAl.innerHTML = alertas.slice(0, 4).map(function(a) {
        return '<div class="alerta-item ' + (a.urgente ? 'alerta-roja' : 'alerta-amarilla') + '">' +
          '<div><strong style="font-size:0.83rem">' + a.animal + ' — ' + a.tipo + '</strong><p style="font-size:0.77rem;color:var(--gris-texto)">' + a.desc + '</p></div>' +
          '<span class="badge ' + (a.urgente ? 'badge-rojo' : 'badge-amarillo') + '">' + (a.dias < 0 ? 'Vencida' : 'En ' + a.dias + 'd') + '</span>' +
          '</div>';
      }).join('');
    }

    const btnAl = document.getElementById('btn-alerta');
    btnAl.style.display = alertas.length > 0 ? 'block' : 'none';
    if (alertas.length > 0) document.getElementById('alerta-count').textContent = alertas.length;

    const navSalud = document.getElementById('nav-salud');
    if (navSalud) {
      const badge = navSalud.querySelector('.nav-badge');
      if (alertas.length > 0) {
        if (!badge) { navSalud.insertAdjacentHTML('beforeend', '<span class="nav-badge">' + alertas.length + '</span>'); }
        else { badge.textContent = alertas.length; }
      } else if (badge) { badge.remove(); }
    }

    const partoPanel = document.getElementById('partos-panel');
    const partosPrx  = db.reproductivo.filter(function(r) {
      return r.gestante === 'si' && r.fechaParto &&
        (function(a) { return a && a.estado === 'activo'; })(db.animales.find(function(x) { return x.id === r.animalId; }));
    }).sort(function(a, b) { return new Date(a.fechaParto) - new Date(b.fechaParto); });

    if (partosPrx.length === 0) {
      partoPanel.innerHTML = '<p style="color:var(--gris-texto);font-size:0.85rem">Sin gestaciones activas</p>';
    } else {
      partoPanel.innerHTML = partosPrx.map(function(r) {
        const a = db.animales.find(function(x) { return x.id === r.animalId; });
        const d = diasPara(r.fechaParto);
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gris-borde);font-size:0.83rem">' +
          '<div><strong>' + ((a && a.nombre) || r.animalId) + '</strong><p style="color:var(--gris-texto);font-size:0.77rem">Parto est.: ' + fmt(r.fechaParto) + '</p></div>' +
          '<span class="badge ' + (d <= 30 ? 'badge-amarillo' : 'badge-azul') + '">' + (d > 0 ? d + 'd' : '¡Inminente!') + '</span>' +
          '</div>';
      }).join('');
    }

    renderGraficoLeche();
  } catch(e) { console.error('renderDashboard:', e); }
}

function renderGraficoLeche() {
  const fechas  = deduplicar(db.leche.map(function(l) { return l.fecha; })).sort().reverse().slice(0, 7).reverse();
  const grafico = document.getElementById('grafico-leche');
  if (fechas.length === 0) { grafico.innerHTML = '<p style="color:var(--gris-texto);font-size:0.85rem">Sin registros de leche aún.</p>'; return; }
  const totales = fechas.map(function(f) {
    return { fecha: f, total: db.leche.filter(function(l) { return l.fecha === f; }).reduce(function(s, l) { return s + l.litros; }, 0) };
  });
  const maximo = totales.reduce(function(m, t) { return Math.max(m, t.total); }, 1);
  grafico.innerHTML = totales.map(function(t) {
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">' +
      '<span style="font-size:0.68rem;color:var(--gris-texto)">' + t.total.toFixed(0) + 'L</span>' +
      '<div style="width:100%;background:var(--verde-claro);border-radius:4px 4px 0 0;height:' + Math.round((t.total / maximo) * 80) + 'px;min-height:4px"></div>' +
      '<span style="font-size:0.65rem;color:var(--gris-texto)">' + t.fecha.slice(5) + '</span>' +
      '</div>';
  }).join('');
}

function calcularAlertas() {
  const activos = db.animales.filter(function(a) { return a.estado === 'activo'; }).map(function(a) { return a.id; });
  return db.salud
    .filter(function(s) { return activos.indexOf(s.animalId) !== -1 && diasPara(s.proxima) !== null && diasPara(s.proxima) <= 60; })
    .map(function(s) {
      const a = db.animales.find(function(x) { return x.id === s.animalId; });
      const d = diasPara(s.proxima);
      return { animal: (a && a.nombre) || s.animalId, tipo: s.tipo, desc: s.desc, dias: d, urgente: d <= 7 || d < 0 };
    })
    .sort(function(a, b) { return a.dias - b.dias; });
}

// ============================================================
// RENDER — ANIMALES
// ============================================================
function renderTablaAnimales() {
  const busca    = (document.getElementById('buscar-animal').value || '').toLowerCase();
  const filtTip  = document.getElementById('filtro-tipo').value || '';
  const filtEst  = document.getElementById('filtro-estado').value || '';
  const filtrados = db.animales.filter(function(a) {
    if (filtTip && a.tipo   !== filtTip) return false;
    if (filtEst && a.estado !== filtEst) return false;
    if (busca && !a.nombre.toLowerCase().includes(busca) &&
        !a.id.toLowerCase().includes(busca) &&
        !(a.arete || '').toLowerCase().includes(busca)) return false;
    return true;
  });
  document.getElementById('conteo-animales').textContent = filtrados.length + ' resultados';

  // Contar pendientes de protocolo por animal para mostrar badge
  const pendientesPorAnimal = {};
  db.salud.filter(function(s) { return s.pendiente === true; }).forEach(function(s) {
    pendientesPorAnimal[s.animalId] = (pendientesPorAnimal[s.animalId] || 0) + 1;
  });

  document.getElementById('tbody-animales').innerHTML = filtrados.map(function(a) {
    const nPend = pendientesPorAnimal[a.id] || 0;
    const tieneProtocolo = a.protocolosAplicados && a.protocolosAplicados.length > 0;
    return '<tr onclick="verFicha(\'' + a.id + '\')">' +
      '<td><code style="font-size:0.78rem;color:var(--verde-medio)">' + a.id + '</code>' +
        (a.arete ? '<br><small style="color:var(--gris-texto)">🏷️ ' + a.arete + '</small>' : '') + '</td>' +
      '<td>' + (a.tipo === 'bovino' ? '🐄' : '🐎') + ' ' + a.tipo + '</td>' +
      '<td><strong>' + a.nombre + '</strong>' +
        (nPend > 0 ? ' <span class="badge badge-rojo" title="' + nPend + ' pendientes de protocolo" style="font-size:0.68rem">🛡️ ' + nPend + '</span>' : '') +
      '</td>' +
      '<td><span class="badge ' + (a.sexo === 'hembra' ? 'badge-tierra' : 'badge-azul') + '">' + a.sexo + '</span></td>' +
      '<td>' + (a.raza || '-') + '</td><td>' + edad(a.nacimiento) + '</td><td>' + a.peso + ' kg</td>' +
      '<td>' + badgeEstado(a.estado) + '</td>' +
      '<td style="display:flex;gap:5px;flex-wrap:wrap">' +
        '<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();editarAnimal(\'' + a.id + '\')" title="Editar">✏️</button>' +
        '<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();aplicarProtocoloAAnimalExistente(\'' + a.id + '\')" title="Aplicar protocolo">🛡️</button>' +
        '<button class="btn btn-sm btn-rojo" onclick="event.stopPropagation();eliminarAnimal(\'' + a.id + '\')" title="Eliminar">🗑️</button>' +
        (a.estado === 'muerto' || a.estado === 'vendido' ? '<button class="btn btn-sm" style="background:#7c5c3c;color:#fff" title="Eliminar todo" onclick="event.stopPropagation();eliminarCompleto(\'' + a.id + '\')">🗑️✕</button>' : '') +
      '</td>' +
    '</tr>';
  }).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--gris-texto);padding:1.5rem">Sin animales que coincidan</td></tr>';
}

function verFicha(id) {
  const a = db.animales.find(function(x) { return x.id === id; });
  if (!a) return;
  idFichaActual = id;
  const saludA  = db.salud.filter(function(s) { return s.animalId === id; });
  const reproA  = db.reproductivo.filter(function(r) { return r.animalId === id; });
  const lecheA  = db.leche.filter(function(l) { return l.animalId === id; });
  const carneA  = db.carne.filter(function(c) { return c.animalId === id; }).sort(function(x,y){ return x.fecha > y.fecha ? 1 : -1; });
  const tipoIcon = { vacuna: '💉', desparasitacion: '🪱', herraje: '🔩', odontologia: '🦷', vitamina: '💊', otro: '🏥' };
  const totalL  = lecheA.reduce(function(s, l) { return s + l.litros; }, 0);
  const promL   = lecheA.length > 0 ? (totalL / lecheA.length).toFixed(1) : '-';

  let gananciaTotal = '-';
  if (carneA.length >= 2) {
    gananciaTotal = (carneA[carneA.length-1].peso - carneA[0].peso).toFixed(1) + ' kg';
  }

  const madre = a.madre ? db.animales.find(function(x) { return x.id === a.madre; }) : null;
  const padre = a.padre ? db.animales.find(function(x) { return x.id === a.padre; }) : null;
  const genealogia = (madre || padre) ?
    '<div style="margin-top:1rem">' +
      '<p style="font-size:0.78rem;font-weight:700;color:var(--gris-texto);margin-bottom:6px">🌳 GENEALOGÍA</p>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
        (madre ? '<div class="gen-box">🐄 Madre<br><small>' + madre.nombre + '</small></div>' : '') +
        (padre ? '<div class="gen-box" style="background:var(--azul-pastel);color:var(--azul)">🐂 Padre<br><small>' + padre.nombre + '</small></div>' : '') +
        '<div class="gen-box" style="background:var(--tierra-pastel);color:var(--tierra)">⬤ ' + a.nombre + '</div>' +
      '</div>' +
    '</div>' : '';

  // Sección SINIGAN / Trazabilidad
  const tieneTrazabilidad = a.arete || a.marcaCandela;
  const trazabilidad = tieneTrazabilidad ?
    '<div style="background:var(--azul-pastel);border:1px solid var(--azul);border-radius:8px;padding:10px 14px;margin-bottom:1rem">' +
      '<p style="font-size:0.78rem;font-weight:700;color:var(--azul);margin-bottom:6px">🏷️ TRAZABILIDAD OFICIAL</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:0.82rem">' +
        '<div><span style="color:var(--gris-texto)">Arete / SINIGAN</span><p style="font-weight:700;margin-top:2px">' + (a.arete || '<span style="color:var(--gris-texto)">Sin registrar</span>') + '</p></div>' +
        '<div><span style="color:var(--gris-texto)">Marca en candela / Hierro</span><p style="font-weight:700;margin-top:2px">' + (a.marcaCandela || '<span style="color:var(--gris-texto)">Sin registrar</span>') + '</p></div>' +
      '</div>' +
    '</div>' : '';

  // Estado reproductivo equino
  const estadoReprod = (a.tipo === 'equino' && a.sexo === 'macho' && a.estadoReproductivo) ?
    '<div style="margin-bottom:0.8rem">' +
      (a.estadoReproductivo === 'entero'
        ? '<span class="badge badge-tierra" style="font-size:0.82rem;padding:5px 10px">🐎 Semental (entero)</span>'
        : '<span class="badge badge-gris" style="font-size:0.82rem;padding:5px 10px">✂️ Capado</span>') +
    '</div>' : '';

  document.getElementById('ficha-contenido').innerHTML =
    '<div class="ficha-animal">' +
      (a.foto ? '<img src="' + a.foto + '" alt="' + a.nombre + '" style="width:64px;height:64px;border-radius:14px;object-fit:cover;border:1px solid var(--gris-borde)">' :
        '<div class="ficha-emoji">' + (a.tipo === 'bovino' ? '🐄' : '🐎') + '</div>') +
      '<div>' +
        '<h2 style="font-size:1.3rem;font-family:\'Playfair Display\',serif;color:var(--verde-oscuro)">' + a.nombre + '</h2>' +
        '<p style="color:var(--gris-texto);font-size:0.82rem">ID: ' + a.id + ' · ' + (a.raza || 'Raza no especificada') + ' · ' + edad(a.nacimiento) + '</p>' +
        '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">' + badgeEstado(a.estado) +
          '<span class="badge ' + (a.sexo === 'hembra' ? 'badge-tierra' : 'badge-azul') + '">' + a.sexo + '</span>' +
          '<span class="badge badge-gris">' + a.procedencia + '</span>' +
          '<span class="badge badge-gris">' + a.tipo + '</span></div>' +
      '</div>' +
    '</div>' +
    estadoReprod +
    trazabilidad +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:1rem">' +
      '<div class="stat-card"><div class="stat-label">Peso</div><div class="stat-value" style="font-size:1.2rem">' + a.peso + ' kg</div></div>' +
      '<div class="stat-card"><div class="stat-label">Nacimiento</div><div class="stat-value" style="font-size:1rem">' + fmt(a.nacimiento) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Edad</div><div class="stat-value" style="font-size:1rem">' + edad(a.nacimiento) + '</div></div>' +
    '</div>' +
    (a.potrero ? '<div class="ayuda" style="margin-bottom:1rem">📍 <strong>Ubicación:</strong> ' + a.potrero +
      (a.potreroFecha ? ' · desde ' + fmt(a.potreroFecha) + (diasPara(a.potreroFecha) !== null ? ' (' + Math.abs(diasPara(a.potreroFecha)) + ' días)' : '') : '') + '</div>' : '') +
    (a.notas ? '<div class="ayuda" style="margin-bottom:1rem">📝 ' + a.notas + '</div>' : '') +
    genealogia +

    // Protocolos activos del animal
    (function() {
      const prots = a.protocolosAplicados || [];
      const pendientesAnimal = db.salud.filter(function(s) { return s.animalId === id && s.pendiente === true; });
      return '<div style="margin-top:1rem">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
          '<p style="font-size:0.78rem;font-weight:700;color:var(--gris-texto)">🛡️ PROTOCOLOS ACTIVOS</p>' +
          '<button class="btn btn-sm btn-outline" onclick="cerrarModal(\'modal-ficha\');aplicarProtocoloAAnimalExistente(\'' + id + '\')">+ Aplicar protocolo</button>' +
        '</div>' +
        (prots.length === 0
          ? '<p style="font-size:0.82rem;color:var(--gris-texto)">Sin protocolos aplicados. Usa el botón para asignar uno.</p>'
          : prots.map(function(ap) {
              const prot = db.protocolos.find(function(p) { return p.id === ap.protocoloId; });
              return '<span class="badge badge-verde" style="margin-right:4px">' + (prot ? prot.nombre : ap.protocoloId) + '</span>';
            }).join('')) +
        (pendientesAnimal.length > 0
          ? '<div style="margin-top:8px;background:var(--amarillo-pastel);border-radius:8px;padding:8px 10px">' +
              '<p style="font-size:0.78rem;font-weight:700;color:#7a5c00;margin-bottom:4px">⏰ Eventos pendientes (' + pendientesAnimal.length + ')</p>' +
              pendientesAnimal.slice(0, 4).map(function(s) {
                const d = diasPara(s.fecha);
                return '<div style="font-size:0.78rem;display:flex;justify-content:space-between;padding:2px 0">' +
                  '<span>' + (s.desc || s.tipo) + '</span>' +
                  '<span class="badge ' + (d < 0 ? 'badge-rojo' : d <= 7 ? 'badge-amarillo' : 'badge-azul') + '">' +
                    (d < 0 ? 'Vencido' : d === 0 ? '¡Hoy!' : 'en ' + d + 'd') +
                  '</span></div>';
              }).join('') +
              (pendientesAnimal.length > 4 ? '<p style="font-size:0.75rem;color:var(--gris-texto);margin-top:4px">+ ' + (pendientesAnimal.length - 4) + ' más en Salud</p>' : '') +
            '</div>'
          : '') +
      '</div>';
    })() +
    '<div style="margin-top:1rem">' +
      '<p style="font-size:0.78rem;font-weight:700;color:var(--gris-texto);margin-bottom:6px">💉 HISTORIAL MÉDICO (' + saludA.length + ' registros)</p>' +
      (saludA.length === 0 ? '<p style="font-size:0.82rem;color:var(--gris-texto)">Sin registros médicos.</p>' :
        saludA.sort(function(x,y){return x.fecha>y.fecha?-1:1;}).map(function(s) {
          return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-borde);font-size:0.82rem">' +
            '<span>' + (tipoIcon[s.tipo] || '🏥') + ' <strong>' + s.tipo + '</strong> — ' + (s.desc || '-') + (s.medicamento ? ' · ' + s.medicamento + ' ' + s.dosis : '') + (s.origenProtocolo ? ' <span style="font-size:0.7rem;color:var(--gris-texto)">(protocolo)</span>' : '') + '</span>' +
            '<span style="color:var(--gris-texto)">' + fmt(s.fecha) + (s.proxima ? ' · próx. ' + fmt(s.proxima) : '') + '</span></div>';
        }).join('')) +
    '</div>' +
    (a.tipo === 'bovino' && a.sexo === 'hembra' ?
      '<div style="margin-top:1rem"><p style="font-size:0.78rem;font-weight:700;color:var(--gris-texto);margin-bottom:6px">🥛 PRODUCCIÓN DE LECHE</p>' +
      '<p style="font-size:0.85rem">Registros: <strong>' + lecheA.length + '</strong> · Total: <strong>' + totalL.toFixed(1) + ' L</strong> · Prom: <strong>' + promL + ' L/día</strong></p></div>' : '') +
    (carneA.length > 0 ?
      '<div style="margin-top:1rem"><p style="font-size:0.78rem;font-weight:700;color:var(--gris-texto);margin-bottom:6px">🥩 HISTORIAL DE PESAJES (' + carneA.length + ' registros)</p>' +
      '<p style="font-size:0.82rem;margin-bottom:6px">Ganancia total: <strong style="color:var(--verde-medio)">' + gananciaTotal + '</strong></p>' +
      carneA.map(function(c) {
        return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-borde);font-size:0.82rem">' +
          '<span><strong>' + c.peso + ' kg</strong>' + (c.destino !== 'seguimiento' ? ' · <span class="badge badge-tierra">' + c.destino + '</span>' : '') + (c.precioKg ? ' · ' + moneda(c.precioKg) + '/kg' : '') + '</span>' +
          '<span style="color:var(--gris-texto)">' + fmt(c.fecha) + '</span></div>';
      }).join('') + '</div>' : '') +
    (reproA.length > 0 ?
      '<div style="margin-top:1rem"><p style="font-size:0.78rem;font-weight:700;color:var(--gris-texto);margin-bottom:6px">🔁 HISTORIAL REPRODUCTIVO</p>' +
      reproA.map(function(r) {
        return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-borde);font-size:0.82rem">' +
          '<span><strong>' + r.tipo + '</strong> ' + (r.macho ? '· Macho: ' + r.macho : '') + ' ' + (r.gestante === 'si' ? '<span class="badge badge-azul">gestante</span>' : '') + '</span>' +
          '<span style="color:var(--gris-texto)">' + fmt(r.fecha) + (r.fechaParto ? ' → parto ' + fmt(r.fechaParto) : '') + '</span></div>';
      }).join('') + '</div>' : '');
  abrirModal('modal-ficha');
}

// ============================================================
// RENDER — LECHE
// ============================================================
function renderLeche() {
  const vacas = db.animales.filter(function(a) { return a.tipo === 'bovino' && a.sexo === 'hembra' && a.estado === 'activo'; });
  const total = db.leche.reduce(function(s, l) { return s + l.litros; }, 0);
  const ultF  = deduplicar(db.leche.map(function(l) { return l.fecha; })).sort().reverse();
  const hoyT  = ultF[0] ? db.leche.filter(function(l) { return l.fecha === ultF[0]; }).reduce(function(s, l) { return s + l.litros; }, 0) : 0;
  document.getElementById('stats-leche').innerHTML =
    '<div class="stat-card"><div class="stat-label">Vacas lecheras<span>🐄</span></div><div class="stat-value" style="color:var(--verde-medio)">' + vacas.length + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Último registro<span>📅</span></div><div class="stat-value" style="font-size:1.1rem;color:var(--verde-claro)">' + hoyT.toFixed(1) + ' L</div><div class="stat-sub">' + (fmt(ultF[0]) || 'Sin datos') + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Total registrado<span>🥛</span></div><div class="stat-value" style="color:var(--azul)">' + total.toFixed(1) + ' L</div></div>';
  document.getElementById('tabla-vacas-leche').innerHTML = vacas.map(function(v) {
    const regs = db.leche.filter(function(l) { return l.animalId === v.id; });
    const ul7  = regs.slice(-7);
    const prom = ul7.length > 0 ? ul7.reduce(function(s, l) { return s + l.litros; }, 0) / ul7.length : 0;
    return '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--gris-borde)">' +
      '<span style="width:100px;font-size:0.85rem;font-weight:600">' + v.nombre + '</span>' +
      '<div style="flex:1"><div class="prog-bar"><div class="prog-fill" style="width:' + Math.min(prom / 30 * 100, 100) + '%"></div></div></div>' +
      '<span style="font-size:0.85rem;font-weight:700;color:var(--verde-medio);width:70px;text-align:right">' + prom.toFixed(1) + ' L/día</span>' +
      '</div>';
  }).join('') || '<p style="color:var(--gris-texto);font-size:0.85rem">Agrega vacas lecheras en "Mis animales"</p>';
  document.getElementById('tbody-leche').innerHTML = db.leche.slice().reverse().slice(0, 50).map(function(l) {
    const a = db.animales.find(function(x) { return x.id === l.animalId; });
    if (!a || a.estado === 'muerto') return '';
    return '<tr>' +
      '<td>' + fmt(l.fecha) + '</td>' +
      '<td><strong>' + ((a && a.nombre) || l.animalId) + '</strong></td>' +
      '<td><strong style="color:var(--verde-medio)">' + l.litros.toFixed(1) + ' L</strong></td>' +
      '<td style="color:var(--gris-texto)">' + (l.nota || '-') + '</td>' +
      '<td><button class="btn btn-sm btn-rojo" onclick="eliminarLeche(\'' + l.id + '\')">🗑️</button></td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin registros</td></tr>';
}

// ============================================================
// RENDER — REPRODUCCIÓN
// ============================================================
function renderReproduccion() {
  const activos   = db.animales.filter(function(a) { return a.estado === 'activo'; }).map(function(a) { return a.id; });
  const gestantes = db.reproductivo.filter(function(r) { return r.gestante === 'si' && activos.indexOf(r.animalId) !== -1; }).length;
  document.getElementById('total-gestantes').textContent = gestantes;
  document.getElementById('tbody-repro').innerHTML = db.reproductivo
    .filter(function(r) { return activos.indexOf(r.animalId) !== -1; })
    .map(function(r) {
      const a = db.animales.find(function(x) { return x.id === r.animalId; });
      const d = r.fechaParto ? diasPara(r.fechaParto) : null;
      return '<tr>' +
        '<td><strong>' + ((a && a.nombre) || r.animalId) + '</strong> <small>' + (a && a.tipo === 'bovino' ? '🐄' : '🐎') + '</small></td>' +
        '<td><span class="badge badge-azul">' + r.tipo + '</span></td>' +
        '<td>' + fmt(r.fecha) + '</td><td>' + (r.macho || '-') + '</td>' +
        '<td><select onchange="cambiarGestante(\'' + r.id + '\', this.value)" style="padding:5px 7px;border:1px solid var(--gris-borde);border-radius:6px;font-size:0.78rem;background:#fff">' +
          '<option value="no" ' + (r.gestante === 'no' ? 'selected' : '') + '>No</option>' +
          '<option value="si" ' + (r.gestante === 'si' ? 'selected' : '') + '>Sí</option>' +
        '</select></td>' +
        '<td>' + fmt(r.fechaParto) + '</td>' +
        '<td>' + (d !== null ? '<span class="badge ' + (d <= 30 ? 'badge-amarillo' : 'badge-azul') + '">' + (d > 0 ? d + 'd' : '¡Inminente!') + '</span>' : '-') + '</td>' +
        '<td><button class="btn btn-sm btn-rojo" onclick="eliminarRepro(\'' + r.id + '\')">🗑️</button></td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin eventos reproductivos</td></tr>';

  document.getElementById('tbody-servicios').innerHTML = db.servicios.slice().reverse().map(function(s) {
    return '<tr>' +
      '<td><strong>' + s.sementalNombre + '</strong></td>' +
      '<td>' + s.yegua + '</td>' +
      '<td>' + s.dueno + '</td>' +
      '<td>' + fmt(s.fecha) + '</td>' +
      '<td>' + moneda(s.valor) + '</td>' +
      '<td>' + (s.estado === 'pagado'
        ? '<span class="badge badge-verde">✅ Pagado</span>'
        : '<button class="btn btn-sm btn-tierra" onclick="marcarServicioPagado(\'' + s.id + '\')">⏳ Marcar pagado</button>') + '</td>' +
      '<td style="color:var(--gris-texto)">' + (s.notas || '-') + '</td>' +
      '<td><button class="btn btn-sm btn-rojo" onclick="eliminarServicio(\'' + s.id + '\')">🗑️</button></td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin servicios registrados</td></tr>';
}

// ============================================================
// RENDER — SALUD
// ============================================================
function renderSalud() {
  const hoy = hoyISO();
  const tipoIcon = { vacuna: '💉', desparasitacion: '🪱', herraje: '🔩', odontologia: '🦷', vitamina: '💊', otro: '🏥' };

  // ── Panel de pendientes de protocolo ──
  const pendientes = db.salud
    .filter(function(s) { return s.pendiente === true; })
    .sort(function(a, b) { return a.fecha < b.fecha ? -1 : 1; });

  const bodyPend = document.getElementById('pendientes-protocolo-body');
  if (bodyPend) {
    if (pendientes.length === 0) {
      bodyPend.innerHTML = '<p style="color:var(--gris-texto);font-size:0.85rem">✅ Sin eventos pendientes de protocolo</p>';
    } else {
      bodyPend.innerHTML = pendientes.map(function(s) {
        const animal = db.animales.find(function(a) { return a.id === s.animalId; });
        const d      = diasPara(s.fecha);
        const esHoy  = s.fecha === hoy;
        const vencido= d < 0;
        return '<div class="pendiente-item' + (vencido ? ' vencido' : esHoy ? ' hoy' : '') + '">' +
          '<div>' +
            '<strong>' + (tipoIcon[s.tipo] || '🏥') + ' ' + (s.desc || s.tipo) + '</strong>' +
            '<span style="color:var(--gris-texto);font-size:0.78rem;margin-left:8px">' +
              (animal ? (animal.tipo === 'bovino' ? '🐄' : '🐎') + ' ' + animal.nombre : s.animalId) +
            '</span>' +
            (s.intervaloDias > 0 ? '<span class="badge badge-gris" style="margin-left:6px;font-size:0.68rem">cada ' + s.intervaloDias + 'd</span>' : '') +
          '</div>' +
          '<div style="display:flex;align-items:center;gap:8px">' +
            '<span class="badge ' +
              (vencido ? 'badge-rojo' : esHoy ? 'badge-amarillo' : diasPara(s.fecha) <= 14 ? 'badge-amarillo' : 'badge-azul') + '">' +
              (vencido ? 'Vencido hace ' + Math.abs(d) + 'd' : esHoy ? '¡Hoy!' : 'En ' + d + ' días · ' + fmt(s.fecha)) +
            '</span>' +
            '<button class="btn btn-sm btn-verde" onclick="marcarPendienteComoHecho(\'' + s.id + '\')">✅ Ejecutar hoy</button>' +
            '<button class="btn btn-sm btn-outline" onclick="eliminarSalud(\'' + s.id + '\')" title="Eliminar recordatorio">🗑️</button>' +
          '</div>' +
        '</div>';
      }).join('');
    }
  }

  // ── Alertas activas (próximas fechas en registros ejecutados) ──
  const alertas = calcularAlertas();
  const body    = document.getElementById('alertas-salud-body');
  if (alertas.length === 0) {
    body.innerHTML = '<p style="color:var(--gris-texto);font-size:0.85rem">✅ Sin alertas — todo al día</p>';
  } else {
    body.innerHTML = alertas.map(function(a) {
      return '<div class="alerta-item ' + (a.dias < 0 ? 'alerta-roja' : a.urgente ? 'alerta-amarilla' : 'alerta-azul') + '">' +
        '<div><strong style="font-size:0.85rem">' + a.animal + ' — ' + a.tipo + '</strong>' +
        '<p style="font-size:0.78rem;color:var(--gris-texto)">' + a.desc + '</p></div>' +
        '<span class="badge ' + (a.dias < 0 ? 'badge-rojo' : a.urgente ? 'badge-amarillo' : 'badge-azul') + '">' +
          (a.dias < 0 ? 'Vencida hace ' + Math.abs(a.dias) + 'd' : a.dias === 0 ? '¡Hoy!' : 'En ' + a.dias + 'd') +
        '</span>' +
      '</div>';
    }).join('');
  }

  // ── Tabla historial (solo eventos ejecutados, no pendientes) ──
  const ejecutados = db.salud
    .filter(function(s) { return !s.pendiente; })
    .sort(function(a, b) { return a.fecha > b.fecha ? -1 : 1; });

  document.getElementById('tbody-salud').innerHTML = ejecutados.map(function(s) {
    const a = db.animales.find(function(x) { return x.id === s.animalId; });
    return '<tr>' +
      '<td><strong>' + ((a && a.nombre) || s.animalId) + '</strong> <small>' + (a ? (a.tipo === 'bovino' ? '🐄' : '🐎') : '') + '</small></td>' +
      '<td><span class="badge badge-gris">' + (tipoIcon[s.tipo] || '🏥') + ' ' + s.tipo + '</span>' +
        (s.origenProtocolo ? '<br><small style="color:var(--gris-texto);font-size:0.68rem">🛡️ protocolo</small>' : '') + '</td>' +
      '<td>' + (s.desc || '-') + '</td>' +
      '<td>' + (s.medicamento || '-') + (s.dosis ? ' · ' + s.dosis : '') + '</td>' +
      '<td>' + fmt(s.fecha) + '</td>' +
      '<td>' + (s.proxima ? '<span class="badge ' + (diasPara(s.proxima) <= 7 ? 'badge-rojo' : diasPara(s.proxima) <= 30 ? 'badge-amarillo' : 'badge-azul') + '">' + fmt(s.proxima) + '</span>' : '-') + '</td>' +
      '<td>' + (s.veterinario || '-') + '</td>' +
      '<td><button class="btn btn-sm btn-rojo" onclick="eliminarSalud(\'' + s.id + '\')">🗑️</button></td>' +
    '</tr>';
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin registros ejecutados</td></tr>';
}

// Marca un recordatorio pendiente como ejecutado hoy abriendo el modal pre-llenado
function marcarPendienteComoHecho(pendienteId) {
  const s = db.salud.find(function(x) { return x.id === pendienteId; });
  if (!s) return;

  // Llenar el modal de salud con los datos del pendiente
  llenarSelectAnimales();
  llenarSelectMedicamentos();

  setTimeout(function() {
    document.getElementById('s-animal').value     = s.animalId;
    cargarProtocolosAnimal(s.animalId);
    document.getElementById('s-tipo').value       = s.tipo;
    document.getElementById('s-desc').value       = s.desc || '';
    document.getElementById('s-fecha').value      = hoyISO();
    document.getElementById('s-protocolo-id').value   = pendienteId;
    document.getElementById('s-intervalo-dias').value  = s.intervaloDias || 0;
    if (s.intervaloDias > 0) {
      const prox = calcularProximaFecha(hoyISO(), s.intervaloDias);
      document.getElementById('s-proxima').value = prox;
      document.getElementById('s-proxima-label').textContent =
        '(calculada automáticamente · cada ' + s.intervaloDias + ' días)';
    }
  }, 50);

  abrirModal('modal-salud');
}


// ============================================================
// RENDER — ALIMENTACIÓN
// ============================================================
const CATS_ALIMENTO = {
  forraje:     '🌿 Forraje / Heno',
  concentrado: '🌽 Concentrado',
  sal:         '🧂 Sal / Minerales',
  aceite:      '🛢️ Aceite',
  suplemento:  '💊 Suplemento',
  otro:        '📦 Otro'
};

function renderAlimentacion() {
  const regs = db.alimentacion;

  // Stats generales
  const totalCosto   = regs.reduce(function(s, a) { return s + (a.costo || 0); }, 0);
  const productos    = deduplicar(regs.map(function(a) { return a.producto; }));
  const conAlerta    = (function() {
    let n = 0;
    productos.forEach(function(p) {
      const rs = regs.filter(function(a) { return a.producto === p; });
      const ul = rs[rs.length - 1];
      if (!ul) return;
      const totalCant = ul.cantidad * (ul.kg || 1);
      const dias      = ul.consumoDiario > 0 ? Math.floor(totalCant / ul.consumoDiario) : null;
      if (dias !== null && dias < 14) n++;
    });
    return n;
  })();
  document.getElementById('stats-alimentacion').innerHTML =
    '<div class="stat-card"><div class="stat-label">Productos registrados<span>🌾</span></div><div class="stat-value" style="color:var(--verde-medio)">' + productos.length + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Compras registradas<span>🧾</span></div><div class="stat-value" style="color:var(--azul)">' + regs.length + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Costo total<span>💰</span></div><div class="stat-value" style="color:var(--tierra);font-size:1.2rem">' + moneda(totalCosto) + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Por agotarse (&lt;14 días)<span>⚠️</span></div><div class="stat-value" style="color:' + (conAlerta > 0 ? 'var(--rojo)' : 'var(--verde-medio)') + '">' + conAlerta + '</div></div>';

  // Resumen por producto (último registro de cada uno)
  const panel = document.getElementById('resumen-alimentos');
  if (productos.length === 0) {
    panel.innerHTML = '<p style="color:var(--gris-texto);font-size:0.85rem">Sin registros.</p>';
  } else {
    panel.innerHTML = productos.map(function(p) {
      const rs = regs.filter(function(a) { return a.producto === p; });
      const ul = rs[rs.length - 1];
      const totalCant = ul.cantidad * (ul.kg || 1);
      const dias      = ul.consumoDiario > 0 ? Math.floor(totalCant / ul.consumoDiario) : null;
      let fechaAgota = null;
      if (dias !== null) {
        const fa = new Date(ul.fecha);
        fa.setDate(fa.getDate() + dias);
        fechaAgota = fa.toISOString().split('T')[0];
      }
      return '<div style="padding:10px 0;border-bottom:1px solid var(--gris-borde)">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">' +
          '<div><strong style="font-size:0.9rem">' + p + '</strong> <span class="badge badge-gris">' + (CATS_ALIMENTO[ul.categoria] || ul.categoria || '📦 Otro') + '</span>' +
            '<p style="font-size:0.78rem;color:var(--gris-texto);margin-top:4px">Última compra: ' + fmt(ul.fecha) + ' · ' + ul.cantidad + ' ' + (ul.unidad || 'kg') + (ul.kg && ul.kg !== 1 ? ' (' + totalCant.toFixed(1) + ' kg/L totales)' : '') + '</p></div>' +
          '<div style="text-align:right">' +
            (dias !== null ? '<div style="font-weight:700;color:' + (dias < 14 ? 'var(--rojo)' : 'var(--verde-medio)') + '">' + dias + ' días</div><div style="font-size:0.75rem;color:var(--gris-texto)">hasta ' + fmt(fechaAgota) + '</div>' : '<div style="font-size:0.78rem;color:var(--gris-texto)">sin consumo diario</div>') +
          '</div>' +
        '</div>' +
        (ul.notas ? '<p style="font-size:0.78rem;color:var(--gris-texto);margin-top:4px">📝 ' + ul.notas + '</p>' : '') +
      '</div>';
    }).join('');
  }

  document.getElementById('tbody-alimento').innerHTML = regs.slice().reverse().map(function(a) {
    const totalCant = a.cantidad * (a.kg || 1);
    const dias = a.consumoDiario > 0 ? Math.floor(totalCant / a.consumoDiario) : null;
    return '<tr>' +
      '<td><strong>' + a.producto + '</strong></td>' +
      '<td><span class="badge badge-gris">' + (CATS_ALIMENTO[a.categoria] || a.categoria || '📦 Otro') + '</span></td>' +
      '<td>' + fmt(a.fecha) + '</td>' +
      '<td>' + a.cantidad + ' ' + (a.unidad || 'kg') + (a.kg && a.kg !== 1 ? ' (' + totalCant.toFixed(1) + ')' : '') + '</td>' +
      '<td>' + (a.consumoDiario ? a.consumoDiario + ' /día' : '-') + '</td>' +
      '<td>' + (dias !== null ? '<strong>' + dias + ' días</strong>' : '-') + '</td>' +
      '<td>' + (a.costo ? moneda(a.costo) : '-') + '</td>' +
      '<td style="color:var(--gris-texto)">' + (a.notas || '-') + '</td>' +
      '<td><button class="btn btn-sm btn-rojo" onclick="eliminarAlimento(\'' + a.id + '\')">🗑️</button></td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin registros</td></tr>';
}

// ============================================================
// RENDER — FINANZAS
// ============================================================
function renderFinanzas() {
  const cats = {
    alimentacion: '🌾 Alimentación', salud: '💉 Salud', medicamentos: '💊 Medicamentos',
    infraestructura: '🏗️ Infraestructura', mano_obra: '👷 Mano de obra', compra_animal: '🐄 Compra animal',
    venta_animal: '🐄 Venta de animal', servicio_monta: '🐎 Servicio de monta', otro: '📌 Otro'
  };
  const gastos  = db.finanzas.filter(function(f) { return f.tipo === 'gasto'; });
  const ingresos= db.finanzas.filter(function(f) { return f.tipo === 'ingreso'; });
  const tG      = gastos.reduce(function(s, f) { return s + f.valor; }, 0);
  const tI      = ingresos.reduce(function(s, f) { return s + f.valor; }, 0);
  const util    = tI - tG;
  document.getElementById('stats-finanzas').innerHTML =
    '<div class="stat-card"><div class="stat-label">Total gastos<span>📉</span></div><div class="stat-value" style="color:var(--rojo);font-size:1.2rem">' + moneda(tG) + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Total ingresos<span>📈</span></div><div class="stat-value" style="color:var(--verde-medio);font-size:1.2rem">' + moneda(tI) + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Utilidad neta<span>💹</span></div><div class="stat-value" style="color:' + (util >= 0 ? 'var(--verde-medio)' : 'var(--rojo)') + ';font-size:1.2rem">' + moneda(util) + '</div><div class="stat-sub">' + (util >= 0 ? 'Positiva ✅' : 'Negativa ⚠️') + '</div></div>';
  const porCat = {};
  gastos.forEach(function(g) { porCat[g.cat] = (porCat[g.cat] || 0) + g.valor; });
  document.getElementById('gastos-categoria').innerHTML = Object.entries(porCat).map(function(e) {
    return '<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;font-size:0.83rem;margin-bottom:3px">' +
      '<span>' + (cats[e[0]] || e[0]) + '</span><strong>' + moneda(e[1]) + '</strong></div>' +
      '<div class="prog-bar"><div class="prog-fill" style="width:' + (tG > 0 ? Math.round(e[1] / tG * 100) : 0) + '%;background:var(--rojo)"></div></div></div>';
  }).join('') || '<p style="color:var(--gris-texto);font-size:0.85rem">Sin gastos</p>';
  document.getElementById('ultimas-trans').innerHTML = db.finanzas.slice().sort(function(a, b) { return b.fecha < a.fecha ? -1 : 1; }).slice(0, 6).map(function(f) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--gris-borde);font-size:0.82rem">' +
      '<div><strong>' + f.desc + '</strong><p style="color:var(--gris-texto);font-size:0.75rem">' + fmt(f.fecha) + '</p></div>' +
      '<strong style="color:' + (f.tipo === 'ingreso' ? 'var(--verde-medio)' : 'var(--rojo)') + '">' +
        (f.tipo === 'ingreso' ? '+' : '−') + moneda(f.valor) + '</strong></div>';
  }).join('') || '<p style="color:var(--gris-texto);font-size:0.85rem">Sin transacciones</p>';
  document.getElementById('tbody-finanzas').innerHTML = db.finanzas.slice().sort(function(a, b) { return b.fecha < a.fecha ? -1 : 1; }).map(function(f) {
    const esAuto = !!f.origen;
    return '<tr>' +
      '<td>' + fmt(f.fecha) + '</td>' +
      '<td><span class="badge ' + (f.tipo === 'ingreso' ? 'badge-verde' : 'badge-rojo') + '">' + (f.tipo === 'ingreso' ? '📈 Ingreso' : '📉 Gasto') + '</span></td>' +
      '<td><span class="badge badge-gris">' + (cats[f.cat] || f.cat) + '</span></td>' +
      '<td>' + f.desc + (f.extra ? '<small style="color:var(--gris-texto)"> · ' + f.extra + '</small>' : '') +
        (esAuto ? '<br><small style="color:var(--gris-texto);font-style:italic">↳ Generado automáticamente desde su sección</small>' : '') + '</td>' +
      '<td><strong style="color:' + (f.tipo === 'ingreso' ? 'var(--verde-medio)' : 'var(--rojo)') + '">' + (f.tipo === 'ingreso' ? '+' : '−') + moneda(f.valor) + '</strong></td>' +
      '<td>' + (esAuto
        ? '<span title="Elimina el registro original en su sección para quitar este movimiento" style="color:var(--gris-texto);font-size:0.78rem">🔒 Automático</span>'
        : '<button class="btn btn-sm btn-rojo" onclick="eliminarFinanza(\'' + f.id + '\')">🗑️</button>') + '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin registros</td></tr>';
}

// ============================================================
// RENDER — PRODUCCIÓN DE CARNE
// ============================================================
function renderCarne() {
  try {
    const activos = db.animales.filter(function(a) { return a.estado === 'activo'; });
    const pesajes = db.carne;

    // Stats globales
    const totalPesajes = pesajes.length;
    const animalesConPesaje = deduplicar(pesajes.map(function(p) { return p.animalId; })).length;

    // Calcular ganancia de peso promedio (animales con 2+ pesajes)
    let gananciasArr = [];
    activos.forEach(function(a) {
      const ps = pesajes.filter(function(p) { return p.animalId === a.id; }).sort(function(x,y){ return x.fecha > y.fecha ? 1 : -1; });
      if (ps.length >= 2) {
        const diasDiff = Math.max(1, (new Date(ps[ps.length-1].fecha) - new Date(ps[0].fecha)) / 86400000);
        const ganKgDia = (ps[ps.length-1].peso - ps[0].peso) / diasDiff;
        gananciasArr.push(ganKgDia);
      }
    });
    const promGanancia = gananciasArr.length > 0
      ? (gananciasArr.reduce(function(s,v){ return s+v; }, 0) / gananciasArr.length).toFixed(2)
      : '-';

    // Valor estimado total (último precio/kg por animal)
    let valorEstimado = 0;
    activos.forEach(function(a) {
      const ps = pesajes.filter(function(p) { return p.animalId === a.id && p.precioKg > 0; }).sort(function(x,y){ return x.fecha > y.fecha ? 1 : -1; });
      if (ps.length > 0) {
        valorEstimado += a.peso * ps[0].precioKg;
      }
    });

    document.getElementById('stats-carne').innerHTML =
      '<div class="stat-card"><div class="stat-label">Pesajes registrados<span>⚖️</span></div><div class="stat-value" style="color:var(--tierra)">' + totalPesajes + '</div><div class="stat-sub">en ' + animalesConPesaje + ' animales</div></div>' +
      '<div class="stat-card"><div class="stat-label">Ganancia diaria prom.<span>📈</span></div><div class="stat-value" style="color:var(--verde-medio);font-size:1.4rem">' + (promGanancia !== '-' ? promGanancia + ' kg' : '-') + '</div><div class="stat-sub">kg/día/animal</div></div>' +
      '<div class="stat-card"><div class="stat-label">Valor estimado hato<span>💰</span></div><div class="stat-value" style="color:var(--azul);font-size:1.1rem">' + (valorEstimado > 0 ? moneda(valorEstimado) : '-') + '</div><div class="stat-sub">según último precio</div></div>';

    // Tabla por animal con curva de peso
    const panelAnimales = document.getElementById('carne-animales');
    const animalesConDatos = activos.filter(function(a) {
      return pesajes.some(function(p) { return p.animalId === a.id; });
    });

    if (animalesConDatos.length === 0) {
      panelAnimales.innerHTML = '<p style="color:var(--gris-texto);font-size:0.85rem">Registra el primer pesaje con el botón "+ Registrar pesaje".</p>';
    } else {
      panelAnimales.innerHTML = animalesConDatos.map(function(a) {
        const ps = pesajes.filter(function(p) { return p.animalId === a.id; }).sort(function(x,y){ return x.fecha > y.fecha ? 1 : -1; });
        const ultimo  = ps[0];
        const primero = ps[ps.length - 1];
        const ganTotal = ps.length >= 2 ? (primero.peso - ps[ps.length-1].peso) : null; // Nota: ps ya ordenado desc, así que calculamos bien:
        const psPorFecha = pesajes.filter(function(p) { return p.animalId === a.id; }).sort(function(x,y){ return x.fecha > y.fecha ? -1 : 1; });
        const ganTotalReal = psPorFecha.length >= 2 ? (psPorFecha[psPorFecha.length-1].peso - psPorFecha[0].peso).toFixed(1) : null;
        const diasTotales  = psPorFecha.length >= 2 ? Math.max(1, (new Date(psPorFecha[psPorFecha.length-1].fecha) - new Date(psPorFecha[0].fecha)) / 86400000) : null;
        const ganDiaria    = diasTotales ? (ganTotalReal / diasTotales).toFixed(2) : null;

        // Mini gráfico de barras de peso
        const pesos = psPorFecha.map(function(p){ return p.peso; });
        const maxP  = pesos.length > 0 ? Math.max.apply(null, pesos) : 1;
        const miniBarras = psPorFecha.slice(-5).map(function(p) {
          return '<div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1">' +
            '<span style="font-size:0.58rem;color:var(--gris-texto)">' + p.peso + '</span>' +
            '<div style="width:100%;background:var(--tierra);border-radius:3px 3px 0 0;height:' + Math.round((p.peso/maxP)*36) + 'px;min-height:3px;opacity:0.75"></div>' +
            '<span style="font-size:0.55rem;color:var(--gris-texto)">' + p.fecha.slice(5) + '</span>' +
            '</div>';
        }).join('');

        const precioEstimado = ultimo && ultimo.precioKg > 0 ? moneda(a.peso * ultimo.precioKg) : null;

        return '<div style="padding:14px 0;border-bottom:1px solid var(--gris-borde)">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">' +
            '<div>' +
              '<strong style="font-size:0.92rem">' + (a.tipo === 'bovino' ? '🐄' : '🐎') + ' ' + a.nombre + '</strong>' +
              ' <code style="font-size:0.72rem;color:var(--gris-texto)">' + a.id + '</code>' +
              '<div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">' +
                '<span class="badge badge-tierra">⚖️ ' + a.peso + ' kg actual</span>' +
                (ganTotalReal !== null ? '<span class="badge badge-verde">+' + ganTotalReal + ' kg total</span>' : '') +
                (ganDiaria !== null ? '<span class="badge badge-azul">+' + ganDiaria + ' kg/día</span>' : '') +
                (precioEstimado ? '<span class="badge badge-amarillo">Est. ' + precioEstimado + '</span>' : '') +
              '</div>' +
            '</div>' +
            '<span style="font-size:0.75rem;color:var(--gris-texto)">' + ps.length + ' pesajes</span>' +
          '</div>' +
          (psPorFecha.length > 0 ? '<div style="display:flex;align-items:flex-end;gap:4px;height:50px;margin-bottom:2px">' + miniBarras + '</div>' : '') +
        '</div>';
      }).join('');
    }

    // Tabla historial de pesajes
    document.getElementById('tbody-carne').innerHTML = pesajes.slice().sort(function(a,b){ return b.fecha > a.fecha ? 1 : -1; }).map(function(p) {
      const a = db.animales.find(function(x) { return x.id === p.animalId; });
      const destLabel = { seguimiento: '📊 Seguimiento', venta: '💵 Venta', faena: '🔪 Faena', subasta: '🏷️ Subasta' };
      return '<tr>' +
        '<td>' + fmt(p.fecha) + '</td>' +
        '<td><strong>' + ((a && a.nombre) || p.animalId) + '</strong></td>' +
        '<td><strong style="color:var(--tierra)">' + p.peso + ' kg</strong></td>' +
        '<td>' + (p.precioKg > 0 ? moneda(p.precioKg) + '/kg' : '-') + '</td>' +
        '<td>' + (p.precioKg > 0 ? '<strong>' + moneda(p.peso * p.precioKg) + '</strong>' : '-') + '</td>' +
        '<td><span class="badge badge-gris">' + (destLabel[p.destino] || p.destino) + '</span></td>' +
        '<td style="color:var(--gris-texto);font-size:0.8rem">' + (p.obs || '-') + '</td>' +
        '<td><button class="btn btn-sm btn-rojo" onclick="eliminarPesaje(\'' + p.id + '\')">🗑️</button></td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin pesajes registrados</td></tr>';

  } catch(e) { console.error('renderCarne:', e); }
}

// ============================================================
// RENDER — INVENTARIO
// ============================================================
function renderInventario() {
  const total    = db.animales.length;
  const activos  = db.animales.filter(function(a) { return a.estado === 'activo'; }).length;
  const vendidos = db.animales.filter(function(a) { return a.estado === 'vendido'; }).length;
  const muertos  = db.animales.filter(function(a) { return a.estado === 'muerto'; }).length;
  document.getElementById('stats-inventario').innerHTML =
    '<div class="stat-card"><div class="stat-label">Total animales<span>🐾</span></div><div class="stat-value" style="color:var(--verde-oscuro)">' + total + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Activos<span>✅</span></div><div class="stat-value" style="color:var(--verde-medio)">' + activos + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Vendidos<span>💰</span></div><div class="stat-value" style="color:var(--azul)">' + vendidos + '</div></div>' +
    '<div class="stat-card"><div class="stat-label">Bajas<span>❌</span></div><div class="stat-value" style="color:var(--rojo)">' + muertos + '</div></div>';
  document.getElementById('inv-tipos').innerHTML = ['bovino', 'equino'].map(function(tipo) {
    const act  = db.animales.filter(function(a) { return a.tipo === tipo && a.estado === 'activo'; }).length;
    const vend = db.animales.filter(function(a) { return a.tipo === tipo && a.estado === 'vendido'; }).length;
    const mrt  = db.animales.filter(function(a) { return a.tipo === tipo && a.estado === 'muerto'; }).length;
    return '<div style="padding:10px 0;border-bottom:1px solid var(--gris-borde)">' +
      '<p style="font-weight:700;font-size:0.9rem;margin-bottom:6px">' + (tipo === 'bovino' ? '🐄 Bovinos' : '🐎 Equinos') + '</p>' +
      '<div style="display:flex;gap:8px"><span class="badge badge-verde">Activos: ' + act + '</span>' +
        '<span class="badge badge-azul">Vendidos: ' + vend + '</span>' +
        '<span class="badge badge-rojo">Bajas: ' + mrt + '</span></div></div>';
  }).join('');
  const razas = {};
  db.animales.filter(function(a) { return a.estado === 'activo'; }).forEach(function(a) {
    razas[a.raza || 'Sin raza'] = (razas[a.raza || 'Sin raza'] || 0) + 1;
  });
  document.getElementById('inv-razas').innerHTML = Object.entries(razas).sort(function(a, b) { return b[1] - a[1]; }).map(function(e) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--gris-borde)">' +
      '<span style="font-size:0.85rem">' + e[0] + '</span><span class="badge badge-gris">' + e[1] + '</span></div>';
  }).join('') || '<p style="font-size:0.85rem;color:var(--gris-texto)">Sin datos</p>';
  document.getElementById('tbody-inventario').innerHTML = db.animales.map(function(a) {
    return '<tr onclick="verFicha(\'' + a.id + '\')" style="cursor:pointer">' +
      '<td><code style="font-size:0.78rem;color:var(--verde-medio)">' + a.id + '</code></td>' +
      '<td>' + (a.tipo === 'bovino' ? '🐄' : '🐎') + '</td>' +
      '<td><strong>' + a.nombre + '</strong></td>' +
      '<td>' + a.sexo + '</td><td>' + (a.raza || '-') + '</td><td>' + edad(a.nacimiento) + '</td>' +
      '<td>' + a.peso + ' kg</td><td>' + badgeEstado(a.estado) + '</td></tr>';
  }).join('');

  renderInventarioMedicamentos();
}

// — INVENTARIO DE MEDICAMENTOS —
function renderInventarioMedicamentos() {
  const meds = db.medicamentos;
  const hoy  = hoyISO();

  // Alertas: vencidos / próximos a vencer / agotados
  const alertas = [];
  meds.forEach(function(m) {
    if (m.cantidad <= 0) {
      alertas.push({ texto: '⚠️ "' + m.nombre + '" está agotado', tipo: 'roja' });
    }
    if (m.vencimiento) {
      const d = diasPara(m.vencimiento);
      if (d < 0)        alertas.push({ texto: '⛔ "' + m.nombre + '" venció hace ' + Math.abs(d) + ' día(s)', tipo: 'roja' });
      else if (d <= 30) alertas.push({ texto: '⏳ "' + m.nombre + '" vence en ' + d + ' día(s) (' + fmt(m.vencimiento) + ')', tipo: 'amarilla' });
    }
  });
  const panel = document.getElementById('alertas-medicamentos');
  if (alertas.length === 0) {
    panel.innerHTML = '<p style="color:var(--gris-texto);font-size:0.85rem">✅ Sin alertas de medicamentos</p>';
  } else {
    panel.innerHTML = alertas.map(function(a) {
      return '<div class="alerta-item alerta-' + a.tipo + '"><div><strong style="font-size:0.83rem">' + a.texto + '</strong></div></div>';
    }).join('');
  }

  document.getElementById('tbody-medicamentos').innerHTML = meds.map(function(m) {
    const d = m.vencimiento ? diasPara(m.vencimiento) : null;
    let vencBadge = '-';
    if (m.vencimiento) {
      const cls = d < 0 ? 'badge-rojo' : (d <= 30 ? 'badge-amarillo' : 'badge-verde');
      vencBadge = '<span class="badge ' + cls + '">' + fmt(m.vencimiento) + '</span>';
    }
    return '<tr>' +
      '<td><strong>' + m.nombre + '</strong></td>' +
      '<td><span class="badge ' + (m.cantidad <= 0 ? 'badge-rojo' : 'badge-azul') + '">' + m.cantidad + ' ' + m.unidad + '</span></td>' +
      '<td>' + vencBadge + '</td>' +
      '<td style="color:var(--gris-texto)">' + (m.notas || '-') + '</td>' +
      '<td style="display:flex;gap:6px">' +
        '<button class="btn btn-sm btn-outline" onclick="editarMedicamento(\'' + m.id + '\')">✏️</button>' +
        '<button class="btn btn-sm btn-rojo" onclick="eliminarMedicamento(\'' + m.id + '\')">🗑️</button>' +
      '</td></tr>';
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin medicamentos registrados</td></tr>';
}

// ============================================================
// PROTOCOLOS SANITARIOS
// ============================================================
const TIPOS_EVENTO_PROT = { vacuna: '💉 Vacuna', desparasitacion: '🪱 Desparasitación', vitamina: '💊 Vitamina', herraje: '🔩 Herraje', otro: '🏥 Otro' };
let _idProtocoloEnEdicion = null;

function renderProtocolos() {
  const cont = document.getElementById('lista-protocolos');
  if (!cont) return;
  if (db.protocolos.length === 0) {
    cont.innerHTML = '<p style="color:var(--gris-texto)">No hay protocolos. Crea uno con el botón de arriba.</p>';
    return;
  }
  cont.innerHTML = db.protocolos.map(function(p) {
    const esICA = p.id === 'P001' || p.id === 'P002';
    return '<div class="card" style="margin-bottom:1rem">' +
      '<div class="card-header">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<h3 style="margin:0">' + p.nombre + '</h3>' +
          (esICA ? '<span class="badge badge-azul">ICA</span>' : '') +
          '<span class="badge badge-gris">' + (p.tipo === 'bovino' ? '🐄 Bovinos' : p.tipo === 'equino' ? '🐎 Equinos' : '🐄🐎 Ambos') + '</span>' +
        '</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button class="btn btn-sm btn-outline" onclick="editarProtocolo(\'' + p.id + '\')">✏️ Editar</button>' +
          (!esICA ? '<button class="btn btn-sm btn-rojo" onclick="eliminarProtocolo(\'' + p.id + '\')">🗑️</button>' : '') +
        '</div>' +
      '</div>' +
      '<div class="tabla-wrap">' +
        '<table><thead><tr><th>#</th><th>Evento</th><th>Tipo</th><th>Días desde inicio</th><th>Se repite cada</th></tr></thead>' +
        '<tbody>' + (p.eventos || []).map(function(e, i) {
          return '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td><strong>' + e.nombre + '</strong></td>' +
            '<td><span class="badge badge-gris">' + (TIPOS_EVENTO_PROT[e.tipo] || e.tipo) + '</span></td>' +
            '<td>' + e.diasDesdeInicio + ' días</td>' +
            '<td>' + (e.intervaloRepeticion ? 'Cada ' + e.intervaloRepeticion + ' días' : 'Una sola vez') + '</td>' +
          '</tr>';
        }).join('') + '</tbody></table>' +
      '</div>' +
    '</div>';
  }).join('');
}

function editarProtocolo(id) {
  const p = db.protocolos.find(function(x) { return x.id === id; });
  if (!p) return;
  _idProtocoloEnEdicion = id;
  document.getElementById('prot-nombre').value = p.nombre;
  document.getElementById('prot-tipo').value   = p.tipo;
  const lista = document.getElementById('prot-eventos-lista');
  lista.innerHTML = '';
  (p.eventos || []).forEach(function(e) { agregarFilaEventoProtocolo(e); });
  abrirModal('modal-protocolo');
}

function eliminarProtocolo(id) {
  if (!confirm('¿Eliminar este protocolo?')) return;
  db.protocolos = db.protocolos.filter(function(p) { return p.id !== id; });
  guardarDB();
  renderProtocolos();
}

function agregarFilaEventoProtocolo(datos) {
  datos = datos || {};
  const lista = document.getElementById('prot-eventos-lista');
  const div = document.createElement('div');
  div.className = 'prot-evento-fila';
  div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:8px;margin-bottom:6px;align-items:center';
  div.innerHTML =
    '<input type="text" class="pe-nombre" placeholder="Nombre del evento" value="' + (datos.nombre || '') + '" style="padding:6px 8px;border:1px solid var(--gris-borde);border-radius:6px;font-size:0.82rem">' +
    '<select class="pe-tipo" style="padding:6px 8px;border:1px solid var(--gris-borde);border-radius:6px;font-size:0.82rem">' +
      Object.entries(TIPOS_EVENTO_PROT).map(function(kv) {
        return '<option value="' + kv[0] + '"' + (datos.tipo === kv[0] ? ' selected' : '') + '>' + kv[1] + '</option>';
      }).join('') +
    '</select>' +
    '<input type="number" class="pe-dias" placeholder="Días inicio" value="' + (datos.diasDesdeInicio || 0) + '" style="padding:6px 8px;border:1px solid var(--gris-borde);border-radius:6px;font-size:0.82rem" title="Días desde la fecha de inicio">' +
    '<input type="number" class="pe-intervalo" placeholder="Repetir cada X días (0=no)" value="' + (datos.intervaloRepeticion || 0) + '" style="padding:6px 8px;border:1px solid var(--gris-borde);border-radius:6px;font-size:0.82rem" title="Intervalo de repetición en días (0 = no repetir)">' +
    '<button type="button" onclick="this.parentElement.remove()" style="background:var(--rojo);color:#fff;border:none;border-radius:6px;padding:5px 9px;cursor:pointer;font-size:0.9rem">×</button>';
  lista.appendChild(div);
}

function guardarProtocolo() {
  const nombre = document.getElementById('prot-nombre').value.trim();
  if (!nombre) { alert('⚠️ Escribe el nombre del protocolo'); return; }
  const filas = document.querySelectorAll('.prot-evento-fila');
  const eventos = [];
  filas.forEach(function(f) {
    const n = f.querySelector('.pe-nombre').value.trim();
    if (!n) return;
    eventos.push({
      nombre: n,
      tipo:              f.querySelector('.pe-tipo').value,
      diasDesdeInicio:   Number(f.querySelector('.pe-dias').value) || 0,
      intervaloRepeticion: Number(f.querySelector('.pe-intervalo').value) || 0,
    });
  });
  if (eventos.length === 0) { alert('⚠️ Agrega al menos un evento al protocolo'); return; }
  if (_idProtocoloEnEdicion) {
    const i = db.protocolos.findIndex(function(p) { return p.id === _idProtocoloEnEdicion; });
    if (i !== -1) {
      db.protocolos[i].nombre = nombre;
      db.protocolos[i].tipo   = document.getElementById('prot-tipo').value;
      db.protocolos[i].eventos = eventos;
    }
  } else {
    db.protocolos.push({ id: nuevoId('PROT'), nombre, tipo: document.getElementById('prot-tipo').value, eventos });
  }
  guardarDB();
  cerrarModal('modal-protocolo');
  renderProtocolos();
  _idProtocoloEnEdicion = null;
  document.getElementById('prot-nombre').value = '';
  document.getElementById('prot-eventos-lista').innerHTML = '';
}

// ---- Aplicar protocolo a un animal ----
function previsualizarProtocolo() {
  const selId    = document.getElementById('ap-protocolo').value;
  const fechaIni = document.getElementById('ap-fecha-inicio').value;
  const prot = db.protocolos.find(function(p) { return p.id === selId; });
  const prev = document.getElementById('ap-preview');
  if (!prot || !fechaIni) { prev.innerHTML = ''; return; }
  const base = new Date(fechaIni + 'T12:00:00');
  let html = '<div style="background:var(--crema);border-radius:8px;padding:10px;margin-top:6px"><p style="font-size:0.8rem;font-weight:700;color:var(--verde-oscuro);margin-bottom:6px">Recordatorios que se crearán:</p>';
  prot.eventos.forEach(function(e) {
    const fechaEv = new Date(base.getTime());
    fechaEv.setDate(fechaEv.getDate() + (e.diasDesdeInicio || 0));
    const fStr = fechaEv.toISOString().split('T')[0];
    html += '<div style="display:flex;justify-content:space-between;font-size:0.78rem;padding:3px 0;border-bottom:1px solid var(--gris-borde)">' +
      '<span>' + (TIPOS_EVENTO_PROT[e.tipo] || e.tipo) + ' · ' + e.nombre + '</span>' +
      '<span style="color:var(--gris-texto)">' + fmt(fStr) + (e.intervaloRepeticion > 0 ? ' · repite c/' + e.intervaloRepeticion + 'd' : '') + '</span>' +
    '</div>';
  });
  html += '</div>';
  prev.innerHTML = html;
}

function confirmarAplicarProtocolo() {
  if (!_animalPendiente) return;
  const selId    = document.getElementById('ap-protocolo').value;
  const fechaIni = document.getElementById('ap-fecha-inicio').value;
  if (!selId || !fechaIni) { alert('⚠️ Elige el protocolo y la fecha de inicio'); return; }
  const prot = db.protocolos.find(function(p) { return p.id === selId; });
  if (!prot) return;

  // Guardar en el animal cuáles protocolos tiene activos
  if (!_animalPendiente.protocolosAplicados) _animalPendiente.protocolosAplicados = [];
  _animalPendiente.protocolosAplicados.push({ protocoloId: selId, fechaInicio: fechaIni });

  db.animales.push(_animalPendiente);
  aplicarProtocoloAlAnimal(_animalPendiente.id, prot, fechaIni);

  guardarDB();
  cerrarModal('modal-aplicar-protocolo');
  renderTablaAnimales();
  renderSalud();
  alert('✅ Animal "' + _animalPendiente.nombre + '" guardado.\nSe crearon ' + prot.eventos.length + ' recordatorios del protocolo "' + prot.nombre + '".');
  _animalPendiente = null;
  resetFormularioAnimal();
}

// Aplica un protocolo a un animal ya existente (desde el módulo de protocolos o al crear animal)
function aplicarProtocoloAlAnimal(animalId, prot, fechaIni) {
  const base = new Date(fechaIni + 'T12:00:00');
  prot.eventos.forEach(function(e) {
    const fechaEv = new Date(base.getTime());
    fechaEv.setDate(fechaEv.getDate() + (e.diasDesdeInicio || 0));
    const fStr = fechaEv.toISOString().split('T')[0];
    db.salud.push({
      id:               nuevoId('S'),
      animalId,
      tipo:             e.tipo,
      desc:             e.nombre,
      medicamento:      '', medicamentoInvId: null, cantidadUsada: 0, dosis: '',
      fecha:            fStr,
      proxima:          e.intervaloRepeticion > 0 ? calcularProximaFecha(fStr, e.intervaloRepeticion) : '',
      veterinario:      '',
      origenProtocolo:  prot.id,
      eventoProtocolo:  e.nombre,
      intervaloDias:    e.intervaloRepeticion || 0,
      pendiente:        true,   // ← es un recordatorio futuro, todavía no ejecutado
    });
  });
}

// También permite aplicar un protocolo adicional a un animal ya registrado
function aplicarProtocoloAAnimalExistente(animalId) {
  const animal = db.animales.find(function(a) { return a.id === animalId; });
  if (!animal) return;
  const protDisp = db.protocolos.filter(function(p) { return p.tipo === animal.tipo || p.tipo === 'ambos'; });
  if (protDisp.length === 0) { alert('No hay protocolos disponibles para este tipo de animal.'); return; }

  // Reutilizamos el modal de aplicar protocolo
  _animalPendiente = null; // no hay animal pendiente de guardar
  _animalExistenteParaProtocolo = animalId;

  const sel = document.getElementById('ap-protocolo');
  sel.innerHTML = protDisp.map(function(p) {
    return '<option value="' + p.id + '">' + p.nombre + '</option>';
  }).join('');
  document.getElementById('ap-fecha-inicio').value = hoyISO();
  previsualizarProtocolo();

  // Cambiar el botón de confirmar para el caso "animal ya existente"
  const btnConfirmar = document.querySelector('#modal-aplicar-protocolo .btn-verde');
  btnConfirmar.setAttribute('onclick', 'confirmarProtocoloExistente()');

  abrirModal('modal-aplicar-protocolo');
}

let _animalExistenteParaProtocolo = null;

function confirmarProtocoloExistente() {
  if (!_animalExistenteParaProtocolo) return;
  const selId    = document.getElementById('ap-protocolo').value;
  const fechaIni = document.getElementById('ap-fecha-inicio').value;
  if (!selId || !fechaIni) { alert('⚠️ Elige el protocolo y la fecha de inicio'); return; }
  const prot = db.protocolos.find(function(p) { return p.id === selId; });
  if (!prot) return;

  const animal = db.animales.find(function(a) { return a.id === _animalExistenteParaProtocolo; });
  if (!animal.protocolosAplicados) animal.protocolosAplicados = [];
  animal.protocolosAplicados.push({ protocoloId: selId, fechaInicio: fechaIni });

  aplicarProtocoloAlAnimal(_animalExistenteParaProtocolo, prot, fechaIni);
  guardarDB();
  cerrarModal('modal-aplicar-protocolo');
  renderSalud();
  alert('✅ Protocolo "' + prot.nombre + '" aplicado.\n' + prot.eventos.length + ' recordatorios creados.');

  // Restaurar botón original
  const btnConfirmar = document.querySelector('#modal-aplicar-protocolo .btn-verde');
  btnConfirmar.setAttribute('onclick', 'confirmarAplicarProtocolo()');
  _animalExistenteParaProtocolo = null;
}

function calcularProximaFecha(fechaBase, diasIntervalo) {
  const d = new Date(fechaBase + 'T12:00:00');
  d.setDate(d.getDate() + diasIntervalo);
  return d.toISOString().split('T')[0];
}

// ── FUNCIONES DEL MODAL-SALUD CON PROTOCOLO ──

// Cuando el usuario elige un animal en el modal-salud, muestra los botones de acceso rápido
function cargarProtocolosAnimal(animalId) {
  const panel   = document.getElementById('s-panel-protocolos');
  const botones = document.getElementById('s-botones-protocolo');
  if (!animalId) { panel.style.display = 'none'; return; }

  const animal = db.animales.find(function(a) { return a.id === animalId; });
  if (!animal || !animal.protocolosAplicados || animal.protocolosAplicados.length === 0) {
    panel.style.display = 'none';
    return;
  }

  // Recopilar todos los eventos de todos los protocolos activos del animal
  const eventos = [];
  animal.protocolosAplicados.forEach(function(ap) {
    const prot = db.protocolos.find(function(p) { return p.id === ap.protocoloId; });
    if (!prot) return;
    prot.eventos.forEach(function(e) {
      // Buscar el último registro de este evento para este animal (para calcular próxima)
      const registros = db.salud.filter(function(s) {
        return s.animalId === animalId && s.eventoProtocolo === e.nombre && !s.pendiente;
      }).sort(function(a, b) { return a.fecha > b.fecha ? -1 : 1; });

      // Buscar recordatorio pendiente
      const pendiente = db.salud.find(function(s) {
        return s.animalId === animalId && s.eventoProtocolo === e.nombre && s.pendiente === true;
      });

      let proximaFecha = '';
      let diasRestantes = null;
      if (pendiente) {
        proximaFecha = pendiente.fecha;
        diasRestantes = diasPara(pendiente.fecha);
      } else if (registros.length > 0 && e.intervaloRepeticion > 0) {
        proximaFecha = calcularProximaFecha(registros[0].fecha, e.intervaloRepeticion);
        diasRestantes = diasPara(proximaFecha);
      }

      eventos.push({
        nombre:        e.nombre,
        tipo:          e.tipo,
        protocoloId:   prot.id,
        intervalo:     e.intervaloRepeticion || 0,
        proximaFecha,
        diasRestantes,
        pendienteId:   pendiente ? pendiente.id : null,
      });
    });
  });

  if (eventos.length === 0) { panel.style.display = 'none'; return; }

  panel.style.display = 'block';
  const tipoIcon = { vacuna: '💉', desparasitacion: '🪱', herraje: '🔩', odontologia: '🦷', vitamina: '💊', otro: '🏥' };

  botones.innerHTML = eventos.map(function(ev) {
    let cls = '';
    let badge = '';
    if (ev.diasRestantes !== null) {
      if (ev.diasRestantes < 0)  { cls = 'vencido'; badge = ' 🔴 Vencido hace ' + Math.abs(ev.diasRestantes) + 'd'; }
      else if (ev.diasRestantes <= 14) { cls = 'proximo'; badge = ' ⏰ en ' + ev.diasRestantes + 'd'; }
      else { badge = ' · ' + fmt(ev.proximaFecha); }
    }
    const dataEv = JSON.stringify(ev).replace(/"/g, '&quot;');
    return '<button type="button" class="btn-protocolo-rapido ' + cls + '" onclick="aplicarEventoRapido(' + "'" + encodeURIComponent(JSON.stringify(ev)) + "'" + ')">' +
      (tipoIcon[ev.tipo] || '🏥') + ' ' + ev.nombre + badge +
    '</button>';
  }).join('');
}

// Cuando se hace clic en un botón de acceso rápido del protocolo
function aplicarEventoRapido(evJson) {
  const ev = JSON.parse(decodeURIComponent(evJson));
  const tipoMap = { vacuna: 'vacuna', desparasitacion: 'desparasitacion', herraje: 'herraje', odontologia: 'odontologia', vitamina: 'vitamina', otro: 'otro' };

  document.getElementById('s-tipo').value  = tipoMap[ev.tipo] || 'otro';
  document.getElementById('s-desc').value  = ev.nombre;
  document.getElementById('s-fecha').value = hoyISO();
  document.getElementById('s-protocolo-id').value   = ev.protocoloId;
  document.getElementById('s-intervalo-dias').value  = ev.intervalo;

  // Calcular próxima automáticamente desde HOY + intervalo
  if (ev.intervalo > 0) {
    const proxima = calcularProximaFecha(hoyISO(), ev.intervalo);
    document.getElementById('s-proxima').value = proxima;
    document.getElementById('s-proxima-label').textContent = '(calculada automáticamente · cada ' + ev.intervalo + ' días)';
  } else {
    document.getElementById('s-proxima').value = '';
    document.getElementById('s-proxima-label').textContent = '(evento sin repetición)';
  }

  // Si hay un pendiente vinculado, guardarlo para actualizarlo al guardar
  document.getElementById('s-protocolo-id').value = ev.pendienteId || '';
}

// Cuando el usuario cambia la fecha del evento manualmente, recalcular próxima
function recalcularProximaDesdeIntervalo() {
  const intervalo = Number(document.getElementById('s-intervalo-dias').value) || 0;
  const fecha     = document.getElementById('s-fecha').value;
  if (intervalo > 0 && fecha) {
    document.getElementById('s-proxima').value = calcularProximaFecha(fecha, intervalo);
  }
}
let calMesActual = new Date().getMonth();
let calAnioActual = new Date().getFullYear();
const MESES_NOMBRE = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function cambiarMesCalendario(delta) {
  calMesActual += delta;
  if (calMesActual > 11) { calMesActual = 0; calAnioActual++; }
  if (calMesActual < 0)  { calMesActual = 11; calAnioActual--; }
  renderCalendario();
}

function recolectarEventosCalendario() {
  const eventos = [];
  const porId = {};
  db.animales.forEach(function(a) { porId[a.id] = a; });

  // Eventos PENDIENTES de protocolo (recordatorios futuros)
  db.salud.filter(function(s) { return s.pendiente === true; }).forEach(function(s) {
    const a = porId[s.animalId];
    eventos.push({ fecha: s.fecha, tipo: 'salud', texto: '🛡️ ' + (s.desc || s.tipo) + ': ' + (a ? a.nombre : s.animalId) });
  });

  // Próximas fechas de salud ejecutados (campo proxima, solo si no hay pendiente equivalente)
  db.salud.filter(function(s) { return !s.pendiente && s.proxima; }).forEach(function(s) {
    // No duplicar si ya hay un pendiente para este mismo evento+animal
    const yaHayPendiente = db.salud.some(function(p) {
      return p.pendiente && p.animalId === s.animalId && p.eventoProtocolo === s.eventoProtocolo;
    });
    if (yaHayPendiente) return;
    const a = porId[s.animalId];
    eventos.push({ fecha: s.proxima, tipo: 'salud', texto: '💉 ' + (s.tipo || 'Evento') + ': ' + (a ? a.nombre : s.animalId) });
  });

  // Partos estimados
  db.reproductivo.forEach(function(r) {
    if (!r.fechaParto || r.gestante !== 'si') return;
    const a = porId[r.animalId];
    eventos.push({ fecha: r.fechaParto, tipo: 'repro', texto: '🤰 Parto estimado: ' + (a ? a.nombre : r.animalId) });
  });

  // Vencimientos de medicamentos
  db.medicamentos.forEach(function(m) {
    if (!m.vencimiento) return;
    eventos.push({ fecha: m.vencimiento, tipo: 'med', texto: '💊 Vence: ' + m.nombre });
  });

  // Servicios de monta
  db.servicios.forEach(function(s) {
    eventos.push({ fecha: s.fecha, tipo: 'servicio', texto: '🐎 Servicio: ' + s.sementalNombre + ' × "' + s.yegua + '"' + (s.estado === 'pendiente' ? ' (pago pendiente)' : '') });
  });

  return eventos;
}

function renderCalendario() {
  const eventos = recolectarEventosCalendario();
  document.getElementById('cal-titulo-mes').textContent = MESES_NOMBRE[calMesActual] + ' ' + calAnioActual;

  document.getElementById('cal-leyenda').innerHTML =
    '<span class="cal-leyenda-item"><span class="cal-leyenda-dot" style="background:var(--rojo)"></span> Salud / vacunas</span>' +
    '<span class="cal-leyenda-item"><span class="cal-leyenda-dot" style="background:#9D4EDD"></span> Partos estimados</span>' +
    '<span class="cal-leyenda-item"><span class="cal-leyenda-dot" style="background:#0096C7"></span> Vencimiento medicamentos</span>' +
    '<span class="cal-leyenda-item"><span class="cal-leyenda-dot" style="background:var(--tierra)"></span> Servicios de monta</span>';

  const primerDia    = new Date(calAnioActual, calMesActual, 1);
  const diasEnMes     = new Date(calAnioActual, calMesActual + 1, 0).getDate();
  const offsetInicial = primerDia.getDay(); // 0 = domingo
  const hoy = hoyISO();

  const nombresDias = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  let html = nombresDias.map(function(n) { return '<div class="cal-dia-nombre">' + n + '</div>'; }).join('');

  for (let i = 0; i < offsetInicial; i++) html += '<div class="cal-celda vacia"></div>';

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const fechaStr = calAnioActual + '-' + String(calMesActual + 1).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
    const evDia = eventos.filter(function(e) { return e.fecha === fechaStr; });
    const esHoy = fechaStr === hoy;
    html += '<div class="cal-celda' + (esHoy ? ' hoy' : '') + '">' +
      '<div class="cal-num">' + dia + '</div>' +
      evDia.slice(0, 3).map(function(e) {
        return '<span class="cal-evento ' + e.tipo + '" title="' + e.texto.replace(/"/g, '') + '">' + e.texto + '</span>';
      }).join('') +
      (evDia.length > 3 ? '<span style="font-size:0.6rem;color:var(--gris-texto)">+' + (evDia.length - 3) + ' más</span>' : '') +
      '</div>';
  }
  document.getElementById('cal-grid').innerHTML = html;

  // Lista de próximas novedades (orden cronológico, desde hoy en adelante, máx 20)
  const proximos = eventos
    .filter(function(e) { return e.fecha >= hoy; })
    .sort(function(a, b) { return a.fecha < b.fecha ? -1 : 1; })
    .slice(0, 20);
  document.getElementById('cal-lista-eventos').innerHTML = proximos.map(function(e) {
    const d = diasPara(e.fecha);
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--gris-borde);font-size:0.83rem">' +
      '<span>' + e.texto + '</span>' +
      '<span class="badge ' + (d <= 7 ? 'badge-amarillo' : 'badge-gris') + '">' + fmt(e.fecha) + (d >= 0 ? ' · en ' + d + 'd' : '') + '</span>' +
      '</div>';
  }).join('') || '<p style="color:var(--gris-texto);font-size:0.85rem">No hay novedades próximas registradas.</p>';
}

// ============================================================
// EXPORTAR / IMPORTAR CSV
// ============================================================
function exportarCSV() {
  const header = ['ID','Tipo','Nombre','Sexo','Raza','Nacimiento','Peso','Estado','Procedencia','Notas'];
  const filas  = [header].concat(db.animales.map(function(a) {
    return [a.id, a.tipo, a.nombre, a.sexo, a.raza, a.nacimiento, a.peso, a.estado, a.procedencia, a.notas];
  }));
  const csv  = filas.map(function(f) { return f.map(function(c) { return '"' + (c || '') + '"'; }).join(','); }).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'mi-finca-animales.csv';
  a.click(); URL.revokeObjectURL(url);
}

function importarCSV(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const lineas = e.target.result.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
    if (lineas.length < 2) { alert('⚠️ El CSV está vacío'); return; }
    const sep = lineas[0].includes(';') ? ';' : ',';
    function parseFila(linea) {
      const res = []; let actual = ''; let inQ = false;
      for (let i = 0; i < linea.length; i++) {
        const c = linea[i];
        if (c === '"') inQ = !inQ;
        else if (c === sep && !inQ) { res.push(actual.trim()); actual = ''; }
        else actual += c;
      }
      res.push(actual.trim()); return res;
    }
    const enc = parseFila(lineas[0]).map(function(h) { return h.toLowerCase().replace(/[^a-z]/gi, ''); });
    const ci  = function(n) { return enc.findIndex(function(h) { return h.includes(n); }); };
    const iN  = ci('nombre'); if (iN === -1) { alert('⚠️ No se encontró columna "Nombre"'); input.value = ''; return; }
    const iT  = ci('tipo'), iS = ci('sexo'), iR = ci('raza');
    const iFe = ci('nacimiento') !== -1 ? ci('nacimiento') : ci('fecha');
    const iP  = ci('peso'), iE = ci('estado');
    const iPr = ci('procedencia') !== -1 ? ci('procedencia') : ci('origen');
    const iNo = ci('notas');
    let agregados = 0;
    const nuevos = lineas.slice(1).map(function(linea) {
      const cols = parseFila(linea);
      const leer = function(idx) { return (idx >= 0 && cols[idx]) ? cols[idx].replace(/^"|"$/g, '').trim() : ''; };
      const nombre = leer(iN); if (!nombre) return null;
      const tipoRaw = (leer(iT) || 'bovino').toLowerCase();
      const tipo    = tipoRaw.includes('equino') || tipoRaw.includes('caball') ? 'equino' : 'bovino';
      let nacISO = leer(iFe);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(nacISO)) { const p = nacISO.split('/'); nacISO = p[2] + '-' + p[1] + '-' + p[0]; }
      agregados++;
      return {
        id: nuevoId(tipo === 'bovino' ? 'BOV' : 'EQU'), tipo, nombre,
        sexo:        (leer(iS) || 'hembra').toLowerCase().includes('macho') ? 'macho' : 'hembra',
        raza:        leer(iR) || '',
        nacimiento:  nacISO,
        peso:        Number(leer(iP).replace(/[^\d.]/g, '')) || 0,
        estado:      ['vendido','muerto'].includes((leer(iE) || '').toLowerCase()) ? leer(iE).toLowerCase() : 'activo',
        procedencia: ['nacido','importado'].includes((leer(iPr) || '').toLowerCase()) ? leer(iPr).toLowerCase() : 'comprado',
        madre: '', padre: '', notas: leer(iNo) || '',
      };
    }).filter(Boolean);
    if (!confirm('✅ ' + agregados + ' animal(es) para importar. ¿Continuar?')) { input.value = ''; return; }
    db.animales = db.animales.concat(nuevos);
    guardarDB();
    input.value = '';
    mostrarPagina('animales');
    alert('✅ ' + agregados + ' animal(es) importados y sincronizados');
  };
  reader.readAsText(file, 'UTF-8');
}

// ============================================================
// EXPORTAR FICHA A WORD (.docx)
// ============================================================
function dataURLtoUint8Array(dataUrl) {
  const base64 = dataUrl.split(',')[1];
  const binStr = atob(base64);
  const bytes  = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  return bytes;
}

function descargarFichaWord() {
  if (!idFichaActual) return;
  const a = db.animales.find(function(x) { return x.id === idFichaActual; });
  if (!a) return;

  if (!window.docx) { alert('⚠️ No se pudo cargar el generador de Word. Verifica tu conexión a internet.'); return; }
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
          HeadingLevel, BorderStyle, WidthType, ShadingType, AlignmentType } = window.docx;

  const btn = document.getElementById('btn-descargar-ficha');
  const textoOriginal = btn.textContent;
  btn.textContent = '⏳ Generando...';
  btn.disabled = true;

  const border  = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const borders = { top: border, bottom: border, left: border, right: border };
  const margins = { top: 70, bottom: 70, left: 100, right: 100 };
  const TABLE_W = 9360;

  function celda(texto, opts) {
    opts = opts || {};
    return new TableCell({
      borders, margins,
      width: { size: opts.width || (TABLE_W / 2), type: WidthType.DXA },
      shading: opts.shading ? { fill: opts.shading, type: ShadingType.CLEAR } : undefined,
      children: [new Paragraph({ children: [new TextRun({ text: String(texto), bold: !!opts.bold, size: 20 })] })]
    });
  }

  function tablaSimple(headers, filas, anchos) {
    const w = anchos || headers.map(function() { return Math.floor(TABLE_W / headers.length); });
    const filaHeader = new TableRow({
      children: headers.map(function(h, i) { return celda(h, { bold: true, shading: 'E8F4FD', width: w[i] }); })
    });
    const filasDatos = filas.map(function(f) {
      return new TableRow({ children: f.map(function(c, i) { return celda(c, { width: w[i] }); }) });
    });
    return new Table({ width: { size: TABLE_W, type: WidthType.DXA }, columnWidths: w, rows: [filaHeader].concat(filasDatos) });
  }

  function tituloSeccion(texto) {
    return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun(texto)] });
  }

  // Datos relacionados
  const saludA  = db.salud.filter(function(s) { return s.animalId === idFichaActual; }).sort(function(x,y){ return x.fecha > y.fecha ? -1 : 1; });
  const reproA  = db.reproductivo.filter(function(r) { return r.animalId === idFichaActual; });
  const lecheA  = db.leche.filter(function(l) { return l.animalId === idFichaActual; });
  const carneA  = db.carne.filter(function(c) { return c.animalId === idFichaActual; }).sort(function(x,y){ return x.fecha > y.fecha ? 1 : -1; });
  const tipoIcon = { vacuna: 'Vacuna', desparasitacion: 'Desparasitacion', herraje: 'Herraje', odontologia: 'Odontologia', vitamina: 'Vitamina', otro: 'Otro' };

  const children = [];

  // ── Encabezado oficial ICA/FEDEGAN ──
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: 'REPÚBLICA DE COLOMBIA', bold: true, size: 22, font: 'Arial' })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: 'INSTITUTO COLOMBIANO AGROPECUARIO — ICA', bold: true, size: 22, font: 'Arial', color: '1B4332' })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 60 },
    children: [new TextRun({ text: 'FEDEGAN — Federación Colombiana de Ganaderos', size: 20, font: 'Arial', color: '2D6A4F' })]
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1B4332', space: 1 } },
    children: [new TextRun({ text: 'FICHA INDIVIDUAL DE ANIMAL — SISTEMA DE TRAZABILIDAD', bold: true, size: 24, font: 'Arial' })]
  }));

  // Datos del predio
  children.push(new Paragraph({ spacing: { before: 160, after: 80 }, children: [new TextRun({ text: 'DATOS DEL PREDIO', bold: true, size: 22, color: '1B4332' })] }));
  children.push(tablaSimple(['Campo', 'Valor'], [
    ['Nombre del predio', db.config.nombre || '-'],
    ['Propietario', db.config.propietario || '-'],
    ['Ubicación', db.config.lugar || '-'],
    ['Fecha de expedición', fmt(hoyISO())],
  ], [3000, 6360]));

  // Foto
  if (a.foto) {
    try {
      const imgBytes = dataURLtoUint8Array(a.foto);
      children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 80 },
        children: [new ImageRun({ type: 'jpg', data: imgBytes, transformation: { width: 180, height: 180 } })]
      }));
    } catch(e) { console.error('Error agregando foto al Word:', e); }
  }

  // Información general del animal
  children.push(tituloSeccion('1. Identificación del animal'));
  children.push(tablaSimple(['Campo', 'Valor'], [
    ['ID interno del sistema', a.id],
    ['Nombre', a.nombre],
    ['Especie', a.tipo === 'bovino' ? 'Bovina' : 'Equina'],
    ['Sexo', a.sexo === 'hembra' ? 'Hembra' : 'Macho'],
    ['Raza', a.raza || '-'],
    ['Fecha de nacimiento', fmt(a.nacimiento)],
    ['Edad', edad(a.nacimiento)],
    ['Peso actual (kg)', a.peso + ' kg'],
    ['Estado', a.estado],
    ['Procedencia', a.procedencia],
    ['Madre (ID)', a.madre || '-'],
    ['Padre (ID)', a.padre || '-'],
    ...(a.tipo === 'equino' && a.sexo === 'macho' ? [['Estado reproductivo', a.estadoReproductivo === 'entero' ? 'Entero (Semental)' : 'Capado / Castrado']] : []),
  ], [3500, 5860]));

  if (a.notas) {
    children.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: 'Observaciones: ', bold: true }), new TextRun(a.notas)] }));
  }

  // TRAZABILIDAD / SINIGAN
  children.push(tituloSeccion('2. Trazabilidad y marcación oficial'));
  children.push(tablaSimple(['Identificación', 'Valor'], [
    ['Número de arete / Código SINIGAN', a.arete || 'No registrado'],
    ['Marca en candela / Hierro', a.marcaCandela || 'No registrado'],
  ], [4000, 5360]));
  children.push(new Paragraph({
    spacing: { before: 80 },
    children: [new TextRun({ text: 'Nota: ', bold: true, size: 18 }), new TextRun({ text: 'El código SINIGAN (Sistema de Información de la Cadena Bovina) es el número oficial de trazabilidad asignado por el ICA. Su registro es obligatorio para movilización y comercialización de ganado.', size: 18, color: '666666' })]
  }));

  // Ubicación / potrero
  children.push(tituloSeccion('3. Ubicación actual'));
  if (a.potrero) {
    const diasEn = a.potreroFecha ? Math.abs(diasPara(a.potreroFecha)) : null;
    children.push(tablaSimple(['Campo', 'Valor'], [
      ['Potrero / lugar actual', a.potrero],
      ['En este potrero desde', a.potreroFecha ? fmt(a.potreroFecha) + (diasEn !== null ? ' (hace ' + diasEn + ' días)' : '') : '-'],
    ], [3500, 5860]));
  } else {
    children.push(new Paragraph({ children: [new TextRun('No se ha registrado un potrero o ubicación para este animal.')] }));
  }

  // Historial médico / medicamentos
  children.push(tituloSeccion('4. Historial sanitario y medicamentos'));
  if (saludA.length === 0) {
    children.push(new Paragraph({ children: [new TextRun('Sin registros médicos.')] }));
  } else {
    children.push(tablaSimple(
      ['Fecha', 'Tipo', 'Descripción / Protocolo', 'Medicamento / Dosis', 'Próxima fecha', 'Veterinario'],
      saludA.map(function(s) {
        return [
          fmt(s.fecha),
          tipoIcon[s.tipo] || s.tipo,
          (s.desc || '-') + (s.origenProtocolo ? ' (Prot.)' : ''),
          (s.medicamento || '-') + (s.dosis ? ' (' + s.dosis + ')' : ''),
          s.proxima ? fmt(s.proxima) : '-',
          s.veterinario || '-'
        ];
      }),
      [1100, 1300, 2200, 2060, 1300, 1400]
    ));
  }

  // Producción de leche
  if (a.tipo === 'bovino' && a.sexo === 'hembra' && lecheA.length > 0) {
    const totalL = lecheA.reduce(function(s, l) { return s + l.litros; }, 0);
    const promL  = (totalL / lecheA.length).toFixed(1);
    children.push(tituloSeccion('5. Producción de leche'));
    children.push(new Paragraph({ children: [new TextRun('Registros: ' + lecheA.length + ' · Total acumulado: ' + totalL.toFixed(1) + ' L · Promedio diario: ' + promL + ' L/día')] }));
  }

  // Historial de pesajes / carne
  if (carneA.length > 0) {
    children.push(tituloSeccion('6. Historial de pesajes'));
    let gananciaTotal = '-';
    if (carneA.length >= 2) gananciaTotal = (carneA[carneA.length-1].peso - carneA[0].peso).toFixed(1) + ' kg';
    children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: 'Ganancia de peso total: ', bold: true }), new TextRun(gananciaTotal)] }));
    children.push(tablaSimple(
      ['Fecha', 'Peso (kg)', 'Precio/kg', 'Destino', 'Observaciones'],
      carneA.slice().sort(function(x,y){ return x.fecha > y.fecha ? -1 : 1; }).map(function(c) {
        const destLabel = { seguimiento: 'Seguimiento', venta: 'Venta', faena: 'Faena', subasta: 'Subasta' };
        return [fmt(c.fecha), c.peso, c.precioKg > 0 ? moneda(c.precioKg) : '-', destLabel[c.destino] || c.destino, c.obs || '-'];
      }),
      [1300, 1300, 1500, 1500, 3760]
    ));
  }

  // Historial reproductivo
  if (reproA.length > 0) {
    children.push(tituloSeccion('7. Historial reproductivo'));
    children.push(tablaSimple(
      ['Fecha', 'Evento', 'Macho', '¿Gestante?', 'Parto estimado', 'Observaciones'],
      reproA.map(function(r) {
        return [fmt(r.fecha), r.tipo, r.macho || '-', r.gestante === 'si' ? 'Sí' : 'No', r.fechaParto ? fmt(r.fechaParto) : '-', r.obs || '-'];
      }),
      [1100, 1300, 1300, 1100, 1500, 3060]
    ));
  }

  // Firma
  children.push(new Paragraph({ spacing: { before: 600 }, children: [] }));
  children.push(tablaSimple(['Firma del responsable / Veterinario', 'Fecha', 'Sello del predio'], [['', '', '']], [4000, 2500, 2860]));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200 },
    children: [new TextRun({ text: 'Documento generado por el sistema Mi Finca · ' + fmt(hoyISO()), size: 16, color: '999999', italics: true })]
  }));

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 32, bold: true, font: 'Arial', color: '1B4332' },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 26, bold: true, font: 'Arial', color: '2D6A4F' },
          paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 1 } },
      ]
    },
    sections: [{
      properties: {
        page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1440, bottom: 1080, left: 1440 } }
      },
      children
    }]
  });

  Packer.toBlob(doc).then(function(blob) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'ficha-' + a.id + '-' + (a.nombre || 'animal').replace(/[^a-zA-Z0-9-_]/g, '_') + '.docx';
    link.click();
    URL.revokeObjectURL(url);
    btn.textContent = textoOriginal;
    btn.disabled = false;
  }).catch(function(e) {
    console.error('Error generando Word:', e);
    alert('⚠️ Error al generar el documento Word');
    btn.textContent = textoOriginal;
    btn.disabled = false;
  });
}
