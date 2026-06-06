// ============================================================
// MI FINCA — Gestión Ganadera
// app.js — Toda la lógica JavaScript de la aplicación
// ============================================================

// ============================================================
// CONFIGURACIÓN FIREBASE
// ============================================================
const CONFIG_KEY   = 'miFincaFirebaseConfig';
const DB_CACHE_KEY = 'miFincaDBCache';

let firebaseApp    = null;
let auth           = null;
let firestore      = null;
let usuarioActual  = null;
let db             = crearDBVacia();
let idAnimalEnEdicion = null;
let syncTimeout    = null;
let modoTab        = 'login';

function crearDBVacia() {
  return {
    config: { nombre: 'Mi Finca', propietario: 'Administrador', lugar: '' },
    animales: [], leche: [], reproductivo: [], salud: [], alimentacion: [], finanzas: []
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
    finanzas:     Array.isArray(seguro.finanzas)     ? seguro.finanzas     : []
  };
}

function parsearFirebaseConfig(texto) {
  try {
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No se encontró objeto JSON');
    const jsonStr = jsonMatch[0]
      .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":')
      .replace(/'/g, '"');
    return JSON.parse(jsonStr);
  } catch(e) {
    const config = {};
    const campos = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
    for (const campo of campos) {
      const m = texto.match(new RegExp(campo + '\\s*:\\s*["\']([^"\']+)["\']'));
      if (m) config[campo] = m[1];
    }
    if (!config.apiKey) throw new Error('No se pudo extraer apiKey');
    return config;
  }
}

function validarFirebaseConfig(cfg) {
  const campos = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
  const faltantes = campos.filter(function(campo) {
    return !cfg[campo] || String(cfg[campo]).trim() === '';
  });
  if (faltantes.length > 0) throw new Error('Faltan campos requeridos: ' + faltantes.join(', '));
  const placeholders = Object.values(cfg).filter(function(valor) {
    return typeof valor === 'string' && valor.replace(/\s+/g, '') === '...';
  });
  if (placeholders.length > 0) throw new Error('La configuración parece de ejemplo. Pega los valores reales de Firebase.');
  return true;
}

function guardarConfigFirebase() {
  const texto  = document.getElementById('cfg-paste').value.trim();
  const errDiv = document.getElementById('cfg-error');
  errDiv.style.display = 'none';
  if (!texto) { errDiv.textContent = 'Pega la configuración de Firebase'; errDiv.style.display = 'block'; return; }
  try {
    const cfg = parsearFirebaseConfig(texto);
    validarFirebaseConfig(cfg);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
    inicializarFirebase(cfg);
  } catch(e) {
    errDiv.textContent = '⚠️ Error: ' + e.message + '. Asegúrate de pegar el objeto firebaseConfig real de tu proyecto.';
    errDiv.style.display = 'block';
  }
}

function cambiarFirebase() {
  document.getElementById('pantalla-login').style.display      = 'none';
  document.getElementById('pantalla-configurar').style.display = 'flex';
}

function inicializarFirebase(config) {
  try {
    if (firebase.apps.length > 0) {
      firebase.apps.forEach(function(app) { app.delete(); });
    }
    firebaseApp = firebase.initializeApp(config);
    auth        = firebase.auth();
    firestore   = firebase.firestore();

    document.getElementById('pantalla-configurar').style.display = 'none';
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
  const cfgGuardada = localStorage.getItem(CONFIG_KEY);
  if (cfgGuardada) {
    try {
      const cfg = JSON.parse(cfgGuardada);
      inicializarFirebase(cfg);
    } catch(e) {
      mostrarConfiguracion();
    }
  } else {
    mostrarConfiguracion();
  }

  // Cerrar modales al hacer clic fuera
  document.querySelectorAll('.modal-overlay').forEach(function(m) {
    m.addEventListener('click', function(e) { if (e.target === this) this.classList.remove('open'); });
  });
  document.getElementById('menu-toggle').addEventListener('click', toggleSidebar);
  document.getElementById('sidebar-overlay').addEventListener('click', cerrarSidebar);
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') cerrarSidebar(); });
});

function mostrarConfiguracion() {
  document.getElementById('pantalla-cargando').style.display   = 'none';
  document.getElementById('pantalla-login').style.display      = 'none';
  document.getElementById('app-principal').style.display       = 'none';
  document.getElementById('pantalla-configurar').style.display = 'flex';
}

function mostrarCargando(texto) {
  document.getElementById('pantalla-configurar').style.display = 'none';
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
          animales: [], leche: [], reproductivo: [], salud: [], alimentacion: [], finanzas: [],
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
  animales:     '🐴 Mis animales',
  leche:        '🥛 Producción de leche',
  reproduccion: '🧬 Reproducción',
  salud:        '💉 Salud y vacunas',
  alimentacion: '🌾 Alimentación',
  finanzas:     '💰 Control financiero',
  inventario:   '📦 Inventario general',
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
  if (nombre === 'animales')     renderTablaAnimales();
  if (nombre === 'leche')        renderLeche();
  if (nombre === 'reproduccion') renderReproduccion();
  if (nombre === 'salud')        renderSalud();
  if (nombre === 'alimentacion') renderAlimentacion();
  if (nombre === 'finanzas')     renderFinanzas();
  if (nombre === 'inventario')   renderInventario();
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
  if (id === 'modal-salud')  llenarSelectAnimales();
  ['l-fecha','r-fecha','s-fecha','al-fecha','g-fecha','v-fecha'].forEach(function(fid) {
    const el = document.getElementById(fid);
    if (el && !el.value) el.value = hoyISO();
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
  ['a-nombre','a-raza','a-nacimiento','a-peso','a-madre','a-padre','a-notas'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
  document.getElementById('a-tipo').value        = 'bovino';
  document.getElementById('a-sexo').value        = 'hembra';
  document.getElementById('a-procedencia').value = 'nacido';
  document.getElementById('a-estado').value      = 'activo';
}

function guardarAnimal() {
  const nombre = document.getElementById('a-nombre').value.trim();
  const nac    = document.getElementById('a-nacimiento').value;
  const peso   = document.getElementById('a-peso').value;
  if (!nombre || !nac || !peso) { alert('⚠️ Completa los campos obligatorios'); return; }
  const tipo   = document.getElementById('a-tipo').value;
  const animal = {
    id:          idAnimalEnEdicion || nuevoId(tipo === 'bovino' ? 'BOV' : 'EQU'),
    tipo,
    nombre,
    sexo:        document.getElementById('a-sexo').value,
    raza:        document.getElementById('a-raza').value,
    nacimiento:  nac,
    peso:        Number(peso),
    estado:      document.getElementById('a-estado').value,
    procedencia: document.getElementById('a-procedencia').value,
    madre:       document.getElementById('a-madre').value,
    padre:       document.getElementById('a-padre').value,
    notas:       document.getElementById('a-notas').value,
  };
  if (idAnimalEnEdicion) {
    const i = db.animales.findIndex(function(a) { return a.id === idAnimalEnEdicion; });
    if (i !== -1) db.animales[i] = animal;
    alert('✅ Animal "' + nombre + '" actualizado');
  } else {
    db.animales.push(animal);
    alert('✅ Animal "' + nombre + '" guardado · ID: ' + animal.id);
  }
  guardarDB();
  cerrarModal('modal-animal');
  renderTablaAnimales();
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
  document.getElementById('a-madre').value       = a.madre || '';
  document.getElementById('a-padre').value       = a.padre || '';
  document.getElementById('a-notas').value       = a.notas || '';
  idAnimalEnEdicion = id;
  abrirModal('modal-animal');
}

function eliminarAnimal(id) {
  if (!confirm('¿Eliminar este animal?')) return;
  db.animales     = db.animales.filter(function(a) { return a.id !== id; });
  db.leche        = db.leche.filter(function(r) { return r.animalId !== id; });
  db.reproductivo = db.reproductivo.filter(function(r) { return r.animalId !== id; });
  db.salud        = db.salud.filter(function(r) { return r.animalId !== id; });
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
  guardarDB();
  renderTablaAnimales(); renderDashboard(); renderLeche(); renderReproduccion(); renderSalud(); renderInventario();
}

// ============================================================
// GUARDAR DATOS — MÓDULOS
// ============================================================
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

function guardarSalud() {
  const animalId = document.getElementById('s-animal').value;
  const fecha    = document.getElementById('s-fecha').value;
  if (!animalId || !fecha) { alert('⚠️ Selecciona el animal y la fecha'); return; }
  db.salud.push({
    id: nuevoId('S'), animalId,
    tipo:        document.getElementById('s-tipo').value,
    desc:        document.getElementById('s-desc').value,
    medicamento: document.getElementById('s-medicamento').value,
    dosis:       document.getElementById('s-dosis').value,
    fecha,
    proxima:     document.getElementById('s-proxima').value,
    veterinario: document.getElementById('s-vet').value,
  });
  guardarDB();
  cerrarModal('modal-salud');
  renderSalud();
  ['s-desc','s-medicamento','s-dosis','s-proxima','s-vet'].forEach(function(id) {
    document.getElementById(id).value = '';
  });
}

function guardarAlimento() {
  const cantidad = document.getElementById('al-cantidad').value;
  const kg       = document.getElementById('al-kg').value;
  if (!cantidad || !kg) { alert('⚠️ Completa cantidad y kg'); return; }
  db.alimentacion.push({
    id: nuevoId('A'),
    tipo:          document.getElementById('al-tipo').value,
    fecha:         document.getElementById('al-fecha').value,
    cantidad:      Number(cantidad),
    kg:            Number(kg),
    consumoDiario: Number(document.getElementById('al-consumo').value) || 0,
    costo:         Number(document.getElementById('al-costo').value) || 0,
    notas:         document.getElementById('al-notas').value,
  });
  guardarDB();
  cerrarModal('modal-alimento');
  renderAlimentacion();
}

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
    if (busca && !a.nombre.toLowerCase().includes(busca) && !a.id.toLowerCase().includes(busca)) return false;
    return true;
  });
  document.getElementById('conteo-animales').textContent = filtrados.length + ' resultados';
  document.getElementById('tbody-animales').innerHTML = filtrados.map(function(a) {
    return '<tr onclick="verFicha(\'' + a.id + '\')">' +
      '<td><code style="font-size:0.78rem;color:var(--verde-medio)">' + a.id + '</code></td>' +
      '<td>' + (a.tipo === 'bovino' ? '🐄' : '🐎') + ' ' + a.tipo + '</td>' +
      '<td><strong>' + a.nombre + '</strong></td>' +
      '<td><span class="badge ' + (a.sexo === 'hembra' ? 'badge-tierra' : 'badge-azul') + '">' + a.sexo + '</span></td>' +
      '<td>' + (a.raza || '-') + '</td><td>' + edad(a.nacimiento) + '</td><td>' + a.peso + ' kg</td>' +
      '<td>' + badgeEstado(a.estado) + '</td>' +
      '<td style="display:flex;gap:6px">' +
        '<button class="btn btn-sm btn-outline" onclick="event.stopPropagation();editarAnimal(\'' + a.id + '\')">✏️</button>' +
        '<button class="btn btn-sm btn-rojo"    onclick="event.stopPropagation();eliminarAnimal(\'' + a.id + '\')">🗑️</button>' +
        (a.estado === 'muerto' || a.estado === 'vendido' ? '<button class="btn btn-sm" style="background:#7c5c3c;color:#fff" title="Eliminar todo" onclick="event.stopPropagation();eliminarCompleto(\'' + a.id + '\')">🗑️✕</button>' : '') +
      '</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--gris-texto);padding:1.5rem">Sin animales que coincidan</td></tr>';
}

function verFicha(id) {
  const a = db.animales.find(function(x) { return x.id === id; });
  if (!a) return;
  const saludA  = db.salud.filter(function(s) { return s.animalId === id; });
  const reproA  = db.reproductivo.filter(function(r) { return r.animalId === id; });
  const lecheA  = db.leche.filter(function(l) { return l.animalId === id; });
  const tipoIcon = { vacuna: '💉', desparasitacion: '🪱', herraje: '🔩', odontologia: '🦷', vitamina: '💊', otro: '🏥' };
  const totalL  = lecheA.reduce(function(s, l) { return s + l.litros; }, 0);
  const promL   = lecheA.length > 0 ? (totalL / lecheA.length).toFixed(1) : '-';

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

  document.getElementById('ficha-contenido').innerHTML =
    '<div class="ficha-animal">' +
      '<div class="ficha-emoji">' + (a.tipo === 'bovino' ? '🐄' : '🐎') + '</div>' +
      '<div>' +
        '<h2 style="font-size:1.3rem;font-family:\'Playfair Display\',serif;color:var(--verde-oscuro)">' + a.nombre + '</h2>' +
        '<p style="color:var(--gris-texto);font-size:0.82rem">ID: ' + a.id + ' · ' + (a.raza || 'Raza no especificada') + ' · ' + edad(a.nacimiento) + '</p>' +
        '<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">' + badgeEstado(a.estado) +
          '<span class="badge ' + (a.sexo === 'hembra' ? 'badge-tierra' : 'badge-azul') + '">' + a.sexo + '</span>' +
          '<span class="badge badge-gris">' + a.procedencia + '</span>' +
          '<span class="badge badge-gris">' + a.tipo + '</span></div>' +
      '</div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:1rem">' +
      '<div class="stat-card"><div class="stat-label">Peso</div><div class="stat-value" style="font-size:1.2rem">' + a.peso + ' kg</div></div>' +
      '<div class="stat-card"><div class="stat-label">Nacimiento</div><div class="stat-value" style="font-size:1rem">' + fmt(a.nacimiento) + '</div></div>' +
      '<div class="stat-card"><div class="stat-label">Edad</div><div class="stat-value" style="font-size:1rem">' + edad(a.nacimiento) + '</div></div>' +
    '</div>' +
    (a.notas ? '<div class="ayuda" style="margin-bottom:1rem">📝 ' + a.notas + '</div>' : '') +
    genealogia +
    '<div style="margin-top:1rem">' +
      '<p style="font-size:0.78rem;font-weight:700;color:var(--gris-texto);margin-bottom:6px">💉 HISTORIAL MÉDICO (' + saludA.length + ' registros)</p>' +
      (saludA.length === 0 ? '<p style="font-size:0.82rem;color:var(--gris-texto)">Sin registros médicos.</p>' :
        saludA.map(function(s) {
          return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--gris-borde);font-size:0.82rem">' +
            '<span>' + (tipoIcon[s.tipo] || '🏥') + ' <strong>' + s.tipo + '</strong> — ' + (s.desc || '-') + (s.medicamento ? ' · ' + s.medicamento + ' ' + s.dosis : '') + '</span>' +
            '<span style="color:var(--gris-texto)">' + fmt(s.fecha) + '</span></div>';
        }).join('')) +
    '</div>' +
    (a.tipo === 'bovino' && a.sexo === 'hembra' ?
      '<div style="margin-top:1rem"><p style="font-size:0.78rem;font-weight:700;color:var(--gris-texto);margin-bottom:6px">🥛 PRODUCCIÓN DE LECHE</p>' +
      '<p style="font-size:0.85rem">Registros: <strong>' + lecheA.length + '</strong> · Total: <strong>' + totalL.toFixed(1) + ' L</strong> · Prom: <strong>' + promL + ' L/día</strong></p></div>' : '') +
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
  document.getElementById('tbody-leche').innerHTML = db.leche.slice().reverse().slice(0, 30).map(function(l) {
    const a = db.animales.find(function(x) { return x.id === l.animalId; });
    if (!a || a.estado === 'muerto') return '';
    return '<tr><td>' + fmt(l.fecha) + '</td><td><strong>' + ((a && a.nombre) || l.animalId) + '</strong></td><td><strong style="color:var(--verde-medio)">' + l.litros.toFixed(1) + ' L</strong></td><td style="color:var(--gris-texto)">' + (l.nota || '-') + '</td></tr>';
  }).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin registros</td></tr>';
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
        '</tr>';
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin eventos reproductivos</td></tr>';
}

// ============================================================
// RENDER — SALUD
// ============================================================
function renderSalud() {
  const activos = db.animales.filter(function(a) { return a.estado === 'activo'; }).map(function(a) { return a.id; });
  const alertas = calcularAlertas();
  const body    = document.getElementById('alertas-salud-body');
  if (alertas.length === 0) {
    body.innerHTML = '<p style="color:var(--gris-texto);font-size:0.85rem">✅ Sin alertas — todo al día</p>';
  } else {
    body.innerHTML = alertas.map(function(a) {
      return '<div class="alerta-item ' + (a.dias < 0 ? 'alerta-roja' : a.urgente ? 'alerta-amarilla' : 'alerta-azul') + '">' +
        '<div><strong style="font-size:0.85rem">' + a.animal + ' — ' + a.tipo + '</strong><p style="font-size:0.78rem;color:var(--gris-texto)">' + a.desc + '</p></div>' +
        '<span class="badge ' + (a.dias < 0 ? 'badge-rojo' : a.urgente ? 'badge-amarillo' : 'badge-azul') + '">' +
          (a.dias < 0 ? 'Vencida hace ' + Math.abs(a.dias) + 'd' : a.dias === 0 ? '¡Hoy!' : 'En ' + a.dias + 'd') + '</span>' +
        '</div>';
    }).join('');
  }
  const tipoIcon = { vacuna: '💉', desparasitacion: '🪱', herraje: '🔩', odontologia: '🦷', vitamina: '💊', otro: '🏥' };
  document.getElementById('tbody-salud').innerHTML = db.salud
    .filter(function(s) { return activos.indexOf(s.animalId) !== -1; })
    .map(function(s) {
      const a = db.animales.find(function(x) { return x.id === s.animalId; });
      return '<tr>' +
        '<td><strong>' + ((a && a.nombre) || s.animalId) + '</strong> <small>' + (a && a.tipo === 'bovino' ? '🐄' : '🐎') + '</small></td>' +
        '<td><span class="badge badge-gris">' + (tipoIcon[s.tipo] || '🏥') + ' ' + s.tipo + '</span></td>' +
        '<td>' + (s.desc || '-') + '</td>' +
        '<td>' + (s.medicamento || '-') + (s.dosis ? ' · ' + s.dosis : '') + '</td>' +
        '<td>' + fmt(s.fecha) + '</td>' +
        '<td>' + (s.proxima ? '<span class="badge ' + (diasPara(s.proxima) <= 7 ? 'badge-rojo' : 'badge-amarillo') + '">' + fmt(s.proxima) + '</span>' : '-') + '</td>' +
        '<td>' + (s.veterinario || '-') + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin registros</td></tr>';
}

// ============================================================
// RENDER — ALIMENTACIÓN
// ============================================================
function renderAlimentacion() {
  ['heno', 'concentrado'].forEach(function(tipo) {
    const rs = db.alimentacion.filter(function(a) { return a.tipo === tipo; });
    const ul = rs[rs.length - 1];
    const id = tipo === 'heno' ? 'resumen-heno' : 'resumen-concentrado';
    if (!ul) { document.getElementById(id).innerHTML = '<p style="color:var(--gris-texto);font-size:0.85rem">Sin registros.</p>'; return; }
    const totalKg = ul.cantidad * ul.kg;
    const dias    = ul.consumoDiario > 0 ? Math.floor(totalKg / ul.consumoDiario) : 0;
    const fa      = new Date(ul.fecha);
    fa.setDate(fa.getDate() + dias);
    const diasRes = diasPara(fa.toISOString().split('T')[0]);
    document.getElementById(id).innerHTML =
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:0.75rem">' +
        '<div><p style="font-size:0.7rem;color:var(--gris-texto);font-weight:700;text-transform:uppercase">Cantidad</p>' +
          '<p style="font-size:1.3rem;font-weight:700">' + ul.cantidad + ' unidades</p>' +
          '<p style="font-size:0.78rem;color:var(--gris-texto)">' + totalKg.toFixed(0) + ' kg totales</p></div>' +
        '<div><p style="font-size:0.7rem;color:var(--gris-texto);font-weight:700;text-transform:uppercase">Duración est.</p>' +
          '<p style="font-size:1.3rem;font-weight:700;color:' + (diasRes !== null && diasRes < 14 ? 'var(--rojo)' : 'var(--verde-medio)') + '">' + dias + ' días</p>' +
          '<p style="font-size:0.78rem;color:var(--gris-texto)">hasta ' + fmt(fa.toISOString().split('T')[0]) + '</p></div>' +
      '</div>' +
      '<div style="padding:8px 12px;background:var(--crema);border-radius:8px;font-size:0.8rem">' +
        'Consumo diario: <strong>' + ul.consumoDiario + ' kg/día</strong>' + (ul.notas ? ' · ' + ul.notas : '') + (ul.costo ? ' · Costo: ' + moneda(ul.costo) : '') +
      '</div>';
  });
  document.getElementById('tbody-alimento').innerHTML = db.alimentacion.map(function(a) {
    const totalKg = a.cantidad * a.kg;
    const dias    = a.consumoDiario > 0 ? Math.floor(totalKg / a.consumoDiario) : '-';
    return '<tr>' +
      '<td><span class="badge ' + (a.tipo === 'heno' ? 'badge-verde' : 'badge-tierra') + '">' + (a.tipo === 'heno' ? '🌿 Heno' : '🌽 Concentrado') + '</span></td>' +
      '<td>' + fmt(a.fecha) + '</td><td>' + a.cantidad + '</td><td>' + a.kg + ' kg</td><td>' + a.consumoDiario + ' kg/día</td>' +
      '<td><strong>' + dias + ' días</strong></td><td style="color:var(--gris-texto)">' + (a.notas || '-') + '</td></tr>';
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin registros</td></tr>';
}

// ============================================================
// RENDER — FINANZAS
// ============================================================
function renderFinanzas() {
  const cats    = { alimentacion: '🌾 Alimentación', salud: '💉 Salud', infraestructura: '🏗️ Infraestructura', mano_obra: '👷 Mano de obra', compra_animal: '🐄 Compra animal', otro: '📌 Otro' };
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
    return '<tr><td>' + fmt(f.fecha) + '</td>' +
      '<td><span class="badge ' + (f.tipo === 'ingreso' ? 'badge-verde' : 'badge-rojo') + '">' + (f.tipo === 'ingreso' ? '📈 Ingreso' : '📉 Gasto') + '</span></td>' +
      '<td><span class="badge badge-gris">' + (cats[f.cat] || f.cat) + '</span></td>' +
      '<td>' + f.desc + (f.extra ? '<small style="color:var(--gris-texto)"> · ' + f.extra + '</small>' : '') + '</td>' +
      '<td><strong style="color:' + (f.tipo === 'ingreso' ? 'var(--verde-medio)' : 'var(--rojo)') + '">' + (f.tipo === 'ingreso' ? '+' : '−') + moneda(f.valor) + '</strong></td></tr>';
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--gris-texto);padding:1rem">Sin registros</td></tr>';
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
