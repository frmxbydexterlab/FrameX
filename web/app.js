/**
 * LGSF Framing Engine — Web Platform
 */

const getEl = id => document.getElementById(id);

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s.replace(/[&<>"']/g, function(m) {
    switch (m) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#039;';
      default: return m;
    }
  });
}

function getCurrentUserName() {
  const user = window.currentUser || (typeof authModule !== 'undefined' ? authModule.getCurrentUser() : null);
  if (user) {
    return user.displayName || user.email || "Demo User";
  }
  return "Demo User";
}

function safeGet(obj, key) {
  if (typeof key === 'string' && (key === '__proto__' || key === 'constructor' || key === 'prototype')) {
    return undefined;
  }
  return obj ? Reflect.get(obj, key) : undefined;
}

function safeSet(obj, key, val) {
  if (typeof key === 'string' && (key === '__proto__' || key === 'constructor' || key === 'prototype')) {
    return false;
  }
  return obj ? Reflect.set(obj, key, val) : false;
}

function safeDelete(obj, key) {
  if (typeof key === 'string' && (key === '__proto__' || key === 'constructor' || key === 'prototype')) {
    return false;
  }
  return obj ? Reflect.deleteProperty(obj, key) : false;
}

const MEMBER_COLORS = {
  stud: '#4299e1', end_stud: '#d53f8c', king_stud: '#ed8936', trimmer_stud: '#9f7aea',
  cripple_stud: '#a0aec0', bottom_track: '#fc8181', top_track: '#fc8181',
  header: '#68d391', sill: '#38b2ac', nogging: '#4fd1c5',
};
const MEMBER_LABELS = {
  stud: 'Stud', end_stud: 'End Stud', king_stud: 'King Stud', trimmer_stud: 'Trimmer',
  cripple_stud: 'Cripple', bottom_track: 'Bottom Track', top_track: 'Top Track',
  header: 'Header', sill: 'Sill', nogging: 'Nogging',
};
const MEMBER_DRAW_ORDER = ['bottom_track', 'top_track', 'header', 'sill', 'nogging', 'stud', 'end_stud', 'king_stud', 'trimmer_stud', 'cripple_stud'];

// ─── Wall Layer Constants ────────────────────────────────────────────────────
// Colour mapping by Revit MaterialFunctionAssignment string key
const LAYER_FUNCTION_COLORS = {
  'Structure': '#94a3b8',  // steel grey  — structural core (framing lives here)
  'Finish1': '#f8fafc',  // near-white  — exterior finish (gypsum, render, cladding)
  'Finish2': '#f1f5f9',  // off-white   — interior finish (gypsum board)
  'Substrate': '#d4a96a',  // plywood tan — sheathing / substrate board
  'Insulation': '#fde68a',  // warm yellow — insulation / air layer
  'Membrane': '#a5f3fc',  // light cyan  — vapour barrier / membrane
  'StructuralDeck': '#b0bec5',  // blue-grey   — structural deck layer
  'Other': '#cbd5e1',  // light grey  — unrecognised function
};

// 3D material properties per layer function (roughness, metalness)
const LAYER_FUNCTION_MATERIAL = {
  'Structure': { roughness: 0.6, metalness: 0.3 },
  'Finish1': { roughness: 0.9, metalness: 0.0 },
  'Finish2': { roughness: 0.9, metalness: 0.0 },
  'Substrate': { roughness: 0.8, metalness: 0.0 },
  'Insulation': { roughness: 0.95, metalness: 0.0 },
  'Membrane': { roughness: 0.5, metalness: 0.0 },
  'StructuralDeck': { roughness: 0.7, metalness: 0.2 },
  'Other': { roughness: 0.8, metalness: 0.0 },
};

const LAYER_FUNCTION_NAMES = {
  'Structure': 'Structural Core',
  'Finish1': 'Finish (Exterior)',
  'Finish2': 'Finish (Interior)',
  'Substrate': 'Substrate',
  'Insulation': 'Insulation / Air Layer',
  'Membrane': 'Membrane / Vapour Barrier',
  'StructuralDeck': 'Structural Deck',
  'Other': 'Other',
};


const state = {
  customRevitProfiles: [],
  originalWallsData: null,
  wallsData: null, framingResult: null, currentWallIdx: 0,
  gridsData: [],
  configName: 'us_default', configRaw: null,
  lastSavedConfigName: 'us_default',
  displayUnit: 'mm', theme: 'dark',
  zoom: 1, panX: 60, panY: 40,
  isDragging: false, dragStartX: 0, dragStartY: 0, dragDistance: 0, hoveredMember: null,
  selectedMember: null,
  selectedWallIndices: [0],
  selectedMembers: [],
  selectedOpening: null, hoveredOpening: null,
  hoveredPlanOpening: null, hoveredPlanOpeningWallIdx: null,
  planZoom: 0.05, planPanX: 0, planPanY: 0,
  isPlanDragging: false, planDragStartX: 0, planDragStartY: 0, planDragDistance: 0,
  hoveredPlanMember: null, hoveredPlanWallIdx: null,
  perWallOverrides: {},  // { wallIdx: { stud_spacing: ..., stud_flange: ..., ... } }
  joinOverrides: {},     // { 'stoppedWallId:continuingWallId': 'styleName' }
  selectedJoin: null,
  selectedJoins: [],
  hoveredPlanJoin: null,
  hoveredPlanJoinPos: null,
  wallGroups: {},        // { groupName: { wallIndices: [...], config: {...} } }
  filteredIndices: [],   // wall indices matching current filter
  wallConfigNames: {},   // { wallIdx: 'config_name' or 'Custom *' }
  wallStyle: 'translucent',
  wallOpacity: 0.3,
  sectionBoxActive: false,
  sectionBoxPlanes: [],
  visibilitySettings: {
    showWallVolume: true,
    showFramingGlobal: true,
    showPanelNames: true,
    showGrids: true,
    showJoinMarkers: true,
    bottom_track: true,
    top_track: true,
    stud: true,
    end_stud: true,
    king_stud: true,
    trimmer_stud: true,
    cripple_stud: true,
    header: true,
    sill: true,
    nogging: true,
  },
  viewVisibilitySettings: null,
  visibilityProfiles: null,
  activePanel: 'properties',
  pinnedPanel: 'properties',
  currentProjectId: null,
  currentExchangeId: null,
  activeExchangeName: null,
  hiddenElements: new Set(),
  lockHeartbeatInterval: null,
  isReadOnly: false,
};

function cleanFirestoreData(obj) {
  if (obj === undefined) return null;
  if (obj === null) return null;
  if (Array.isArray(obj)) {
    return obj.map(item => cleanFirestoreData(item));
  }
  if (typeof obj === 'object') {
    const cleaned = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const val = obj[key];
        if (val === undefined) {
          console.warn(`[Firestore Clean] Key "${key}" is undefined. Replacing with null.`);
          cleaned[key] = null;
        } else {
          cleaned[key] = cleanFirestoreData(val);
        }
      }
    }
    return cleaned;
  }
  return obj;
}

// \u2500\u2500\u2500 Cloud-Backed Projects Database (Firestore) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
//
// Data is stored under:
//   /companies/{companyId}/projects/{projectId}
//   /companies/{companyId}/exchange_options/{optId}
//   /companies/{companyId}/versions/{versionId}
//
// setUser(user, companyId, db) is called by auth.js after sign-in.
// Until then, all operations resolve immediately (app is behind login overlay).
class ProjectsDB {
  constructor() {
    this._user      = null;
    this._companyId = null;
    this._db        = null;   // Firestore instance
    this._ready     = false;
  }

  // \u2500 Called by auth.js after successful login \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  setUser(user, companyId, db) {
    this._user      = user;
    this._companyId = companyId;
    this._db        = db;
    this._ready     = true;
    console.log(`[ProjectsDB] Firestore ready — company: ${companyId}`);
  }

  // Returns the authenticated user's display name (falls back to email prefix)
  _currentUserName() {
    if (!this._user) return 'Unknown';
    return this._user.displayName || this._user.email.split('@')[0];
  }

  // ── Collection refs ────────────────────────────────────────────────────────
  _col(name, companyId = null) {
    if (!this._ready) throw new Error('ProjectsDB not initialised. Please sign in first.');
    const cid = companyId || this._companyId;
    return this._db.collection('companies').doc(cid).collection(name);
  }

  // ── Init (no-op for Firestore — kept for API compatibility) ────────────
  async init() {
    // Firestore connects lazily; nothing to open
    return Promise.resolve();
  }

  // ───────────── PROJECTS ─────────────────────────────────────────────────

  async addProject(project, companyId = null) {
    const cid = companyId || this._companyId;
    const cleaned = cleanFirestoreData(project);
    const ref = await this._col('projects', cid).add({
      ...cleaned,
      companyId: cid,
      createdBy: this._currentUserName(),
      createdByUid: this._user.uid,
      createdAt: new Date().toISOString(),
    });
    return ref.id;   // string ID (Firestore auto-ID)
  }

  async getProjects(companyId = null) {
    const snap = await this._col('projects', companyId)
      .orderBy('createdAt', 'desc')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async deleteProject(id, companyId = null) {
    const cid = companyId || this._companyId;
    // Delete child exchange options (and their versions) first
    const opts = await this.getExchangeOptions(id, cid);
    for (const opt of opts) {
      await this.deleteExchangeOption(opt.id, cid);
    }
    await this._col('projects', cid).doc(String(id)).delete();
  }

  // ───────────── EXCHANGE OPTIONS ─────────────────────────────────────────

  async addExchangeOption(opt, companyId = null) {
    const cid = companyId || this._companyId;
    const cleaned = cleanFirestoreData(opt);
    const ref = await this._col('exchange_options', cid).add({
      ...cleaned,
      companyId: cid,
      createdBy: this._currentUserName(),
      createdByUid: this._user.uid,
    });
    return ref.id;
  }

  async updateExchangeOption(opt, companyId = null) {
    const cid = companyId || this._companyId;
    const { id, ...data } = cleanFirestoreData(opt);
    await this._col('exchange_options', cid).doc(String(id)).set(data, { merge: true });
    return id;
  }

  async getExchangeOption(id, companyId = null, forceServer = false) {
    const docRef = this._col('exchange_options', companyId).doc(String(id));
    const snap = forceServer ? await docRef.get({ source: 'server' }) : await docRef.get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
  }

  async getExchangeOptions(projectId, companyId = null) {
    const snap = await this._col('exchange_options', companyId)
      .where('projectId', '==', projectId)
      .orderBy('createdAt', 'asc')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async deleteExchangeOption(id, companyId = null) {
    const cid = companyId || this._companyId;
    const vers = await this.getVersions(id, cid);
    for (const v of vers) {
      await this.deleteVersion(v.id, cid);
    }
    await this._col('exchange_options', cid).doc(String(id)).delete();
  }

  // ───────────── VERSIONS ─────────────────────────────────────────────────

  async addVersion(ver, companyId = null) {
    const cid = companyId || this._companyId;
    const cleaned = cleanFirestoreData(ver);
    const ref = await this._col('versions', cid).add({
      ...cleaned,
      companyId: cid,
      uploadedBy: this._currentUserName(),
      uploadedByUid: this._user.uid,
    });
    return ref.id;
  }

  async getVersions(exchangeOptionId, companyId = null) {
    const snap = await this._col('versions', companyId)
      .where('exchangeOptionId', '==', exchangeOptionId)
      .orderBy('uploadedAt', 'asc')
      .get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async getVersion(id, companyId = null) {
    const snap = await this._col('versions', companyId).doc(String(id)).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
  }

  async deleteVersion(id, companyId = null) {
    const cid = companyId || this._companyId;
    await this._col('versions', cid).doc(String(id)).delete();
  }

  // ───────────── CUSTOM ASSEMBLIES ─────────────────────────────────────────

  async saveCustomAssembly(type, name, data, companyId = null) {
    const cid = companyId || this._companyId;
    const cleanedData = cleanFirestoreData(data);
    const docRef = this._col('custom_assemblies', cid).doc(`${type}_${name}`);
    await docRef.set({
      type: type,
      name: name,
      data: cleanedData,
      updatedAt: new Date().toISOString()
    });
  }

  async getCustomAssemblies(companyId = null) {
    const cid = companyId || this._companyId;
    const snap = await this._col('custom_assemblies', cid).get();
    return snap.docs.map(d => d.data());
  }

  async deleteCustomAssembly(type, name, companyId = null) {
    const cid = companyId || this._companyId;
    await this._col('custom_assemblies', cid).doc(`${type}_${name}`).delete();
  }
}

const projectsDB = new ProjectsDB();


// ─── Concurrency Lock Management (Lease Locks) ─────────────────────────────────

let activeExchangeListener = null;
let readOnlyCheckInterval = null;
let isPopStateNavigation = false;

function pushNavigation(viewType, params = {}) {
  if (isPopStateNavigation) return;

  const stateData = {
    viewType: viewType,
    currentProjectId: state.currentProjectId || null,
    currentProjectCompanyId: state.currentProjectCompanyId || null,
    currentExchangeId: state.currentExchangeId || null,
    activeExchangeName: state.activeExchangeName || null,
    activeProjectName: state.activeProjectName || null,
    ...params
  };

  let hash = '';
  if (viewType === 'projects') {
    hash = '#projects';
  } else if (viewType === 'exchanges') {
    hash = `#exchanges-${stateData.currentProjectId}`;
  } else if (viewType === 'hide') {
    hash = `#workspace-${stateData.currentExchangeId}`;
  }

  if (window.location.hash !== hash) {
    history.pushState(stateData, '', hash);
  }
}

async function acquireLock(exchangeId) {
  // Clear any existing heartbeat
  if (state.lockHeartbeatInterval) {
    clearInterval(state.lockHeartbeatInterval);
    state.lockHeartbeatInterval = null;
  }

  const user = window.currentUser || (typeof authModule !== 'undefined' ? authModule.getCurrentUser() : null);
  if (!user || !projectsDB._ready) {
    // Offline developer mode or auth not ready: bypass locks
    state.isReadOnly = false;
    toggleWorkspaceEditState(false);
    hideLockBanner();
    return { success: true, option: null };
  }

  try {
    // Force query from Firestore server directly to avoid stale local cache
    const opt = await projectsDB.getExchangeOption(exchangeId, state.currentProjectCompanyId, true);
    if (!opt) return { success: false, option: null };

    const now = new Date();
    const lockedAt = opt.lockedAt ? new Date(opt.lockedAt) : null;
    const isLockActive = opt.lockedBy && lockedAt && (now - lockedAt < 60000); // 60s lease

    if (isLockActive && opt.lockedBy !== user.uid) {
      // Locked by someone else
      state.isReadOnly = true;
      toggleWorkspaceEditState(true);
      showLockBanner(opt.lockedByName || opt.lockedBy || 'another user');
      return { success: false, option: opt };
    }

    // Lock is not active, or owned by us: claim it!
    opt.lockedBy = user.uid;
    opt.lockedByName = user.displayName || user.email || 'Demo User';
    opt.lockedAt = new Date().toISOString();

    await projectsDB.updateExchangeOption(opt, state.currentProjectCompanyId);

    state.isReadOnly = false;
    toggleWorkspaceEditState(false);
    hideLockBanner();

    // Start heartbeat
    state.lockHeartbeatInterval = setInterval(async () => {
      if (state.currentExchangeId !== exchangeId || state.isReadOnly) {
        clearInterval(state.lockHeartbeatInterval);
        state.lockHeartbeatInterval = null;
        return;
      }
      try {
        // Direct write instead of server get first
        const freshOpt = {
          id: exchangeId,
          lockedAt: new Date().toISOString()
        };
        await projectsDB.updateExchangeOption(freshOpt, state.currentProjectCompanyId);
      } catch (err) {
        console.error("Lock heartbeat failed:", err);
      }
    }, 20000); // 20s heartbeat

    return { success: true, option: opt };
  } catch (err) {
    console.error("Failed to acquire lock:", err);
    // Fallback to read-write mode on Firestore errors (ensures offline/local works)
    state.isReadOnly = false;
    toggleWorkspaceEditState(false);
    hideLockBanner();
    return { success: true, option: null };
  }
}

function subscribeToExchangeLock(exchangeId) {
  if (activeExchangeListener) {
    activeExchangeListener();
    activeExchangeListener = null;
  }
  if (readOnlyCheckInterval) {
    clearInterval(readOnlyCheckInterval);
    readOnlyCheckInterval = null;
  }

  const user = window.currentUser || (typeof authModule !== 'undefined' ? authModule.getCurrentUser() : null);
  if (!user || !projectsDB._ready) return;

  try {
    const docRef = projectsDB._col('exchange_options', state.currentProjectCompanyId).doc(String(exchangeId));
    
    let lastKnownLockedAt = null;
    let lastKnownLockedBy = null;
    let lastKnownLockedByName = null;

    activeExchangeListener = docRef.onSnapshot(async (doc) => {
      if (!doc.exists) return;
      const data = doc.data();

      // Ensure we haven't navigated away
      if (state.currentExchangeId !== exchangeId) {
        if (activeExchangeListener) {
          activeExchangeListener();
          activeExchangeListener = null;
        }
        if (readOnlyCheckInterval) {
          clearInterval(readOnlyCheckInterval);
          readOnlyCheckInterval = null;
        }
        return;
      }

      lastKnownLockedAt = data.lockedAt;
      lastKnownLockedBy = data.lockedBy;
      lastKnownLockedByName = data.lockedByName;

      const now = new Date();
      const lockedAtDate = data.lockedAt ? new Date(data.lockedAt) : null;
      const isLockActive = data.lockedBy && lockedAtDate && (now - lockedAtDate < 60000);

      if (isLockActive && data.lockedBy !== user.uid) {
        if (!state.isReadOnly) {
          state.isReadOnly = true;
          toggleWorkspaceEditState(true);
          showLockBanner(data.lockedByName || data.lockedBy || 'another user');
          showToast(`Workspace locked: Another user (${data.lockedByName || 'someone else'}) is now editing.`);
          if (state.lockHeartbeatInterval) {
            clearInterval(state.lockHeartbeatInterval);
            state.lockHeartbeatInterval = null;
          }
        }
      } else {
        if (state.isReadOnly) {
          const { success } = await acquireLock(exchangeId);
          if (success) {
            showToast("Workspace unlocked! You now have edit access.");
          }
        }
      }
    }, (err) => {
      console.warn("[Lock] Listener failed, fallback to local checks:", err.message);
    });

    // Run local check every 5 seconds to handle lease expirations when no DB writes occur
    readOnlyCheckInterval = setInterval(async () => {
      if (state.currentExchangeId !== exchangeId) {
        clearInterval(readOnlyCheckInterval);
        readOnlyCheckInterval = null;
        return;
      }

      if (state.isReadOnly) {
        const now = new Date();
        const lockedAtDate = lastKnownLockedAt ? new Date(lastKnownLockedAt) : null;
        const isLockActive = lastKnownLockedBy && lockedAtDate && (now - lockedAtDate < 60000);

        if (!isLockActive) {
          const { success } = await acquireLock(exchangeId);
          if (success) {
            showToast("Workspace unlocked! You now have edit access.");
          }
        }
      }
    }, 5000);

  } catch (err) {
    console.warn("Failed to subscribe to exchange lock:", err);
  }
}

async function releaseActiveLock() {
  if (state.lockHeartbeatInterval) {
    clearInterval(state.lockHeartbeatInterval);
    state.lockHeartbeatInterval = null;
  }
  if (readOnlyCheckInterval) {
    clearInterval(readOnlyCheckInterval);
    readOnlyCheckInterval = null;
  }
  if (activeExchangeListener) {
    activeExchangeListener();
    activeExchangeListener = null;
  }

  const exchangeId = state.currentExchangeId;
  const isReadOnly = state.isReadOnly;

  if (exchangeId && !isReadOnly) {
    const user = window.currentUser || (typeof authModule !== 'undefined' ? authModule.getCurrentUser() : null);
    if (user && projectsDB._ready) {
      try {
        // Direct write instead of server get first
        const opt = {
          id: exchangeId,
          lockedBy: null,
          lockedByName: null,
          lockedAt: null
        };
        await projectsDB.updateExchangeOption(opt, state.currentProjectCompanyId);
        console.log(`[Lock] Released lock for option: ${exchangeId}`);
      } catch (err) {
        console.error("[Lock] Failed to release lock:", err);
      }
    }
  }

  state.isReadOnly = false;
  hideLockBanner();
}

function showLockBanner(userName) {
  const banner = getEl('exchangeLockedBanner');
  const bannerText = getEl('exchangeLockedBannerText');
  if (banner && bannerText) {
    bannerText.textContent = `Another user (${userName}) is working on this option. Please create a new option.`;
    banner.style.display = 'flex';
  }
}

function hideLockBanner() {
  const banner = getEl('exchangeLockedBanner');
  if (banner) {
    banner.style.display = 'none';
  }
}

function toggleWorkspaceEditState(isReadOnly) {
  // 1. Sync & Save button
  const btnSyncModel = getEl('btnSyncModel');
  if (btnSyncModel) {
    btnSyncModel.style.display = (state.currentExchangeId && !isReadOnly) ? 'inline-flex' : 'none';
  }

  // 2. Disable btnUpdateExchangeJson (+ Update .wex file button)
  const btnUpdateExchangeJson = getEl('btnUpdateExchangeJson');
  if (btnUpdateExchangeJson) {
    btnUpdateExchangeJson.disabled = isReadOnly;
    if (isReadOnly) {
      btnUpdateExchangeJson.style.opacity = '0.5';
      btnUpdateExchangeJson.style.pointerEvents = 'none';
    } else {
      btnUpdateExchangeJson.style.opacity = '1';
      btnUpdateExchangeJson.style.pointerEvents = 'auto';
    }
  }

  // 3. Disable btnUploadFamily (Load Revit Family button)
  const btnUploadFamily = getEl('btnUploadFamily');
  if (btnUploadFamily) {
    btnUploadFamily.disabled = isReadOnly;
    if (isReadOnly) {
      btnUploadFamily.style.opacity = '0.5';
      btnUploadFamily.style.pointerEvents = 'none';
    } else {
      btnUploadFamily.style.opacity = '1';
      btnUploadFamily.style.pointerEvents = 'auto';
    }
  }

  // 4. Disable right panel (Configuration System panel) inputs, select elements, and buttons
  const panelRight = getEl('panel-right');
  if (panelRight) {
    const controls = panelRight.querySelectorAll('input, select, button');
    controls.forEach(el => {
      el.disabled = isReadOnly;
      if (isReadOnly) {
        el.style.opacity = '0.5';
        el.style.pointerEvents = 'none';
      } else {
        el.style.opacity = '1';
        el.style.pointerEvents = 'auto';
      }
    });
  }

  // Properties / Overrides are dynamic and are updated in updateSelectedElementInfo()
}



// Load custom Revit profiles from localStorage on startup
try {
  const cached = localStorage.getItem('lgsf_custom_revit_profiles');
  if (cached) {
    state.customRevitProfiles = JSON.parse(cached);
    if (Array.isArray(state.customRevitProfiles)) {
      state.customRevitProfiles.forEach(p => {
        if (p.vertices) {
          p.vertices = parseProfileVertices(p.vertices);
        }
        if (!p.shape_profile) {
          p.shape_profile = getProfileShapeDefault(p);
        }
      });
    }
  }
} catch (e) {
  console.error("Failed to load cached Revit profiles", e);
}

const canvas = getEl('framingCanvas'), ctx = canvas.getContext('2d');
const planCanvas = getEl('planCanvas'), planCtx = planCanvas ? planCanvas.getContext('2d') : null;

function getActiveVisibilitySettings() {
  if (!state.viewVisibilitySettings) {
    state.viewVisibilitySettings = {
      '2D': JSON.parse(JSON.stringify(state.visibilitySettings)),
      'Plan': JSON.parse(JSON.stringify(state.visibilitySettings)),
      '3D': JSON.parse(JSON.stringify(state.visibilitySettings))
    };
  }
  const currentView = state.currentView || '2D';
  const viewSettings = safeGet(state.viewVisibilitySettings, currentView) || state.visibilitySettings;
  if (viewSettings.showPanelNames === undefined) {
    viewSettings.showPanelNames = true;
  }
  if (viewSettings.showJoinMarkers === undefined) {
    viewSettings.showJoinMarkers = true;
  }
  return viewSettings;
}

function saveVisibilitySettings() {
  if (state.viewVisibilitySettings) {
    localStorage.setItem('lgsf_view_visibility_graphics', JSON.stringify(state.viewVisibilitySettings));
  }
  localStorage.setItem('lgsf_visibility_graphics', JSON.stringify(getActiveVisibilitySettings()));
}

function loadVisibilitySettings() {
  const savedViewSpecific = localStorage.getItem('lgsf_view_visibility_graphics');
  if (savedViewSpecific) {
    try {
      state.viewVisibilitySettings = JSON.parse(savedViewSpecific);
      return;
    } catch (e) { }
  }

  const saved = localStorage.getItem('lgsf_visibility_graphics');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      const merged = Object.assign({}, state.visibilitySettings, parsed);
      state.viewVisibilitySettings = {
        '2D': JSON.parse(JSON.stringify(merged)),
        'Plan': JSON.parse(JSON.stringify(merged)),
        '3D': JSON.parse(JSON.stringify(merged))
      };
    } catch (e) {
      console.error("Failed to load visibility settings", e);
    }
  }
}

function saveVisibilityProfiles() {
  if (state.visibilityProfiles) {
    localStorage.setItem('lgsf_visibility_profiles', JSON.stringify(state.visibilityProfiles));
  }
}

function loadVisibilityProfiles() {
  const saved = localStorage.getItem('lgsf_visibility_profiles');
  if (saved) {
    try {
      state.visibilityProfiles = JSON.parse(saved);
      return;
    } catch (e) { }
  }

  // Set up default profiles
  state.visibilityProfiles = {
    'Default': {
      showWallVolume: true,
      showFramingGlobal: true,
      showPanelNames: true,
      showGrids: true,
      showJoinMarkers: true,
      bottom_track: true,
      top_track: true,
      stud: true,
      end_stud: true,
      king_stud: true,
      trimmer_stud: true,
      cripple_stud: true,
      header: true,
      sill: true,
      nogging: true
    },
    'Framing Only': {
      showWallVolume: false,
      showFramingGlobal: true,
      showPanelNames: true,
      showGrids: true,
      showJoinMarkers: true,
      bottom_track: true,
      top_track: true,
      stud: true,
      end_stud: true,
      king_stud: true,
      trimmer_stud: true,
      cripple_stud: true,
      header: true,
      sill: true,
      nogging: true
    },
    'Wall Volume Only': {
      showWallVolume: true,
      showFramingGlobal: false,
      showPanelNames: true,
      showGrids: true,
      showJoinMarkers: false,
      bottom_track: false,
      top_track: false,
      stud: false,
      end_stud: false,
      king_stud: false,
      trimmer_stud: false,
      cripple_stud: false,
      header: false,
      sill: false,
      nogging: false
    }
  };
  saveVisibilityProfiles();
}

function showVisibilityGraphicsModal() {
  if (document.getElementById('vgModalOverlay')) {
    return;
  }

  const activeSettings = getActiveVisibilitySettings();
  const tempSettings = Object.assign({}, activeSettings);

  let activeProfileName = 'Default';
  for (const [name, profData] of Object.entries(state.visibilityProfiles)) {
    let match = true;
    for (const key of Object.keys(state.visibilitySettings)) {
      if (safeGet(profData, key) !== safeGet(tempSettings, key)) {
        match = false;
        break;
      }
    }
    if (match) {
      activeProfileName = name;
      break;
    }
  }

  const overlay = document.createElement('div');
  overlay.id = 'vgModalOverlay';
  overlay.className = 'vg-modal-overlay';

  overlay.innerHTML = `
    <div class="vg-modal-container">
      <div class="vg-modal-header">
        <h2>Visibility/Graphic Overrides for ` + escapeHtml(state.currentView || '2D') + ` View</h2>
        <button id="btnVgClose" class="vg-close-btn">&times;</button>
      </div>
      <div class="vg-modal-profiles-bar">
        <span class="vg-bar-label">Profile:</span>
        <select id="vgProfileSelect" class="styled-select" style="width: auto; min-width: 150px; padding: 4px 28px 4px 10px; font-size: 12px; margin-right: 8px;">
        </select>
        <button id="btnVgSaveProfile" class="btn" style="padding: 4px 10px; font-size: 11px;">Update Profile</button>
        <button id="btnVgSaveAsProfile" class="btn btn-accent" style="padding: 4px 10px; font-size: 11px;">Save As...</button>
        <button id="btnVgDeleteProfile" class="btn" style="padding: 4px 10px; font-size: 11px; color: #f56565; background: transparent; border: 1px solid var(--border-color);">Delete</button>
      </div>
      <div class="vg-modal-body">
        <div class="vg-table-container">
          <table class="vg-table">
            <thead>
              <tr>
                <th style="width: 80px; text-align: center;">Visibility</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_showWallVolume" style="cursor: pointer;"></td>
                <td style="font-weight: 600;">Wall Volume</td>
              </tr>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_showPanelNames" style="cursor: pointer;"></td>
                <td style="font-weight: 600;">Panel Names</td>
              </tr>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_showGrids" style="cursor: pointer;"></td>
                <td style="font-weight: 600;">Grids</td>
              </tr>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_showJoinMarkers" style="cursor: pointer;"></td>
                <td style="font-weight: 600;">Join Markers</td>
              </tr>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_showFramingGlobal" style="cursor: pointer;"></td>
                <td style="font-weight: 600;">Framing Global</td>
              </tr>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_bottom_track" style="cursor: pointer;"></td>
                <td class="vg-row-sub">Bottom Track</td>
              </tr>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_top_track" style="cursor: pointer;"></td>
                <td class="vg-row-sub">Top Track</td>
              </tr>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_stud" style="cursor: pointer;"></td>
                <td class="vg-row-sub">Stud</td>
              </tr>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_end_stud" style="cursor: pointer;"></td>
                <td class="vg-row-sub">End Stud</td>
              </tr>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_king_stud" style="cursor: pointer;"></td>
                <td class="vg-row-sub">King Stud</td>
              </tr>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_trimmer_stud" style="cursor: pointer;"></td>
                <td class="vg-row-sub">Trimmer</td>
              </tr>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_cripple_stud" style="cursor: pointer;"></td>
                <td class="vg-row-sub">Cripple</td>
              </tr>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_header" style="cursor: pointer;"></td>
                <td class="vg-row-sub">Header</td>
              </tr>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_sill" style="cursor: pointer;"></td>
                <td class="vg-row-sub">Sill</td>
              </tr>
              <tr>
                <td style="text-align: center;"><input type="checkbox" id="vg_nogging" style="cursor: pointer;"></td>
                <td class="vg-row-sub">Nogging</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="vg-modal-footer">
        <button id="btnVgCancel" class="btn" style="background: transparent; border: 1px solid var(--border-color);">Cancel</button>
        <button id="btnVgApply" class="btn btn-accent">Apply</button>
        <button id="btnVgOk" class="btn btn-primary">OK</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const profileSelect = overlay.querySelector('#vgProfileSelect');

  function updateProfilesSelect(selectedName) {
    profileSelect.innerHTML = '';

    let isSavedProfile = false;
    for (const name of Object.keys(state.visibilityProfiles)) {
      const option = document.createElement('option');
      option.value = name;
      option.textContent = name;
      profileSelect.appendChild(option);
      if (name === selectedName) {
        isSavedProfile = true;
      }
    }

    if (!isSavedProfile) {
      const option = document.createElement('option');
      option.value = 'Custom';
      option.textContent = '<Custom Settings>';
      profileSelect.appendChild(option);
      profileSelect.value = 'Custom';
    } else {
      profileSelect.value = selectedName;
    }
  }

  updateProfilesSelect(activeProfileName);

  const keys = Object.keys(state.visibilitySettings);
  function syncCheckboxesToTemp() {
    keys.forEach(key => {
      const cb = overlay.querySelector('#vg_' + key);
      if (cb) {
        cb.checked = !!safeGet(tempSettings, key);
      }
    });
  }
  syncCheckboxesToTemp();

  keys.forEach(key => {
    const cb = overlay.querySelector('#vg_' + key);
    if (cb) {
      cb.addEventListener('change', () => {
        safeSet(tempSettings, key, cb.checked);
        let matchedProfile = null;
        for (const [name, profData] of Object.entries(state.visibilityProfiles)) {
          let match = true;
          for (const k of keys) {
            if (safeGet(profData, k) !== safeGet(tempSettings, k)) {
              match = false;
              break;
            }
          }
          if (match) {
            matchedProfile = name;
            break;
          }
        }
        updateProfilesSelect(matchedProfile || 'Custom');
      });
    }
  });

  profileSelect.addEventListener('change', () => {
    const val = profileSelect.value;
    if (val === 'Custom') return;
    const profileData = safeGet(state.visibilityProfiles, val);
    if (profileData) {
      Object.assign(tempSettings, profileData);
      syncCheckboxesToTemp();
    }
  });

  const close = () => {
    overlay.remove();
  };

  overlay.querySelector('#btnVgClose').addEventListener('click', close);
  overlay.querySelector('#btnVgCancel').addEventListener('click', close);

  const applyChanges = () => {
    const currentView = state.currentView || '2D';
    if (!state.viewVisibilitySettings) {
      state.viewVisibilitySettings = {
        '2D': JSON.parse(JSON.stringify(state.visibilitySettings)),
        'Plan': JSON.parse(JSON.stringify(state.visibilitySettings)),
        '3D': JSON.parse(JSON.stringify(state.visibilitySettings))
      };
    }
    safeSet(state.viewVisibilitySettings, currentView, Object.assign({}, tempSettings));

    saveVisibilitySettings();

    if (currentView === '2D') {
      render();
    } else if (currentView === 'Plan') {
      renderPlan();
    } else if (currentView === '3D') {
      if (is3DInitialized) {
        render3DScene();
      }
    }
  };

  overlay.querySelector('#btnVgApply').addEventListener('click', applyChanges);

  overlay.querySelector('#btnVgOk').addEventListener('click', () => {
    applyChanges();
    close();
  });

  overlay.querySelector('#btnVgSaveProfile').addEventListener('click', () => {
    const activeProf = profileSelect.value;
    if (activeProf === 'Custom') {
      showToast("Please use 'Save As...' to save these settings as a new profile.");
      return;
    }

    safeSet(state.visibilityProfiles, activeProf, Object.assign({}, tempSettings));
    saveVisibilityProfiles();
    showToast(`Profile '${activeProf}' updated successfully.`);
  });

  overlay.querySelector('#btnVgSaveAsProfile').addEventListener('click', async () => {
    const name = await showPrompt("Enter a name for the new profile:");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === 'Custom') {
      showToast("Invalid profile name.");
      return;
    }

    safeSet(state.visibilityProfiles, trimmed, Object.assign({}, tempSettings));
    saveVisibilityProfiles();

    updateProfilesSelect(trimmed);
  });

  overlay.querySelector('#btnVgDeleteProfile').addEventListener('click', async () => {
    const activeProf = profileSelect.value;
    if (activeProf === 'Custom') {
      showToast("Cannot delete a non-saved temporary setting.");
      return;
    }
    if (activeProf === 'Default') {
      showToast("Cannot delete the Default profile.");
      return;
    }

    if (!await showConfirm(`Are you sure you want to delete profile '${activeProf}'?`)) {
      return;
    }

    Reflect.deleteProperty(state.visibilityProfiles, activeProf);
    saveVisibilityProfiles();

    Object.assign(tempSettings, state.visibilityProfiles['Default']);
    syncCheckboxesToTemp();
    updateProfilesSelect('Default');
  });
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function getPanelBadgeStyle(isSelected, isHovered) {
  const isDark = (state.theme === 'dark');
  if (isSelected) {
    return {
      bg: '#3182ce',
      border: '#ffffff',
      text: '#ffffff'
    };
  } else if (isHovered) {
    return {
      bg: '#2b6cb0',
      border: '#ffffff',
      text: '#ffffff'
    };
  } else {
    return {
      bg: isDark ? '#000000' : '#ffffff',
      border: isDark ? '#ffffff' : '#000000',
      text: isDark ? '#ffffff' : '#000000'
    };
  }
}

// ─── Unit Helpers ─────────────────────────────────────────────────
function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }
function mmToDisplay(mm) {
  mm = parseFloat(mm) || 0;
  if (mm < 0) return '-' + mmToDisplay(-mm);
  if (state.displayUnit === 'mm') return parseFloat(mm.toFixed(2)).toString();
  const ti = mm / 25.4, ft = Math.floor(ti / 12), ins = ti % 12, w = Math.floor(ins), fr = ins - w;
  let fs = '';
  if (fr > 0.01) {
    const n16 = Math.round(fr * 16); if (n16 === 16) return ft ? `${ft}'-${w + 1}"` : `${w + 1}"`;
    const g = gcd(n16, 16); fs = ` ${n16 / g}/${16 / g}`;
  }
  return ft ? `${ft}'-${w}${fs}"` : `${w}${fs}"`;
}
function displayToMm(str) {
  if (!str) return 0;
  str = String(str).trim().toLowerCase();
  let sign = 1;
  if (str.startsWith('-')) {
    sign = -1;
    str = str.substring(1).trim();
  }
  if (state.displayUnit === 'mm') {
    const val = parseFloat(str);
    return isNaN(val) ? NaN : val * sign;
  }
  if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str) * 25.4 * sign;
  let ti = 0, parsed = false;
  const ftMatch = str.match(/([\d.]+)\s*(?:'|ft)/);
  if (ftMatch) {
    ti += parseFloat(ftMatch[1]) * 12;
    str = str.replace(ftMatch[0], '').trim();
    if (str.startsWith('-')) str = str.substring(1).trim();
    parsed = true;
  }
  const fracMatch = str.match(/(?:(\d+)\s*-?\s*)?(\d+)\/(\d+)\s*(?:"|in|'')?/);
  if (fracMatch) {
    if (fracMatch[1]) ti += parseInt(fracMatch[1], 10);
    ti += parseInt(fracMatch[2], 10) / parseInt(fracMatch[3], 10);
    parsed = true;
  } else {
    const inMatch = str.match(/([\d.]+)\s*(?:"|in|'')?/);
    if (inMatch) {
      ti += parseFloat(inMatch[1]);
      parsed = true;
    }
  }
  if (!parsed) {
    const p = parseFloat(str);
    if (!isNaN(p)) return p * 25.4 * sign;
    return NaN;
  }
  return ti * 25.4 * sign;
}

/** Read an input's mm value — always converts the displayed text back to mm */
function readInputMm(id) {
  const el = getEl(id); const txt = el.value.trim();
  if (!txt) return parseFloat(el.dataset.mm) || 0;
  const v = displayToMm(txt);
  return isNaN(v) ? parseFloat(el.dataset.mm) || 0 : v;
}

function setFieldMm(id, val) {
  const el = getEl(id); if (!el) return;
  el.dataset.mm = val;
  el.value = mmToDisplay(val);
}

// \u2500\u2500\u2500 API \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
const api = {
  _formatErr: err => {
    if (!err || !err.detail) return null;
    if (typeof err.detail === 'string') return err.detail;
    if (Array.isArray(err.detail)) {
      return err.detail.map(d => {
        const loc = d.loc ? d.loc.join('.') : '';
        return `${loc}: ${d.msg}`;
      }).join('\n');
    }
    return JSON.stringify(err.detail);
  },

  _handleAuthError: async function(r) {
    if (r.status === 401) {
      const user = window.currentUser || (typeof authModule !== 'undefined' ? authModule.getCurrentUser() : null);
      if (user) {
        if (typeof window.showAlert === 'function') {
          await window.showAlert("Your login session has expired due to inactivity. Click OK to refresh your session.", "Session Expired");
        } else {
          alert("Your login session has expired due to inactivity. Click OK to refresh your session.");
        }
        window.location.reload();
        throw new Error("Session expired. Reloading...");
      }
      throw new Error("Unauthorized (401)");
    }
  },

  // Fetch a fresh Firebase ID token (cached for 55 min to avoid re-fetching)
  _tokenCache: { token: null, expiresAt: 0 },
  async _getAuthHeader() {
    try {
      const now = Date.now();
      // Firebase ID tokens are valid for 1 hour; refresh 5 min before expiry
      if (this._tokenCache.token && now < this._tokenCache.expiresAt) {
        return { 'Authorization': `Bearer ${this._tokenCache.token}` };
      }

      // Wait for Firebase auth to resolve if it hasn't yet (startup race condition)
      // Polls up to 10 times × 300ms = 3 seconds max
      let firebaseUser = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        firebaseUser = (typeof authModule !== 'undefined')
          ? authModule.getCurrentUser()
          : (window.currentUser || null);
        if (firebaseUser) break;
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      if (!firebaseUser) return {};
      const token = await firebaseUser.getIdToken(/* forceRefresh */ false);
      this._tokenCache.token = token;
      this._tokenCache.expiresAt = now + 55 * 60 * 1000; // 55 min
      return { 'Authorization': `Bearer ${token}` };
    } catch (e) {
      console.warn('[api] Could not get Firebase token:', e.message);
      return {};
    }
  },

  get: async function(u) {
    const authHeader = await this._getAuthHeader();
    const r = await fetch(u, { headers: authHeader });
    if (!r.ok) {
      await this._handleAuthError(r);
      const err = await r.json().catch(() => ({}));
      throw new Error(this._formatErr(err) || `HTTP ${r.status}`);
    }
    return r.json();
  },

  post: async function(u, b) {
    const authHeader = await this._getAuthHeader();
    const r = await fetch(u, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify(b)
    });
    if (!r.ok) {
      await this._handleAuthError(r);
      const err = await r.json().catch(() => ({}));
      throw new Error(this._formatErr(err) || `HTTP ${r.status}`);
    }
    return r.json();
  },

  delete: async function(u) {
    const authHeader = await this._getAuthHeader();
    const r = await fetch(u, { method: 'DELETE', headers: authHeader });
    if (!r.ok) {
      await this._handleAuthError(r);
      const err = await r.json().catch(() => ({}));
      throw new Error(this._formatErr(err) || `HTTP ${r.status}`);
    }
    return r.json();
  },
};


// ─── Navigation Rail & Project Browser Helpers ───────────────────────────────
let closeTimeout = null;

function getWallLevel(w) {
  if (!w) return 'Level 1';
  const rp = w.revit_parameters || w.RevitParameters || {};
  return rp['Base Level'] || rp['Level'] || rp['base_level'] || 'Level 1';
}

function updateSidebarLayout() {
  const pLeft = getEl('panel-left');
  const pBrowser = getEl('panel-project-browser');
  const pSettings = getEl('panel-settings');
  const resizer = getEl('resizer-left');

  if (!pLeft || !pBrowser || !pSettings) return;

  // Automatically hide profile popover on layout update
  const profilePopover = getEl('profilePopover');
  if (profilePopover) {
    profilePopover.classList.remove('visible');
  }

  // Clear any existing class modifiers
  pLeft.className = 'sidebar-panel hidden';
  pBrowser.className = 'sidebar-panel hidden';
  pSettings.className = 'sidebar-panel hidden';

  // Determine active panel visibility
  if (state.activePanel === 'properties') {
    pLeft.classList.remove('hidden');
    if (state.pinnedPanel === 'properties') {
      pLeft.classList.add('pinned');
    } else {
      pLeft.classList.add('floating');
    }
  } else if (state.activePanel === 'browser') {
    pBrowser.classList.remove('hidden');
    if (state.pinnedPanel === 'browser') {
      pBrowser.classList.add('pinned');
    } else {
      pBrowser.classList.add('floating');
    }
  } else if (state.activePanel === 'settings') {
    pSettings.classList.remove('hidden');
    if (state.pinnedPanel === 'settings') {
      pSettings.classList.add('pinned');
    } else {
      pSettings.classList.add('floating');
    }
  }

  // Pin indicators on the panels
  const pinPropBtn = getEl('btnPinProperties');
  if (pinPropBtn) {
    if (state.pinnedPanel === 'properties' && state.activePanel === 'properties') {
      pinPropBtn.classList.add('active');
    } else {
      pinPropBtn.classList.remove('active');
    }
  }

  const pinBrowserBtn = getEl('btnPinBrowser');
  if (pinBrowserBtn) {
    if (state.pinnedPanel === 'browser' && state.activePanel === 'browser') {
      pinBrowserBtn.classList.add('active');
    } else {
      pinBrowserBtn.classList.remove('active');
    }
  }

  const pinSettingsBtn = getEl('btnPinSettings');
  if (pinSettingsBtn) {
    if (state.pinnedPanel === 'settings' && state.activePanel === 'settings') {
      pinSettingsBtn.classList.add('active');
    } else {
      pinSettingsBtn.classList.remove('active');
    }
  }

  // Active state on Navigation Rail items
  const railProp = getEl('railBtnProperties');
  const railBrowser = getEl('railBtnBrowser');
  const railSettings = getEl('railBtnSettings');
  const railHome = getEl('railBtnHome');

  if (railProp) {
    if (state.activePanel === 'properties') railProp.classList.add('active');
    else railProp.classList.remove('active');
  }
  if (railBrowser) {
    if (state.activePanel === 'browser') railBrowser.classList.add('active');
    else railBrowser.classList.remove('active');
  }
  if (railSettings) {
    if (state.activePanel === 'settings') railSettings.classList.add('active');
    else railSettings.classList.remove('active');
  }
  if (railHome) {
    if (state.currentProjectId === null) railHome.classList.add('active');
    else railHome.classList.remove('active');
  }

  // Show/Hide resizer bar based on pinned state
  if (resizer) {
    if (state.pinnedPanel && state.pinnedPanel === state.activePanel) {
      resizer.style.display = 'block';
    } else {
      resizer.style.display = 'none';
    }
  }

  // Cancel any floating close timeout when switching or updating layout
  cancelCloseTimeout();

  // Force Three.js and canvases to resize
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'));
  }, 50);
}

function cancelCloseTimeout() {
  if (closeTimeout) {
    clearTimeout(closeTimeout);
    closeTimeout = null;
  }
}

function startCloseTimeout() {
  cancelCloseTimeout();
  // Only start timeout if there is an active floating panel
  if (state.activePanel && state.pinnedPanel !== state.activePanel) {
    closeTimeout = setTimeout(() => {
      state.activePanel = null;
      updateSidebarLayout();
    }, 10000);
  }
}



function showToast(message, type = null) {
  let toast = getEl('genericToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'genericToast';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }

  if (!type) {
    const msgLower = message.toLowerCase();
    if (msgLower.includes('success') || msgLower.includes('switched') || msgLower.includes('loaded') || msgLower.includes('saved') || msgLower.includes('created') || msgLower.includes('completed')) {
      type = 'success';
    } else if (msgLower.includes('failed') || msgLower.includes('error') || msgLower.includes('invalid') || msgLower.includes('cannot') || msgLower.includes('no active') || msgLower.includes('please')) {
      type = 'error';
    } else if (msgLower.includes('warning') || msgLower.includes('delete') || msgLower.includes('remove') || msgLower.includes('mismatch')) {
      type = 'warning';
    } else {
      type = 'info';
    }
  }

  toast.className = `toast-notification ${type} show`;
  toast.innerText = message;

  if (toast.dataset.timeoutId) {
    clearTimeout(parseInt(toast.dataset.timeoutId, 10));
  }

  const timeoutId = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
  toast.dataset.timeoutId = timeoutId;
}

function createCustomDialog({ type, title, message, hasInput, inputValue, confirmText, cancelText, customHtml }) {
  return new Promise((resolve) => {
    const existing = document.getElementById('customDialogOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'customDialogOverlay';
    overlay.className = 'custom-dialog-overlay';

    let cardTypeClass = '';
    let icon = 'ℹ️';
    if (!type) {
      const msgLower = (message || '').toLowerCase();
      if (msgLower.includes('warning') || msgLower.includes('delete') || msgLower.includes('remove') || msgLower.includes('mismatch')) {
        type = 'warning';
      } else if (msgLower.includes('failed') || msgLower.includes('error') || msgLower.includes('invalid') || msgLower.includes('cannot')) {
        type = 'error';
      } else {
        type = 'info';
      }
    }

    if (type === 'warning') {
      cardTypeClass = 'dialog-warning';
      icon = '⚠️';
    } else if (type === 'error') {
      cardTypeClass = 'dialog-error';
      icon = '❌';
    }

    const card = document.createElement('div');
    card.className = `custom-dialog-card ${cardTypeClass}`;

    const header = document.createElement('div');
    header.className = 'custom-dialog-header';

    const titleEl = document.createElement('span');
    titleEl.className = 'custom-dialog-title';
    titleEl.textContent = title || (type === 'warning' ? 'Warning' : type === 'error' ? 'Error' : 'Notification');

    const iconEl = document.createElement('span');
    iconEl.textContent = icon;
    header.appendChild(iconEl);
    header.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-icon-sm';
    closeBtn.style.borderRadius = '50%';
    closeBtn.style.width = '24px';
    closeBtn.style.height = '24px';
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('click', () => {
      cleanup(null);
    });
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'custom-dialog-body';

    if (customHtml) {
      const customWrapper = document.createElement('div');
      customWrapper.className = 'custom-dialog-custom-html';
      if (typeof customHtml === 'string') {
        customWrapper.innerHTML = customHtml;
      } else {
        customWrapper.appendChild(customHtml);
      }
      body.appendChild(customWrapper);
    } else {
      const msgEl = document.createElement('div');
      msgEl.className = 'custom-dialog-message';
      msgEl.textContent = message || '';
      body.appendChild(msgEl);
    }

    let inputEl = null;
    if (hasInput) {
      const inputWrapper = document.createElement('div');
      inputWrapper.className = 'custom-dialog-input-wrapper';
      inputEl = document.createElement('input');
      inputEl.type = 'text';
      inputEl.className = 'custom-dialog-input';
      inputEl.value = inputValue || '';
      inputWrapper.appendChild(inputEl);
      body.appendChild(inputWrapper);

      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          cleanup(inputEl.value);
        } else if (e.key === 'Escape') {
          cleanup(null);
        }
      });
    }

    const footer = document.createElement('div');
    footer.className = 'custom-dialog-footer';

    const btnConfirm = document.createElement('button');
    btnConfirm.className = 'custom-dialog-btn custom-dialog-btn-primary';
    btnConfirm.textContent = confirmText || 'OK';
    btnConfirm.addEventListener('click', () => {
      let val = true;
      if (hasInput) {
        val = inputEl.value;
      } else if (customHtml) {
        const inputs = body.querySelectorAll('input');
        if (inputs.length > 0) {
          val = {};
          inputs.forEach(inp => {
            if (inp.id) {
              if (inp.type === 'checkbox') {
                safeSet(val, inp.id, inp.checked);
              } else {
                safeSet(val, inp.id, inp.value);
              }
            }
          });
        }
      }
      cleanup(val);
    });

    let btnCancel = null;
    if (cancelText) {
      btnCancel = document.createElement('button');
      btnCancel.className = 'custom-dialog-btn custom-dialog-btn-secondary';
      btnCancel.textContent = cancelText;
      btnCancel.addEventListener('click', () => {
        cleanup(hasInput ? null : false);
      });
      footer.appendChild(btnCancel);
    }

    footer.appendChild(btnConfirm);

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(footer);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    setTimeout(() => {
      overlay.classList.add('show');
      if (hasInput && inputEl) {
        inputEl.focus();
        inputEl.select();
      }
    }, 20);

    function cleanup(value) {
      overlay.classList.remove('show');
      setTimeout(() => {
        overlay.remove();
        resolve(value);
      }, 200);
    }
  });
}

window.showAlert = function (message, title = 'Notification') {
  return createCustomDialog({
    type: 'info',
    title,
    message,
    confirmText: 'OK'
  });
};

window.showConfirm = function (message, title = 'Confirmation Required') {
  return createCustomDialog({
    title,
    message,
    confirmText: 'Yes',
    cancelText: 'No'
  });
};

window.showPrompt = function (message, defaultValue = '', title = 'Input Required') {
  return createCustomDialog({
    title,
    message,
    hasInput: true,
    inputValue: defaultValue,
    confirmText: 'OK',
    cancelText: 'Cancel'
  });
};


function renderProjectBrowser() {
  const container = getEl('projectBrowserTree');
  if (!container) return;

  if (!state.wallsData || state.wallsData.length === 0) {
    container.innerHTML = '<p class="muted" style="padding:12px 16px;">No walls loaded.</p>';
    return;
  }

  // Group walls by level
  const levels = {};
  state.wallsData.forEach((w, idx) => {
    const levelName = getWallLevel(w);
    if (!safeGet(levels, levelName)) {
      safeSet(levels, levelName, []);
    }
    safeGet(levels, levelName).push({ wall: w, index: idx });
  });

  // Sort levels
  const sortedLevelNames = Object.keys(levels).sort((a, b) => {
    const numA = parseInt(a.replace(/^\D+/g, '')) || 0;
    const numB = parseInt(b.replace(/^\D+/g, '')) || 0;
    return numA - numB || a.localeCompare(b);
  });

  let html = `<ul style="padding-left: 0; margin: 0; list-style: none;">`;

  // Root node: Walls
  html += `
    <li class="tree-node branch expanded" data-node-id="root-walls">
      <div class="tree-node-content" onclick="toggleTreeNode(event)">
        <span class="chevron-icon-wrapper">
          <svg class="tree-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(0deg);"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </span>
        <span class="node-icon">🏢</span>
        <span class="node-text">Walls</span>
        <span class="badge" style="margin-left:auto; font-size:9px; padding: 1px 5px;">` + state.wallsData.length + `</span>
      </div>
      <ul class="tree-subtree">
  `;

  // Level nodes
  sortedLevelNames.forEach(lvl => {
    const wallsInLevel = safeGet(levels, lvl);
    html += `
      <li class="tree-node branch expanded" data-node-id="level-` + lvl + `">
        <div class="tree-node-content" onclick="toggleTreeNode(event)">
          <span class="chevron-icon-wrapper">
            <svg class="tree-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transform: rotate(0deg);"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </span>
          <span class="node-icon">🥞</span>
          <span class="node-text">` + lvl + `</span>
          <span class="badge" style="margin-left:auto; font-size:9px; padding: 1px 5px;">` + wallsInLevel.length + `</span>
        </div>
        <ul class="tree-subtree">
    `;

    // Wall leaf nodes
    wallsInLevel.forEach(item => {
      const w = item.wall;
      const idx = item.index;
      const isSelected = idx === state.currentWallIdx;
      const wallLabel = w.label || w.wall_id || `Wall ${idx + 1}`;

      html += `
        <li class="tree-node leaf ` + (isSelected ? 'selected' : '') + `" data-wall-idx="` + idx + `">
          <div class="tree-node-content" onclick="selectBrowserWall(event, ` + idx + `)">
            <span class="node-icon">🧱</span>
            <span class="node-text">` + escapeHtml(wallLabel) + `</span>
          </div>
        </li>
      `;
    });

    html += `</ul></li>`;
  });

  html += `</ul></li></ul>`;
  container.innerHTML = html;
}

function toggleTreeNode(event) {
  event.stopPropagation();
  const li = event.currentTarget.closest('.tree-node.branch');
  if (!li) return;

  const chevron = li.querySelector('.tree-chevron');
  if (li.classList.contains('expanded')) {
    li.classList.remove('expanded');
    if (chevron) chevron.style.transform = 'rotate(-90deg)';
  } else {
    li.classList.add('expanded');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  }
}

async function selectBrowserWall(event, idx) {
  if (event) event.stopPropagation();

  state.selectedMember = null;
  state.selectedMembers = [];
  state.selectedOpening = null;

  if (event && event.shiftKey && state.lastClickedBrowserWallIdx !== undefined) {
    const leafNodes = Array.from(document.querySelectorAll('.browser-tree .tree-node.leaf'));
    const index1 = leafNodes.findIndex(node => parseInt(node.dataset.wallIdx) === state.lastClickedBrowserWallIdx);
    const index2 = leafNodes.findIndex(node => parseInt(node.dataset.wallIdx) === idx);
    if (index1 !== -1 && index2 !== -1) {
      const start = Math.min(index1, index2);
      const end = Math.max(index1, index2);
      state.selectedWallIndices = [];
      for (let i = start; i <= end; i++) {
        const wallIdx = parseInt(safeGet(leafNodes, i).dataset.wallIdx);
        state.selectedWallIndices.push(wallIdx);
      }
      state.currentWallIdx = idx;
    }
  } else if (event && (event.ctrlKey || event.metaKey)) {
    if (!state.selectedWallIndices) state.selectedWallIndices = [];
    const index = state.selectedWallIndices.indexOf(idx);
    if (index !== -1) {
      state.selectedWallIndices.splice(index, 1);
      state.currentWallIdx = safeGet(state.selectedWallIndices, state.selectedWallIndices.length - 1) ?? 0;
    } else {
      state.selectedWallIndices.push(idx);
      state.currentWallIdx = idx;
    }
    state.lastClickedBrowserWallIdx = idx;
  } else {
    state.selectedWallIndices = [idx];
    state.currentWallIdx = idx;
    state.lastClickedBrowserWallIdx = idx;
  }

  // Update tree active node visual style
  syncBrowserTreeSelection();

  const sel = getEl('wallSelect');
  if (sel) sel.value = state.currentWallIdx;

  await restoreWallConfig(state.currentWallIdx);
  fitView();
  render();
  if (planCanvas) renderPlan();
  updateMemberSummary();
  updateWallInfo();
  updateSelectedElementInfo();
}

function syncBrowserTreeSelection() {
  document.querySelectorAll('.tree-node.leaf').forEach(node => {
    const idx = parseInt(node.dataset.wallIdx);
    const isSelected = (idx === state.currentWallIdx) || (state.selectedWallIndices && state.selectedWallIndices.includes(idx));
    if (isSelected) {
      node.classList.add('selected');
      // Expand parents if collapsed
      let parent = node.parentElement.closest('.tree-node.branch');
      while (parent) {
        if (!parent.classList.contains('expanded')) {
          parent.classList.add('expanded');
          const pChevron = parent.querySelector('.tree-chevron');
          if (pChevron) pChevron.style.transform = 'rotate(0deg)';
        }
        parent = parent.parentElement.closest('.tree-node.branch');
      }
    } else {
      node.classList.remove('selected');
    }
  });
}

// ─── Floating Selection Actions ───────────────────────────────────
function updateSelectionActionBar() {
  const bar = getEl('selectionActionBar');
  if (!bar) return;

  let count = 0;
  if (state.selectedMembers && state.selectedMembers.length > 0) {
    count += state.selectedMembers.length;
  } else if (state.selectedMember) {
    count += 1;
  }
  if (state.selectedWallIndices && state.selectedWallIndices.length > 0) {
    count += state.selectedWallIndices.length;
  }
  if (state.selectedOpening) {
    count += 1;
  }

  const label = getEl('selectionLabel');
  const btnHide = getEl('btnHideSelected');
  const btnUnhide = getEl('btnUnhideAll');
  const dividers = bar.querySelectorAll('.selection-actions-divider');
  const divider = dividers && dividers.length > 0 ? dividers[0] : null;

  const hasHidden = state.hiddenElements && state.hiddenElements.size > 0;

  if (count > 0) {
    if (label) {
      label.style.display = 'inline-block';
      label.textContent = `${count} element${count > 1 ? 's' : ''} selected`;
    }
    if (btnHide) btnHide.style.display = 'inline-flex';
    if (divider) divider.style.display = 'block';
    
    if (btnUnhide) {
      btnUnhide.style.display = hasHidden ? 'inline-flex' : 'none';
    }
    bar.classList.remove('hidden');
  } else if (hasHidden) {
    if (label) label.style.display = 'none';
    if (btnHide) btnHide.style.display = 'none';
    if (divider) divider.style.display = 'none';
    if (btnUnhide) btnUnhide.style.display = 'inline-flex';
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
  }
}

// ─── Init ─────────────────────────────────────────────────────────
async function init() {
  // ── Concurrency Lock Handlers ──
  window.addEventListener('beforeunload', () => {
    releaseActiveLock();
  });

  // ── Browser History popstate Handler ──
  window.addEventListener('popstate', async (event) => {
    const navState = event.state;
    if (!navState) {
      isPopStateNavigation = true;
      try {
        if (state.currentExchangeId) {
          releaseActiveLock().catch(err => console.error("[Lock] Release active lock failed:", err));
          state.currentExchangeId = null;
        }
        state.currentProjectId = null;
        await showDashboard('projects');
      } catch (err) {
        console.error("Error handling default popstate:", err);
      } finally {
        isPopStateNavigation = false;
      }
      return;
    }

    isPopStateNavigation = true;
    try {
      if (navState.viewType === 'projects') {
        if (state.currentExchangeId) {
          releaseActiveLock().catch(err => console.error("[Lock] Release active lock failed:", err));
          state.currentExchangeId = null;
        }
        state.currentProjectId = null;
        await showDashboard('projects');
      } else if (navState.viewType === 'exchanges') {
        if (state.currentExchangeId) {
          releaseActiveLock().catch(err => console.error("[Lock] Release active lock failed:", err));
          state.currentExchangeId = null;
        }
        state.currentProjectId = navState.currentProjectId;
        state.currentProjectCompanyId = navState.currentProjectCompanyId;
        state.activeProjectName = navState.activeProjectName;
        const breadcrumbProjectName = getEl('breadcrumb-project-name');
        if (breadcrumbProjectName && navState.activeProjectName) {
          breadcrumbProjectName.innerText = navState.activeProjectName;
        }
        await showDashboard('exchanges');
      } else if (navState.viewType === 'hide') {
        state.currentProjectId = navState.currentProjectId;
        state.currentProjectCompanyId = navState.currentProjectCompanyId;
        state.activeExchangeName = navState.activeExchangeName;
        state.activeProjectName = navState.activeProjectName;
        const breadcrumbProjectName = getEl('breadcrumb-project-name');
        if (breadcrumbProjectName && navState.activeProjectName) {
          breadcrumbProjectName.innerText = navState.activeProjectName;
        }
        await loadExchangeOption(navState.currentExchangeId);
      }
    } catch (err) {
      console.error("Error handling popstate navigation:", err);
    } finally {
      isPopStateNavigation = false;
    }
  });

  getEl('btnSignOut')?.addEventListener('click', () => {
    releaseActiveLock();
  });
  getEl('btnSignOutDashboard')?.addEventListener('click', () => {
    releaseActiveLock();
  });

  // Create selection box visual overlay
  const selectionBox = document.createElement('div');
  selectionBox.id = 'selectionBoxOverlay';
  selectionBox.className = 'selection-box-overlay';
  const container = getEl('canvas-container') || document.body;
  container.appendChild(selectionBox);

  // Setup Hide / Unhide click listeners
  getEl('btnHideSelected')?.addEventListener('click', () => {
    if (state.selectedMembers && state.selectedMembers.length > 0) {
      state.selectedMembers.forEach(m => state.hiddenElements.add(m));
    } else if (state.selectedMember) {
      state.hiddenElements.add(state.selectedMember);
    }
    if (state.selectedWallIndices && state.selectedWallIndices.length > 0) {
      state.selectedWallIndices.forEach(idx => {
        const wall = safeGet(state.wallsData, idx);
        if (wall) state.hiddenElements.add(wall);
      });
    }
    if (state.selectedOpening) {
      state.hiddenElements.add(state.selectedOpening);
    }

    // Clear selection
    state.selectedMembers = [];
    state.selectedMember = null;
    state.selectedWallIndices = [];
    state.selectedOpening = null;

    updateMemberSummary();
    updateWallInfo();
    updateSelectedElementInfo();
    render3DScene();
    render();
    if (planCanvas) renderPlan();
  });

  getEl('btnUnhideAll')?.addEventListener('click', () => {
    if (state.hiddenElements) {
      state.hiddenElements.clear();
    }
    updateSelectionActionBar();
    render3DScene();
    render();
    if (planCanvas) renderPlan();
  });

  resizeCanvas();

  // Set default sidebar layout
  updateSidebarLayout();

  // Pin button listeners
  getEl('btnPinProperties').addEventListener('click', (e) => {
    e.stopPropagation();
    cancelCloseTimeout();
    if (state.pinnedPanel === 'properties') {
      state.pinnedPanel = null;
    } else {
      state.pinnedPanel = 'properties';
    }
    updateSidebarLayout();
  });

  getEl('btnPinBrowser').addEventListener('click', (e) => {
    e.stopPropagation();
    cancelCloseTimeout();
    if (state.pinnedPanel === 'browser') {
      state.pinnedPanel = null;
    } else {
      state.pinnedPanel = 'browser';
    }
    updateSidebarLayout();
  });

  // Navigation Rail destination buttons
  getEl('railBtnProperties').addEventListener('click', (e) => {
    e.stopPropagation();
    cancelCloseTimeout();
    if (state.activePanel === 'properties') {
      if (state.pinnedPanel === 'properties') {
        // Keep open
      } else {
        state.activePanel = null;
      }
    } else {
      state.activePanel = 'properties';
    }
    updateSidebarLayout();
  });

  getEl('railBtnBrowser').addEventListener('click', (e) => {
    e.stopPropagation();
    cancelCloseTimeout();
    if (state.activePanel === 'browser') {
      if (state.pinnedPanel === 'browser') {
        // Keep open
      } else {
        state.activePanel = null;
      }
    } else {
      state.activePanel = 'browser';
    }
    updateSidebarLayout();
  });


  // Profile popup toggle
  const profilePopover = getEl('profilePopover');
  getEl('railBtnProfile').addEventListener('click', (e) => {
    e.stopPropagation();
    profilePopover.classList.toggle('visible');
  });

  profilePopover.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Cancel close timeouts on mouse enter or click inside panels
  const setupPanelActivitySync = (panelEl) => {
    if (!panelEl) return;
    panelEl.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelCloseTimeout();
      if (profilePopover && profilePopover.classList.contains('visible')) {
        profilePopover.classList.remove('visible');
      }
    });
    panelEl.addEventListener('mouseenter', cancelCloseTimeout);
  };
  setupPanelActivitySync(getEl('panel-left'));
  setupPanelActivitySync(getEl('panel-project-browser'));
  setupPanelActivitySync(getEl('panel-settings'));

  getEl('nav-rail').addEventListener('click', (e) => {
    e.stopPropagation();
    if (profilePopover && profilePopover.classList.contains('visible') && !getEl('railBtnProfile').contains(e.target)) {
      profilePopover.classList.remove('visible');
    }
  });

  // Click outside listener for delayed floating panel close and profile popover close
  document.addEventListener('click', (e) => {
    // Close profile popover if click is outside
    if (profilePopover.classList.contains('visible') && !getEl('railBtnProfile').contains(e.target)) {
      profilePopover.classList.remove('visible');
    }

    // Delayed close for active floating panels
    if (state.activePanel && state.pinnedPanel !== state.activePanel) {
      const activeEl = state.activePanel === 'properties' ? getEl('panel-left') : getEl('panel-project-browser');
      if (activeEl && !activeEl.contains(e.target) && !getEl('nav-rail').contains(e.target)) {
        startCloseTimeout();
      }
    }
  });
  window.addEventListener('resize', () => {
    resizeCanvas();
    render();
    if (planCanvas) {
      resizePlanCanvas();
      renderPlan();
    }
  });

  // Theme
  getEl('btnTheme').addEventListener('click', toggleTheme);

  // Configs
  await refreshConfigOptions();
  const cs = getEl('configSelect');
  cs.value = state.configName;
  cs.addEventListener('change', async () => {
    const newConfigName = cs.value;
    if (newConfigName === 'Custom *' || newConfigName === '(Multiple)') return;

    // Warn if applying a new system and there's a depth mismatch
    if (newConfigName !== 'us_default' && state.wallsData && safeGet(state.wallsData, state.currentWallIdx)) {
      try {
        const savedConfig = await api.get(`/api/configs?name=${encodeURIComponent(newConfigName)}`);
        const configDepth = savedConfig.stud?.default_depth_mm;
        if (configDepth) {
          const w = safeGet(state.wallsData, state.currentWallIdx);
          if (w.thickness && Math.abs(w.thickness - configDepth) > 0.01) {
            const proceed = await showConfirm(`Warning: The selected configuration uses a Stud Size (${configDepth}mm) that does not match the Structural Width (${w.thickness}mm) of the selected wall. Do you want to proceed?`);
            if (!proceed) {
              cs.value = getWallConfigName(safeGet(state.wallsData, state.currentWallIdx)); // revert selection
              return;
            }
          }
        }
      } catch (e) {
        console.error("Failed to check config mismatch", e);
      }
    }

    // Load config from server into the property panel
    try {
      const cfg = await api.get(`/api/configs?name=${encodeURIComponent(newConfigName)}`);
      state.configRaw = mergeConfigRaw(cfg);
      await mergeCustomAssembliesToActiveConfig();
      populateConfigEditor(state.configRaw);
      if (newConfigName === 'us_default') {
        syncDepthFromWall();
      }
      updateSSMAFromFields('ssma-stud', 'cfg-stud-depth', 'cfg-stud-flange', 'cfg-stud-gauge');
      updateSSMAFromFields('ssma-track', 'cfg-track-depth', 'cfg-track-flange', 'cfg-track-gauge');

      // Apply the selected configuration name
      if (state.wallsData) {
        const targetIndices = (state.selectedWallIndices && state.selectedWallIndices.length > 0)
          ? state.selectedWallIndices
          : [state.currentWallIdx];
          
        if (!state.wallConfigNames) state.wallConfigNames = {};
        
        targetIndices.forEach(idx => {
          const w = safeGet(state.wallsData, idx);
          if (w) {
            const parentIdx = getParentWallIdx(w);
            safeSet(state.wallConfigNames, parentIdx, newConfigName);
            Reflect.deleteProperty(state.perWallOverrides, parentIdx);
          }
        });
      }
      updateWallConfigLabel();
    } catch (err) {
      showToast(`Failed to load config: ${err.message}`);
    }
  });

  // Wall files
  let wf = [];
  try {
    wf = await api.get('/api/walls');
    state.wallFiles = wf;
  } catch (err) {
    console.warn('[app] Failed to load wall files list:', err.message);
  }
  const wfs = getEl('wallFile');
  if (wfs) {
    wfs.addEventListener('change', async () => {
      if (wfs.value === 'standalone' || wfs.value === '') return;
      const versionId = wfs.value;
      if (!versionId) return;

      if (state.isReadOnly) {
        showToast("Cannot switch versions in Read-Only mode.");
        await updateTopBarVersionSelector();
        return;
      }

      if (typeof window.showLoading === 'function') {
        window.showLoading("Switching model version...");
      }
      try {
        // Fetch version and exchange option in parallel
        const [v, opt] = await Promise.all([
          projectsDB.getVersion(versionId, state.currentProjectCompanyId),
          projectsDB.getExchangeOption(state.currentExchangeId, state.currentProjectCompanyId)
        ]);
        if (!v) return;

        if (opt) {
          opt.activeVersionId = versionId;
          await projectsDB.updateExchangeOption(opt, state.currentProjectCompanyId);
        }

        await loadWallData(v.payload, opt.name);
        renderSettingsPanel();
        await updateTopBarVersionSelector();
        showToast(`Switched to version: ${v.name}`);
      } catch (err) {
        showToast("Failed to switch version: " + err.message);
      } finally {
        if (typeof window.hideLoading === 'function') {
          window.hideLoading();
        }
      }
    });
  }

  // Export JSON
  getEl('btnExport')?.addEventListener('click', exportJson);

  // Sync & Save Model
  getEl('btnSyncModel')?.addEventListener('click', async () => {
    if (state.isReadOnly) {
      showToast("Cannot sync and save model in Read-Only mode.");
      return;
    }
    if (!state.currentExchangeId) {
      showToast("No active Exchange Option selected.");
      return;
    }
    if (!state.wallsData || state.wallsData.length === 0) {
      showToast("No model loaded to save.");
      return;
    }

    const comment = await showPrompt("Enter a description/comment for this version:", `Saved changes ${new Date().toLocaleTimeString()}`);
    if (comment === null) return; // cancelled
    const trimmedComment = comment.trim() || `Saved changes ${new Date().toLocaleTimeString()}`;

    const btn = getEl('btnSyncModel');
    if (btn) {
      btn.classList.add('btn-sync-loading');
      btn.innerHTML = 'Syncing...';
    }

    try {
      const targetCid = state.currentProjectCompanyId || window.currentCompanyId;

      // 1. Fetch versions of the current exchange to determine the next version number
      const [versions, opt] = await Promise.all([
        projectsDB.getVersions(state.currentExchangeId, targetCid),
        projectsDB.getExchangeOption(state.currentExchangeId, targetCid)
      ]);

      const nextVerNum = (versions?.length || 0) + 1;

      // 2. Upload new version to Firestore
      const newVerId = await projectsDB.addVersion({
        exchangeOptionId: state.currentExchangeId,
        name: `Version ${nextVerNum} - ${trimmedComment}`,
        uploadedAt: new Date().toISOString(),
        uploadedBy: window.currentUser ? (window.currentUser.displayName || window.currentUser.email.split('@')[0]) : 'User',
        payload: {
          walls: state.wallsData,
          grids: state.gridsData,
          perWallOverrides: state.perWallOverrides,
          joinOverrides: state.joinOverrides,
          wallConfigNames: state.wallConfigNames
        }
      }, targetCid);

      // 3. Set this new version as active on the exchange option
      if (opt) {
        opt.activeVersionId = newVerId;
        await projectsDB.updateExchangeOption(opt, targetCid);
      }

      // 4. Refresh sidebar and version selector
      renderSettingsPanel();
      await updateTopBarVersionSelector();

      if (btn) {
        btn.classList.remove('btn-sync-loading');
        btn.classList.add('btn-sync-success');
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Synced!`;
        setTimeout(() => {
          btn.classList.remove('btn-sync-success');
          btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Sync & Save Model`;
        }, 2000);
      }
      showToast(`Model synced and saved successfully as Version ${nextVerNum}!`);

    } catch (err) {
      if (btn) {
        btn.classList.remove('btn-sync-loading');
        btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg> Sync & Save Model`;
      }
      showToast("Failed to sync and save model: " + err.message);
    }
  });

  // Upload JSON Version (FAB on rail)
  getEl('btnCreateProject')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!state.currentExchangeId) {
      showToast("No active Exchange Option selected. Please select a project and exchange option from the Home dashboard first.");
      return;
    }
    getEl('uploadRevitWalls').click();
  });
  getEl('uploadRevitWalls').addEventListener('change', handleRevitUpload);

  // Revit Family Catalog Upload
  getEl('btnUploadFamily').addEventListener('click', () => getEl('uploadRevitFamily').click());
  getEl('uploadRevitFamily').addEventListener('change', handleFamilyUpload);

  // Revit Profile Selector Modal Close & Search
  getEl('btnCloseRevitProfileModal').addEventListener('click', () => getEl('revitProfileModal').classList.add('hidden'));
  getEl('btnCancelRevitProfile').addEventListener('click', () => getEl('revitProfileModal').classList.add('hidden'));
  getEl('revitProfileSearch').addEventListener('input', renderRevitProfileList);

  // Join Manager Modal Close
  if (getEl('btnCloseJoinManager')) getEl('btnCloseJoinManager').addEventListener('click', () => getEl('joinManagerModal').classList.add('hidden'));
  if (getEl('btnCancelJoinManager')) getEl('btnCancelJoinManager').addEventListener('click', () => getEl('joinManagerModal').classList.add('hidden'));

  // Revit Overrides select buttons
  const bindRevitOverrideSelect = (btnId, filterType, prefix) => {
    const btn = getEl(btnId);
    if (!btn) return;
    btn.addEventListener('click', () => {
      showRevitProfileSelector(filterType, (profile) => {
        setFieldMm(`${prefix}-depth`, profile.depth_mm);
        setFieldMm(`${prefix}-flange`, profile.flange_mm);
        setFieldMm(`${prefix}-gauge`, profile.gauge_mm);
        const lbl = getEl(`${prefix}-revit-label`);
        if (lbl) {
          lbl.dataset.family = profile.familyName;
          lbl.dataset.symbol = profile.designation;
          lbl.innerText = `Selected: ${profile.designation}`;
        }
        updateRevitModeSelectOptionText(prefix, profile.designation);
        markWallCustom();
        saveCurrentWallConfig();
      });
    });
  };

  bindRevitOverrideSelect('btn-cfg-end-stud-revit-select', 'stud_or_track', 'cfg-end-stud');
  bindRevitOverrideSelect('btn-cfg-king-stud-revit-select', 'stud', 'cfg-king-stud');
  bindRevitOverrideSelect('btn-cfg-top-track-revit-select', 'track', 'cfg-top-track');
  bindRevitOverrideSelect('btn-cfg-bottom-track-revit-select', 'track', 'cfg-bottom-track');

  // 2D/3D Toggles
  getEl('btnView2D').addEventListener('click', () => switchView('2D'));
  getEl('btnViewPlan').addEventListener('click', () => switchView('Plan'));
  getEl('btnView3D').addEventListener('click', () => switchView('3D'));

  getEl('wallSelect').addEventListener('change', async () => {
    state.currentWallIdx = parseInt(getEl('wallSelect').value) || 0;
    state.selectedMember = null;
    state.selectedMembers = [];
    state.selectedOpening = null;
    state.selectedWallIndices = [state.currentWallIdx];
    // Restore the new wall's config (or sync from wall thickness)
    await restoreWallConfig(state.currentWallIdx);
    fitView(); render();
    if (planCanvas) renderPlan();
    updateMemberSummary(); updateWallInfo(); updateSelectedElementInfo();
  });

  // Unit selector
  getEl('unitSelect').addEventListener('change', () => { state.displayUnit = getEl('unitSelect').value; refreshDisplayUnits(); });

  // Canvas
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseUp);
  canvas.addEventListener('click', (e) => {
    if (state.dragDistance > 5) return;
    const isMulti = e.ctrlKey || e.shiftKey;

    const wall = getCurrentWall();
    if (wall && getActiveVisibilitySettings().showPanelNames) {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const [scx, scy] = w2s(wall.length_mm / 2, wall.height_mm / 2);

      const labelText = `Panel ${wall.label || wall.wall_id}`;
      const fontSize = 11;
      ctx.save();
      ctx.font = `bold ${fontSize}px Inter`;
      const textW = ctx.measureText(labelText).width;
      ctx.restore();

      const badgeHalfW = (textW + 20) / 2;
      const badgeHalfH = 11;

      if (Math.abs(mx - scx) <= badgeHalfW && Math.abs(my - scy) <= badgeHalfH) {
        if (isMulti) {
          state.selectedMembers = [];
          state.selectedMember = null;
          if (!state.selectedWallIndices) state.selectedWallIndices = [];
          const idx = state.selectedWallIndices.indexOf(state.currentWallIdx);
          if (idx !== -1) {
            state.selectedWallIndices.splice(idx, 1);
          } else {
            state.selectedWallIndices.push(state.currentWallIdx);
          }
        } else {
          state.selectedMembers = [];
          state.selectedMember = null;
          state.selectedWallIndices = [state.currentWallIdx];
        }
        render();
        if (planCanvas) renderPlan();
        updateSelectedElementInfo();
        updateMemberSummary();
        return;
      }
    }

    if (isMulti) {
      if (state.hoveredMember) {
        state.selectedOpening = null;
        state.selectedWallIndices = [];
        if (!state.selectedMembers) state.selectedMembers = [];
        const idx = state.selectedMembers.indexOf(state.hoveredMember);
        if (idx !== -1) {
          state.selectedMembers.splice(idx, 1);
        } else {
          state.selectedMembers.push(state.hoveredMember);
        }
        state.selectedMember = safeGet(state.selectedMembers, state.selectedMembers.length - 1) || null;
      }
    } else {
      state.selectedWallIndices = [];
      if (state.hoveredMember) {
        state.selectedOpening = null;
        state.selectedMember = state.hoveredMember;
        state.selectedMembers = [state.hoveredMember];
      } else if (state.hoveredOpening) {
        state.selectedMember = null;
        state.selectedMembers = [];
        state.selectedOpening = state.hoveredOpening;
      } else {
        state.selectedOpening = null;
        state.selectedMember = null;
        state.selectedMembers = [];
      }
    }
    render();
    if (planCanvas) renderPlan();
    updateSelectedElementInfo();
    updateMemberSummary();
  });
  getEl('btnZoomIn').addEventListener('click', () => { state.zoom *= 1.25; render(); updateZoomLabel(); });
  getEl('btnZoomOut').addEventListener('click', () => { state.zoom *= 0.8; render(); updateZoomLabel(); });
  getEl('btnFit').addEventListener('click', () => { fitView(); render(); });

  // Plan Canvas Event Listeners
  if (planCanvas) {
    planCanvas.addEventListener('contextmenu', e => e.preventDefault());
    planCanvas.addEventListener('wheel', onPlanWheel, { passive: false });
    planCanvas.addEventListener('mousedown', onPlanMouseDown);
    planCanvas.addEventListener('mousemove', onPlanMouseMove);
    planCanvas.addEventListener('mouseup', onPlanMouseUp);
    planCanvas.addEventListener('mouseleave', onPlanMouseUp);
    planCanvas.addEventListener('click', async (e) => {
      if (e.button !== 0) return;
      if (state.planDragDistance > 5) return;
      const isMulti = e.ctrlKey || e.shiftKey;

      if (state.hoveredPlanJoin) {
        state.selectedWallIndices = [];
        state.selectedMembers = [];
        state.selectedMember = null;
        state.selectedOpening = null;
        if (!state.selectedJoins) state.selectedJoins = [];

        if (!isMulti) {
          state.selectedJoin = state.hoveredPlanJoin;
          state.selectedJoins = [state.hoveredPlanJoin];
        } else {
          const keyHovered = [state.hoveredPlanJoin.stopped_wall_id, state.hoveredPlanJoin.continuing_wall_id].sort().join(':');
          const idx = state.selectedJoins.findIndex(sj => [sj.stopped_wall_id, sj.continuing_wall_id].sort().join(':') === keyHovered);
          if (idx !== -1) {
            state.selectedJoins.splice(idx, 1);
          } else {
            state.selectedJoins.push(state.hoveredPlanJoin);
          }
          state.selectedJoin = safeGet(state.selectedJoins, state.selectedJoins.length - 1) || null;
        }
        updateMemberSummary();
        updateWallInfo();
      } else if (state.hoveredPlanOpening) {
        state.selectedJoin = null;
        state.selectedJoins = [];
        if (!isMulti) {
          state.selectedWallIndices = [];
          state.selectedMembers = [];
          state.selectedMember = null;
          state.selectedOpening = state.hoveredPlanOpening;
          state.currentWallIdx = state.hoveredPlanOpeningWallIdx;
          getEl('wallSelect').value = state.currentWallIdx;
          await restoreWallConfig(state.currentWallIdx);
        }
        updateMemberSummary();
        updateWallInfo();
      } else if (state.hoveredPlanMember) {
        state.selectedJoin = null;
        state.selectedJoins = [];
        state.selectedOpening = null;
        if (isMulti) {
          state.selectedWallIndices = [];
          if (!state.selectedMembers) state.selectedMembers = [];
          const idx = state.selectedMembers.indexOf(state.hoveredPlanMember);
          if (idx !== -1) {
            state.selectedMembers.splice(idx, 1);
          } else {
            state.selectedMembers.push(state.hoveredPlanMember);
          }
          state.selectedMember = safeGet(state.selectedMembers, state.selectedMembers.length - 1) || null;
          if (state.hoveredPlanWallIdx !== null) {
            state.currentWallIdx = state.hoveredPlanWallIdx;
            getEl('wallSelect').value = state.currentWallIdx;
            await restoreWallConfig(state.currentWallIdx);
          }
        } else {
          state.selectedWallIndices = [];
          state.selectedMembers = [state.hoveredPlanMember];
          state.selectedMember = state.hoveredPlanMember;
          state.currentWallIdx = state.hoveredPlanWallIdx;
          getEl('wallSelect').value = state.currentWallIdx;
          await restoreWallConfig(state.currentWallIdx);
        }
        updateMemberSummary();
        updateWallInfo();
      } else if (state.hoveredPlanWallIdx !== null) {
        state.selectedJoin = null;
        state.selectedJoins = [];
        state.selectedOpening = null;
        if (isMulti) {
          state.selectedMembers = [];
          state.selectedMember = null;
          if (!state.selectedWallIndices) state.selectedWallIndices = [];
          const idx = state.selectedWallIndices.indexOf(state.hoveredPlanWallIdx);
          if (idx !== -1) {
            state.selectedWallIndices.splice(idx, 1);
          } else {
            state.selectedWallIndices.push(state.hoveredPlanWallIdx);
          }
          state.currentWallIdx = safeGet(state.selectedWallIndices, state.selectedWallIndices.length - 1) ?? state.hoveredPlanWallIdx;
          getEl('wallSelect').value = state.currentWallIdx;
          await restoreWallConfig(state.currentWallIdx);
        } else {
          state.selectedMembers = [];
          state.selectedMember = null;
          state.selectedWallIndices = [state.hoveredPlanWallIdx];
          state.currentWallIdx = state.hoveredPlanWallIdx;
          getEl('wallSelect').value = state.currentWallIdx;
          await restoreWallConfig(state.currentWallIdx);
        }
        updateMemberSummary();
        updateWallInfo();
      } else {
        if (!isMulti) {
          state.selectedMembers = [];
          state.selectedMember = null;
          state.selectedWallIndices = [];
          state.selectedOpening = null;
          state.selectedJoin = null;
          state.selectedJoins = [];
        }
      }
      updateSelectedElementInfo();
      renderPlan();
      render();
    });
    getEl('btnPlanZoomIn').addEventListener('click', () => { state.planZoom *= 1.25; renderPlan(); updatePlanZoomLabel(); });
    getEl('btnPlanZoomOut').addEventListener('click', () => { state.planZoom *= 0.8; renderPlan(); updatePlanZoomLabel(); });
    getEl('btnPlanFit').addEventListener('click', () => { fitPlanView(); renderPlan(); });
  }

  // Save/Update buttons
  getEl('btnSaveConfig').addEventListener('click', () => {
    const cs = getEl('configSelect');
    const updateSelect = getEl('updateConfigSelect');
    if (!cs || !updateSelect) return;

    updateSelect.innerHTML = '';
    let customConfigsCount = 0;

    for (let i = 0; i < cs.options.length; i++) {
      const val = safeGet(cs.options, i).value;
      if (val !== 'us_default' && val !== 'Custom *') {
        const o = document.createElement('option');
        o.value = val;
        o.textContent = safeGet(cs.options, i).textContent;
        updateSelect.appendChild(o);
        customConfigsCount++;
      }
    }

    if (customConfigsCount === 0) {
      showToast("No custom configurations saved yet. Please use 'Save As' to create one first.");
      return;
    }

    const activeConfig = state.configName;
    if (activeConfig !== 'us_default' && activeConfig !== 'Custom *') {
      updateSelect.value = activeConfig;
    }

    getEl('updateConfigModal').classList.remove('hidden');
  });

  const closeUpdateModal = () => getEl('updateConfigModal').classList.add('hidden');
  getEl('btnCloseUpdateConfigModal')?.addEventListener('click', closeUpdateModal);
  getEl('btnCancelUpdateConfig')?.addEventListener('click', closeUpdateModal);

  getEl('btnConfirmUpdateConfig')?.addEventListener('click', async () => {
    syncAllInputs();
    const configName = getEl('updateConfigSelect').value;
    if (!configName) return;

    // Save current wall config values
    saveCurrentWallConfig();
    const fullConfig = getFullConfig();

    try {
      await api.post(`/api/configs?name=${encodeURIComponent(configName)}`, fullConfig);
      closeUpdateModal();
      showToast(`Configuration '${configName}' updated successfully!`);

      // Update local state configName and active config name if it matches
      if (!state.wallsData) {
        state.configName = configName;
      }
      state.lastSavedConfigName = configName;
      if (state.currentWallIdx !== undefined && safeGet(state.wallsData, state.currentWallIdx)) {
        const parentIdx = getParentWallIdx(safeGet(state.wallsData, state.currentWallIdx));
        safeSet(state.wallConfigNames, parentIdx, configName);
        Reflect.deleteProperty(state.perWallOverrides, parentIdx);
      }

      await refreshConfigOptions();
      updateWallConfigLabel();
      await runFraming();
    } catch (err) {
      showToast(`Failed to update configuration: ${err.message}`);
    }
  });

  getEl('btnSaveAsConfig').addEventListener('click', async () => {
    syncAllInputs();
    const newName = await showPrompt("Enter a name for the new framing system:", state.lastSavedConfigName || "custom_system");
    if (!newName) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    if (trimmed === 'us_default' || trimmed === 'Custom *') {
      showToast("Invalid name. Cannot overwrite default or custom system names.");
      return;
    }

    // Save current wall config values
    saveCurrentWallConfig();
    const fullConfig = getFullConfig();

    try {
      await api.post(`/api/configs?name=${encodeURIComponent(trimmed)}`, fullConfig);

      if (!state.wallsData) {
        state.configName = trimmed;
      }
      state.lastSavedConfigName = trimmed;

      if (state.currentWallIdx !== undefined && safeGet(state.wallsData, state.currentWallIdx)) {
        const parentIdx = getParentWallIdx(safeGet(state.wallsData, state.currentWallIdx));
        safeSet(state.wallConfigNames, parentIdx, trimmed);
        Reflect.deleteProperty(state.perWallOverrides, parentIdx);
      }

      await refreshConfigOptions();
      updateWallConfigLabel();
      showToast(`Saved as new system: '${trimmed}'!`);
      await runFraming();
    } catch (err) {
      showToast(`Failed to save configuration: ${err.message}`);
    }
  });

  getEl('btnDeleteConfig').addEventListener('click', async () => {
    const name = state.configName;
    if (name === 'us_default' || name === 'Custom *') {
      showToast("Cannot delete the default configuration.");
      return;
    }

    // Check if any walls are using this config
    let wallsUsingConfig = 0;
    if (state.wallConfigNames) {
      for (const [wallIdx, configName] of Object.entries(state.wallConfigNames)) {
        if (configName === name) wallsUsingConfig++;
      }
    }

    let msg = `Are you sure you want to delete the configuration system '${name}'?`;
    if (wallsUsingConfig > 0) {
      msg += `\n\nWARNING: ${wallsUsingConfig} wall(s) are currently using this configuration. If you delete it, their settings will be preserved but marked as 'Custom *'.`;
    }

    if (!await showConfirm(msg)) return;

    try {
      await api.delete(`/api/configs?name=${encodeURIComponent(name)}`);

      // Revert to us_default
      state.configName = 'us_default';
      if (state.lastSavedConfigName === name) {
        state.lastSavedConfigName = 'us_default';
      }

      // Update any walls that were using this config to 'Custom *'
      if (state.wallConfigNames) {
        for (const wallIdx in state.wallConfigNames) {
          if (safeGet(state.wallConfigNames, wallIdx) === name) {
            const parentIdx = getParentWallIdx(safeGet(state.wallsData, wallIdx));
            safeSet(state.wallConfigNames, parentIdx, 'Custom *');
          }
        }
      }

      await refreshConfigOptions();
      updateWallInfo();

      // Reload config for the newly selected default
      await loadConfig();
      await runFraming();
    } catch (e) {
      showToast(`Failed to delete configuration: ${e.message}`);
    }
  });

  // Apply button
  getEl('btnApplyConfig').addEventListener('click', async () => {
    await runFraming();
  });

  // Sync dataset.mm whenever user manually types in any config input
  // AND mark the wall as having custom config
  document.querySelectorAll('#configEditor input[type="text"]').forEach(el => {
    el.addEventListener('input', () => {
      // Do not format on input, let user type
      markWallCustom();
    });
    el.addEventListener('change', async () => {
      const v = displayToMm(el.value);
      const isOffsetOrTolerance = el.id.includes('offset') || el.id.includes('tolerance') || el.id.includes('control-join');
      if (!isNaN(v) && (isOffsetOrTolerance || v > 0)) el.dataset.mm = v;
      markWallCustom();
      updateSSMAFromFields('ssma-stud', 'cfg-stud-depth', 'cfg-stud-flange', 'cfg-stud-gauge');
      updateSSMAFromFields('ssma-track', 'cfg-track-depth', 'cfg-track-flange', 'cfg-track-gauge');
      updateSSMAFromFields('cfg-end-stud-ssma', 'cfg-end-stud-depth', 'cfg-end-stud-flange', 'cfg-end-stud-gauge');
      updateSSMAFromFields('cfg-king-stud-ssma', 'cfg-king-stud-depth', 'cfg-king-stud-flange', 'cfg-king-stud-gauge');
      updateSSMAFromFields('cfg-top-track-ssma', 'cfg-top-track-depth', 'cfg-top-track-flange', 'cfg-top-track-gauge');
      updateSSMAFromFields('cfg-bottom-track-ssma', 'cfg-bottom-track-depth', 'cfg-bottom-track-flange', 'cfg-bottom-track-gauge');

      saveCurrentWallConfig();
    });
  });
  document.querySelectorAll('#configEditor input[type="checkbox"]').forEach(el => {
    el.addEventListener('change', () => {
      markWallCustom();
      saveCurrentWallConfig();
    });
  });
  // Mark custom for all selects
  document.querySelectorAll('#configEditor .config-section select').forEach(el => {
    if (el.id !== 'ssma-stud' && el.id !== 'ssma-track') {
      el.addEventListener('change', () => {
        markWallCustom();
        saveCurrentWallConfig();
      });
    }
  });

  const hrEl = getEl('headerRules');
  if (hrEl) {
    hrEl.addEventListener('input', (e) => {
      if (e.target.classList.contains('hr-width')) {
        markWallCustom();
      }
    });
    hrEl.addEventListener('change', (e) => {
      if (e.target.classList.contains('hr-width')) {
        const v = displayToMm(e.target.value);
        if (!isNaN(v) && v > 0) e.target.dataset.mm = v;
        markWallCustom();
        saveCurrentWallConfig();
      } else if (e.target.classList.contains('hr-type')) {
        markWallCustom();
        saveCurrentWallConfig();
      }
    });
  }

  const krEl = getEl('kingRules');
  if (krEl) {
    krEl.addEventListener('input', (e) => {
      if (e.target.classList.contains('kr-width')) {
        markWallCustom();
      }
    });
    krEl.addEventListener('change', (e) => {
      if (e.target.classList.contains('kr-width')) {
        const v = displayToMm(e.target.value);
        if (!isNaN(v) && v > 0) e.target.dataset.mm = v;
        markWallCustom();
        saveCurrentWallConfig();
      } else if (e.target.classList.contains('kr-type')) {
        markWallCustom();
        saveCurrentWallConfig();
      }
    });
  }

  // Initialize wall style overlay
  getEl('btnWallStyleHidden').addEventListener('click', () => setWallStyle('hidden'));
  getEl('btnWallStyleTranslucent').addEventListener('click', () => setWallStyle('translucent'));
  getEl('btnWallStyleSolid').addEventListener('click', () => setWallStyle('solid'));
  getEl('wallOpacitySlider').addEventListener('input', (e) => {
    state.wallOpacity = parseFloat(e.target.value);
    getEl('wallOpacityVal').textContent = Math.round(state.wallOpacity * 100) + '%';
    if (is3DInitialized && state.currentView === '3D') {
      render3DScene();
    }
    if (planCanvas) {
      renderPlan();
    }
  });
  updateWallStyleUI();

  // Initialize Section Box control
  const chkSectionBox = getEl('chkSectionBox');
  if (chkSectionBox) {
    chkSectionBox.addEventListener('change', (e) => {
      if (e.target.checked) {
        triggerSelectionBoxShortcut();
      } else {
        disableSelectionBox();
      }
    });
  }

  // Key sequence listener for BX (Revit Section Box) and VG (Visibility/Graphics) shortcut
  let keyBuffer = '';
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }
    if (e.key === 'Escape') {
      state.selectedMembers = [];
      state.selectedMember = null;
      state.selectedWallIndices = [];

      updateMemberSummary();
      updateWallInfo();
      updateSelectedElementInfo();
      render3DScene();
      render();
      if (planCanvas) renderPlan();
      return;
    }
    const key = e.key.toLowerCase();
    if (key.length === 1 && /[a-z0-9]/.test(key)) {
      keyBuffer += key;
      if (keyBuffer.endsWith('bx')) {
        e.preventDefault();
        keyBuffer = ''; // Reset buffer
        triggerSelectionBoxShortcut();
      } else if (keyBuffer.endsWith('vg')) {
        e.preventDefault();
        keyBuffer = ''; // Reset buffer
        showVisibilityGraphicsModal();
      }
      if (keyBuffer.length > 5) {
        keyBuffer = keyBuffer.slice(-5);
      }
    }
  });

  // Load saved visibility settings and profiles
  loadVisibilitySettings();
  loadVisibilityProfiles();

  // Initialize Visibility Graphics open button
  const btnOpenVG = getEl('btnOpenVG');
  if (btnOpenVG) {
    btnOpenVG.addEventListener('click', () => {
      showVisibilityGraphicsModal();
    });
  }

  initSSMADropdowns();
  // NOTE: loadConfig() and projectsDB.init() are auth-gated.
  // They are called by window.onAppUserReady() which auth.js invokes
  // after a successful sign-in — NOT here at DOMContentLoaded time.


  // Key listeners for custom selection cursors (+/-)
  const handleModifierKey = (e) => {
    updatePlanCursor(e);
    updateElevationCursor(e);
  };
  window.addEventListener('keydown', handleModifierKey);
  window.addEventListener('keyup', handleModifierKey);
  window.addEventListener('blur', () => {
    updatePlanCursor(null);
    updateElevationCursor(null);
  });

  // Resizers logic for horizontal panel sizing
  const resizerLeft = getEl('resizer-left');
  const resizerRight = getEl('resizer-right');
  const panelLeft = getEl('panel-left');
  const panelRight = getEl('panel-right');

  if (resizerLeft) {
    let startX, startWidth, activePanelEl;
    resizerLeft.addEventListener('mousedown', (e) => {
      activePanelEl = state.pinnedPanel === 'properties' ? getEl('panel-left') :
        (state.pinnedPanel === 'browser' ? getEl('panel-project-browser') : null);
      if (!activePanelEl) return;

      startX = e.clientX;
      startWidth = activePanelEl.getBoundingClientRect().width;
      resizerLeft.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const newWidth = Math.max(200, Math.min(800, startWidth + deltaX));
        activePanelEl.style.width = newWidth + 'px';
        activePanelEl.style.minWidth = newWidth + 'px';
        window.dispatchEvent(new Event('resize'));
      };

      const onMouseUp = () => {
        resizerLeft.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  if (resizerRight && panelRight) {
    let startX, startWidth;
    resizerRight.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startWidth = panelRight.getBoundingClientRect().width;
      resizerRight.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMouseMove = (moveEvent) => {
        const deltaX = startX - moveEvent.clientX;
        const newWidth = Math.max(200, Math.min(800, startWidth + deltaX));
        panelRight.style.width = newWidth + 'px';
        panelRight.style.minWidth = newWidth + 'px';
        window.dispatchEvent(new Event('resize'));
      };

      const onMouseUp = () => {
        resizerRight.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }
}

function setWallStyle(style) {
  state.wallStyle = style;
  updateWallStyleUI();
  if (is3DInitialized && state.currentView === '3D') {
    render3DScene();
  }
  if (planCanvas) {
    renderPlan();
  }
}

function updateWallStyleUI() {
  const styles = ['hidden', 'translucent', 'solid'];
  styles.forEach(s => {
    const btn = getEl(`btnWallStyle${s.charAt(0).toUpperCase() + s.slice(1)}`);
    if (btn) {
      if (state.wallStyle === s) {
        btn.className = 'btn btn-primary';
        btn.style.background = '';
        btn.style.color = '';
      } else {
        btn.className = 'btn';
        btn.style.background = 'var(--bg-panel)';
        btn.style.color = 'var(--text-secondary)';
      }
    }
  });

  const sliderContainer = getEl('wallOpacitySliderContainer');
  if (sliderContainer) {
    sliderContainer.style.display = state.wallStyle === 'translucent' ? 'flex' : 'none';
  }
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  render(); // Re-render canvas with new theme colors
  if (planCanvas) renderPlan();
  if (is3DInitialized) {
    if (scene3D) {
      const cs = getComputedStyle(document.documentElement);
      const bgCanvasColor = (cs.getPropertyValue('--bg-canvas') || '#0b0e14').trim();
      scene3D.background = new THREE.Color(bgCanvasColor);
    }
    update3DVisualStates();
    if (state.currentView === '3D') {
      render3DScene();
    }
  }
}

function resolveProfile(val) {
  if (!val) return null;
  if (val.startsWith('revit:')) {
    const des = val.substring(6);
    return (state.customRevitProfiles || []).find(x => x.designation === des) || null;
  }
  return parseSSMA(val);
}

function findRevitProfileByDims(type, depth, flange, gauge) {
  return (state.customRevitProfiles || []).find(p =>
    p.type === type &&
    Math.abs(p.depth_mm - depth) < 0.1 &&
    Math.abs(p.flange_mm - flange) < 0.1 &&
    Math.abs(p.gauge_mm - gauge) < 0.01
  );
}

function updateRevitLabelFromFields(prefix) {
  const lbl = getEl(`${prefix}-revit-label`);
  if (lbl) {
    if (lbl.dataset.symbol) {
      lbl.innerText = `Selected: ${lbl.dataset.symbol}`;
      updateRevitModeSelectOptionText(prefix, lbl.dataset.symbol);
    } else {
      const depth = parseFloat(getEl(`${prefix}-depth`).dataset.mm) || 0;
      const flange = parseFloat(getEl(`${prefix}-flange`).dataset.mm) || 0;
      const gauge = parseFloat(getEl(`${prefix}-gauge`).dataset.mm) || 0;
      const isStud = prefix.includes('stud');
      const p = findRevitProfileByDims(isStud ? 'stud' : 'track', depth, flange, gauge);
      if (p) {
        lbl.dataset.family = p.familyName;
        lbl.dataset.symbol = p.designation;
        lbl.innerText = `Selected: ${p.designation}`;
        updateRevitModeSelectOptionText(prefix, p.designation);
      } else {
        lbl.innerText = 'None Selected';
        updateRevitModeSelectOptionText(prefix, null);
      }
    }
  }
}

function syncSearchableSelects() {
  document.querySelectorAll('.custom-searchable-select').forEach(wrapper => {
    const select = wrapper.previousElementSibling;
    if (select && select.tagName === 'SELECT') {
      const trigger = wrapper.querySelector('.searchable-trigger');
      if (trigger) {
        const activeOpt = safeGet(select.options, select.selectedIndex);
        if (activeOpt && trigger.childNodes[0]) {
          trigger.childNodes[0].textContent = activeOpt.textContent;
        }
      }
    }
  });
}

function updateRevitModeSelectOptionText(prefix, symbol) {
  const modeSelect = getEl(`${prefix}-mode`) || getEl(`${prefix}-profile-mode`);
  if (modeSelect) {
    const opt = modeSelect.querySelector('option[value="revit"]');
    if (opt) {
      if (symbol) {
        opt.textContent = `Revit: ${symbol}`;
      } else {
        opt.textContent = `Revit Custom Family...`;
      }
    }
  }
}

function makeSelectSearchable(select) {
  if (!select) return;

  // Hide the original select
  select.style.display = 'none';

  // Clean up existing wrapper if present
  let wrapper = select.nextElementSibling;
  if (wrapper && wrapper.classList.contains('custom-searchable-select')) {
    wrapper.remove();
  }

  wrapper = document.createElement('div');
  wrapper.className = 'custom-searchable-select';
  select.parentNode.insertBefore(wrapper, select.nextSibling);

  const trigger = document.createElement('div');
  trigger.className = 'searchable-trigger';

  const selectedOpt = safeGet(select.options, select.selectedIndex) || safeGet(select.options, 0);
  trigger.textContent = selectedOpt ? selectedOpt.textContent : '-- Select --';

  const arrow = document.createElement('span');
  arrow.className = 'searchable-arrow';
  arrow.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
  trigger.appendChild(arrow);
  wrapper.appendChild(trigger);

  const menu = document.createElement('div');
  menu.className = 'searchable-menu hidden';

  const searchBox = document.createElement('div');
  searchBox.className = 'searchable-search-container';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = '🔍 Search...';
  searchInput.className = 'searchable-input';

  // Prevent form submission or accidental close when typing
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      // Select first item if exists
      const firstItem = listContainer.querySelector('.searchable-item');
      if (firstItem) firstItem.click();
    }
  });

  // Refocus input if clicking inside the menu structure (but not on an item)
  menu.addEventListener('click', (e) => {
    if (!e.target.classList.contains('searchable-item')) {
      searchInput.focus();
    }
  });

  searchBox.appendChild(searchInput);
  menu.appendChild(searchBox);

  const listContainer = document.createElement('div');
  listContainer.className = 'searchable-list';
  menu.appendChild(listContainer);
  wrapper.appendChild(menu);

  const createOptionItem = (opt) => {
    const item = document.createElement('div');
    item.className = 'searchable-item';
    if (opt.selected) {
      item.classList.add('selected');
    }
    item.textContent = opt.textContent;

    if (opt.value === 'revit_select' || opt.value === 'revit') {
      item.classList.add('revit-highlight');
    }

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      select.value = opt.value;
      trigger.childNodes[0].textContent = opt.textContent;

      // Dispatch change event to trigger existing app logic
      select.dispatchEvent(new Event('change', { bubbles: true }));
      closeMenu();
    });

    listContainer.appendChild(item);
  };

  const renderItems = (query = '') => {
    listContainer.innerHTML = '';
    query = query.toLowerCase().trim();

    Array.from(select.children).forEach(child => {
      if (child.tagName === 'OPTGROUP') {
        const options = Array.from(child.children).filter(opt =>
          opt.textContent.toLowerCase().includes(query)
        );

        if (options.length > 0) {
          const header = document.createElement('div');
          header.className = 'searchable-group-header';
          header.textContent = child.label;
          listContainer.appendChild(header);

          options.forEach(opt => {
            createOptionItem(opt);
          });
        }
      } else if (child.tagName === 'OPTION') {
        if (child.textContent.toLowerCase().includes(query)) {
          createOptionItem(child);
        }
      }
    });
  };

  const openMenu = () => {
    document.querySelectorAll('.searchable-menu').forEach(m => {
      if (m !== menu) m.classList.add('hidden');
    });
    document.querySelectorAll('.custom-searchable-select').forEach(w => {
      if (w !== wrapper) w.classList.remove('open');
    });

    menu.classList.remove('hidden');
    wrapper.classList.add('open');
    searchInput.value = '';
    renderItems();
    setTimeout(() => searchInput.focus(), 50);
  };

  const closeMenu = () => {
    menu.classList.add('hidden');
    wrapper.classList.remove('open');
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.classList.contains('hidden')) {
      openMenu();
    } else {
      closeMenu();
    }
  });

  searchInput.addEventListener('input', (e) => {
    renderItems(e.target.value);
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) {
      closeMenu();
    }
  });

  select.addEventListener('change', () => {
    const activeOpt = safeGet(select.options, select.selectedIndex);
    if (activeOpt) {
      trigger.childNodes[0].textContent = activeOpt.textContent;
    }
  });
}

function populateQuickSelectDropdowns() {
  const ss = getEl('ssma-stud');
  if (ss) {
    const prevVal = ss.value;
    ss.innerHTML = '';

    const oCustom = document.createElement('option');
    oCustom.value = '';
    oCustom.textContent = '-- Custom --';
    ss.appendChild(oCustom);

    const oRevit = document.createElement('option');
    oRevit.value = 'revit_select';
    oRevit.textContent = 'Revit Family...';
    oRevit.style.color = '#3182ce';
    oRevit.style.fontWeight = 'bold';
    oRevit.style.backgroundColor = 'rgba(49, 130, 206, 0.08)';
    ss.appendChild(oRevit);

    const revitStuds = (state.customRevitProfiles || []).filter(p => p.type === 'stud');
    if (revitStuds.length > 0) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = 'Revit Family Profiles';
      revitStuds.forEach(p => {
        const o = document.createElement('option');
        o.value = `revit:${p.designation}`;
        o.textContent = `Revit: ${p.designation}`;
        optGroup.appendChild(o);
      });
      ss.appendChild(optGroup);
    }

    const optGroupSSMA = document.createElement('optgroup');
    optGroupSSMA.label = 'SSMA Catalog';
    SSMA_COMMON_STUDS.forEach(d => {
      const o = document.createElement('option');
      o.value = d;
      o.textContent = d;
      optGroupSSMA.appendChild(o);
    });
    ss.appendChild(optGroupSSMA);

    if (prevVal && ss.querySelector(`option[value="${prevVal}"]`)) {
      ss.value = prevVal;
    } else {
      ss.value = '';
    }
  }

  const ts = getEl('ssma-track');
  if (ts) {
    const prevVal = ts.value;
    ts.innerHTML = '';

    const oCustom = document.createElement('option');
    oCustom.value = '';
    oCustom.textContent = '-- Custom --';
    ts.appendChild(oCustom);

    const oRevit = document.createElement('option');
    oRevit.value = 'revit_select';
    oRevit.textContent = 'Revit Family...';
    oRevit.style.color = '#3182ce';
    oRevit.style.fontWeight = 'bold';
    oRevit.style.backgroundColor = 'rgba(49, 130, 206, 0.08)';
    ts.appendChild(oRevit);

    const revitTracks = (state.customRevitProfiles || []).filter(p => p.type === 'track');
    if (revitTracks.length > 0) {
      const optGroup = document.createElement('optgroup');
      optGroup.label = 'Revit Family Profiles';
      revitTracks.forEach(p => {
        const o = document.createElement('option');
        o.value = `revit:${p.designation}`;
        o.textContent = `Revit: ${p.designation}`;
        optGroup.appendChild(o);
      });
      ts.appendChild(optGroup);
    }

    const optGroupSSMA = document.createElement('optgroup');
    optGroupSSMA.label = 'SSMA Catalog';
    SSMA_COMMON_TRACKS.forEach(d => {
      const o = document.createElement('option');
      o.value = d;
      o.textContent = d;
      optGroupSSMA.appendChild(o);
    });
    ts.appendChild(optGroupSSMA);

    if (prevVal && ts.querySelector(`option[value="${prevVal}"]`)) {
      ts.value = prevVal;
    } else {
      ts.value = '';
    }
  }

  const populateOverrideSelect = (selectId, list) => {
    const el = getEl(selectId);
    if (!el) return;
    const prevVal = el.value;
    el.innerHTML = '<option value="">-- Custom --</option>';
    list.forEach(d => {
      const o = document.createElement('option');
      o.value = d;
      o.textContent = d;
      el.appendChild(o);
    });
    if (prevVal) el.value = prevVal;
  };

  populateOverrideSelect('cfg-end-stud-ssma', SSMA_COMMON_STUDS);
  populateOverrideSelect('cfg-king-stud-ssma', SSMA_COMMON_STUDS);
  populateOverrideSelect('cfg-top-track-ssma', SSMA_COMMON_TRACKS);
  populateOverrideSelect('cfg-bottom-track-ssma', SSMA_COMMON_TRACKS);

  // Make all searchable
  makeSelectSearchable(getEl('ssma-stud'));
  makeSelectSearchable(getEl('ssma-track'));
  makeSelectSearchable(getEl('cfg-end-stud-ssma'));
  makeSelectSearchable(getEl('cfg-king-stud-ssma'));
  makeSelectSearchable(getEl('cfg-top-track-ssma'));
  makeSelectSearchable(getEl('cfg-bottom-track-ssma'));

  syncSearchableSelects();
}

function initSSMADropdowns() {
  populateQuickSelectDropdowns();

  const ss = getEl('ssma-stud');
  if (ss) {
    ss.addEventListener('change', () => {
      if (ss.value === 'revit_select') {
        showRevitProfileSelector('stud', (profile) => {
          let o = ss.querySelector(`option[value="revit:${profile.designation}"]`);
          if (!o) {
            o = document.createElement('option');
            o.value = `revit:${profile.designation}`;
            o.textContent = `Revit: ${profile.designation}`;
            ss.appendChild(o);
          }
          ss.value = `revit:${profile.designation}`;
          setFieldMm('cfg-stud-depth', profile.depth_mm);
          setFieldMm('cfg-stud-flange', profile.flange_mm);
          setFieldMm('cfg-stud-lip', profile.lip_mm);
          setFieldMm('cfg-stud-gauge', profile.gauge_mm);
          if (state.configRaw && state.configRaw.stud) {
            state.configRaw.stud.default_lip_mm = profile.lip_mm;
          }
          markWallCustom();
          saveCurrentWallConfig();
          makeSelectSearchable(ss);
        });
      } else {
        const p = resolveProfile(ss.value);
        if (p) {
          setFieldMm('cfg-stud-depth', p.depth_mm);
          setFieldMm('cfg-stud-flange', p.flange_mm);
          setFieldMm('cfg-stud-lip', p.lip_mm || 9.525);
          setFieldMm('cfg-stud-gauge', p.gauge_mm);
          if (state.configRaw && state.configRaw.stud) {
            state.configRaw.stud.default_lip_mm = p.lip_mm || 9.525;
          }
        }
        markWallCustom();
        saveCurrentWallConfig();
      }
    });
  }

  const ts = getEl('ssma-track');
  if (ts) {
    ts.addEventListener('change', () => {
      if (ts.value === 'revit_select') {
        showRevitProfileSelector('track', (profile) => {
          let o = ts.querySelector(`option[value="revit:${profile.designation}"]`);
          if (!o) {
            o = document.createElement('option');
            o.value = `revit:${profile.designation}`;
            o.textContent = `Revit: ${profile.designation}`;
            ts.appendChild(o);
          }
          ts.value = `revit:${profile.designation}`;
          setFieldMm('cfg-track-depth', profile.depth_mm);
          setFieldMm('cfg-track-flange', profile.flange_mm);
          setFieldMm('cfg-track-gauge', profile.gauge_mm);
          markWallCustom();
          saveCurrentWallConfig();
          makeSelectSearchable(ts);
        });
      } else {
        const p = resolveProfile(ts.value);
        if (p) {
          setFieldMm('cfg-track-depth', p.depth_mm);
          setFieldMm('cfg-track-flange', p.flange_mm);
          setFieldMm('cfg-track-gauge', p.gauge_mm);
        }
        markWallCustom();
        saveCurrentWallConfig();
      }
    });
  }

  // End Stud Override dropdowns
  const ess = getEl('cfg-end-stud-ssma');
  if (ess) {
    ess.addEventListener('change', () => {
      const p = resolveProfile(ess.value);
      if (p) {
        setFieldMm('cfg-end-stud-depth', p.depth_mm);
        setFieldMm('cfg-end-stud-flange', p.flange_mm);
        setFieldMm('cfg-end-stud-gauge', p.gauge_mm);
      }
      markWallCustom();
      saveCurrentWallConfig();
    });
  }

  // King Stud Override dropdowns
  const kss = getEl('cfg-king-stud-ssma');
  if (kss) {
    kss.addEventListener('change', () => {
      const p = resolveProfile(kss.value);
      if (p) {
        setFieldMm('cfg-king-stud-depth', p.depth_mm);
        setFieldMm('cfg-king-stud-flange', p.flange_mm);
        setFieldMm('cfg-king-stud-gauge', p.gauge_mm);
      }
      markWallCustom();
      saveCurrentWallConfig();
    });
  }

  // Top Track Override dropdowns
  const tts = getEl('cfg-top-track-ssma');
  if (tts) {
    tts.addEventListener('change', () => {
      const p = resolveProfile(tts.value);
      if (p) {
        setFieldMm('cfg-top-track-depth', p.depth_mm);
        setFieldMm('cfg-top-track-flange', p.flange_mm);
        setFieldMm('cfg-top-track-gauge', p.gauge_mm);
      }
      markWallCustom();
      saveCurrentWallConfig();
    });
  }

  // Bottom Track Override dropdowns
  const bts = getEl('cfg-bottom-track-ssma');
  if (bts) {
    bts.addEventListener('change', () => {
      const p = resolveProfile(bts.value);
      if (p) {
        setFieldMm('cfg-bottom-track-depth', p.depth_mm);
        setFieldMm('cfg-bottom-track-flange', p.flange_mm);
        setFieldMm('cfg-bottom-track-gauge', p.gauge_mm);
      }
      markWallCustom();
      saveCurrentWallConfig();
    });
  }

  // Mode selects
  const bindOverrideMode = (modeId, prefix) => {
    const el = getEl(modeId);
    if (!el) return;
    el.addEventListener('change', () => {
      updateOverrideFieldsVisibility(prefix, el.value);
      if (el.value === 'revit') {
        const isStud = prefix.includes('stud');
        let filterType = isStud ? 'stud' : 'track';
        if (prefix === 'cfg-end-stud') {
          filterType = 'stud_or_track';
        }
        showRevitProfileSelector(filterType, (profile) => {
          setFieldMm(`${prefix}-depth`, profile.depth_mm);
          setFieldMm(`${prefix}-flange`, profile.flange_mm);
          setFieldMm(`${prefix}-gauge`, profile.gauge_mm);
          const lbl = getEl(`${prefix}-revit-label`);
          if (lbl) {
            lbl.dataset.family = profile.familyName;
            lbl.dataset.symbol = profile.designation;
            lbl.innerText = `Selected: ${profile.designation}`;
          }
          updateRevitModeSelectOptionText(prefix, profile.designation);
          markWallCustom();
          saveCurrentWallConfig();
        });
      } else {
        markWallCustom();
        saveCurrentWallConfig();
      }
    });
  };

  bindOverrideMode('cfg-end-stud-mode', 'cfg-end-stud');
  bindOverrideMode('cfg-king-stud-profile-mode', 'cfg-king-stud');
  bindOverrideMode('cfg-top-track-mode', 'cfg-top-track');
  bindOverrideMode('cfg-bottom-track-mode', 'cfg-bottom-track');
}

function updateOverrideFieldsVisibility(prefix, mode) {
  const ssContainer = getEl(`${prefix}-ssma-container`);
  const customGrid = getEl(`${prefix}-custom-grid`);
  const revitContainer = getEl(`${prefix}-revit-container`);
  if (ssContainer) ssContainer.style.display = mode === 'ssma' ? 'block' : 'none';
  if (customGrid) customGrid.style.display = mode === 'custom' ? 'grid' : 'none';
  if (revitContainer) revitContainer.style.display = mode === 'revit' ? 'block' : 'none';

  if (mode === 'revit') {
    updateRevitLabelFromFields(prefix);
  }
}

function mergeConfigRaw(newConfig) {
  if (state.configRaw) {
    const keys = ['custom_headers', 'custom_kings', 'custom_l_joins', 'custom_t_joins'];
    keys.forEach(k => {
      if (safeGet(state.configRaw, k)) {
        safeSet(newConfig, k, { ...safeGet(state.configRaw, k), ...safeGet(newConfig, k) });
      }
    });
  }
  return newConfig;
}

async function mergeCustomAssembliesToActiveConfig() {
  if (!state.configRaw) return;
  try {
    const targetCid = state.currentProjectCompanyId || window.currentCompanyId;
    const assemblies = await projectsDB.getCustomAssemblies(targetCid);
    assemblies.forEach(a => {
      let dictKey;
      if (a.type === 'header') dictKey = 'custom_headers';
      else if (a.type === 'king') dictKey = 'custom_kings';
      else if (a.type === 'l_join') dictKey = 'custom_l_joins';
      else if (a.type === 't_join') dictKey = 'custom_t_joins';
      
      if (!state.configRaw[dictKey]) state.configRaw[dictKey] = {};
      state.configRaw[dictKey][a.name] = a.data;
    });
  } catch (err) {
    console.warn("Failed to load or merge custom assemblies:", err);
  }
}

async function loadConfig() {
  try {
    const raw = await api.get(`/api/configs?name=${encodeURIComponent(state.configName)}`);
    state.configRaw = mergeConfigRaw(raw);
    await mergeCustomAssembliesToActiveConfig();
    populateConfigEditor(state.configRaw);
  } catch (err) {
    showToast(`Failed to load configuration: ${err.message}`);
  }
}

async function refreshConfigOptions() {
  try {
    const configs = await api.get('/api/configs');
    const cs = getEl('configSelect');
    if (!cs) return;

    const currentVal = cs.value;
    const hasCustom = !!Array.from(cs.options).find(o => o.value === 'Custom *');

    cs.innerHTML = '';
    configs.forEach(c => {
      const o = document.createElement('option');
      o.value = c.name;
      o.textContent = c.name;
      cs.appendChild(o);
    });

    if (hasCustom || currentVal === 'Custom *') {
      const o = document.createElement('option');
      o.value = 'Custom *';
      o.textContent = 'Custom *';
      o.disabled = true;
      cs.appendChild(o);
    }

    cs.value = currentVal;

    // Re-render groups so group dropdowns update!
    if (typeof renderGroups === 'function') {
      renderGroups();
    }
  } catch (err) {
    console.error("Failed to refresh configuration options:", err);
  }
}

async function loadWalls(fileName) {
  if (typeof window.showLoading === 'function') {
    window.showLoading("Loading model...");
  }
  try {
    const data = await api.get(`/api/walls/${fileName}`);
    state.wallsData = data.walls || data;
    state.originalWallsData = JSON.parse(JSON.stringify(state.wallsData));
    state.gridsData = data.grids || [];
    state.currentWallIdx = 0;
    state.selectedMember = null;
    state.selectedMembers = [];
    state.selectedWallIndices = [0];
    state.perWallOverrides = {};  // Reset per-wall configs for new wall set
    state.wallConfigNames = {};   // Reset config name mapping for new wall set
    if (state.hiddenElements) state.hiddenElements.clear();
    resetSectionBoxState();
    // Reset 3D camera framing so the new wall set is auto-framed
    camera3DFramed = false;
    hovered3DMember = null;
    hovered3DWallIdx = null;
    const sel = getEl('wallSelect'); sel.innerHTML = '';
    state.wallsData.forEach((w, i) => { const o = document.createElement('option'); o.value = i; o.textContent = w.label || w.wall_id; sel.appendChild(o); });
    if (typeof renderProjectBrowser === 'function') renderProjectBrowser();
    await restoreWallConfig(0);
    await runFraming(false);
  } finally {
    if (typeof window.hideLoading === 'function') {
      window.hideLoading();
    }
  }
}

/** Sync all input dataset.mm from current displayed values */
function syncAllInputs() {
  // No-op: the inputs correctly update dataset.mm via 'change' event listeners.
  // We do not want to round-trip display values which could drop precision for gauge.
}

function refreshDisplayUnits() {
  const unitText = state.displayUnit === 'mm' ? 'mm' : (state.displayUnit === 'in' ? 'in' : 'ft-in');
  document.querySelectorAll('.input-unit').forEach(el => el.textContent = unitText);
  document.querySelectorAll('input[type="text"][data-mm]').forEach(el => {
    const val = parseFloat(el.dataset.mm);
    if (!isNaN(val)) el.value = mmToDisplay(val);
  });
  if (state.wallsData) {
    updateWallInfo();
    render();
    if (planCanvas) renderPlan();
    updateSelectedElementInfo();
  }
}

/** Auto-sync stud/track depth from the currently selected wall's thickness */
function syncDepthFromWall() {
  if (!state.wallsData) return;
  const wall = safeGet(state.wallsData, state.currentWallIdx);
  if (!wall || !wall.thickness || wall.thickness <= 0) return;

  const thick = wall.thickness;

  // Update stud and track depth fields to match wall thickness
  setFieldMm('cfg-stud-depth', thick);
  setFieldMm('cfg-track-depth', thick);

  // Auto-select matching SSMA designation in dropdowns based on depth only (best effort)
  autoSelectSSMA('ssma-stud', thick, 'S');
  autoSelectSSMA('ssma-track', thick, 'T');
}

/** Try to auto-select the SSMA dropdown option that matches the given depth */
function autoSelectSSMA(selectId, depthMm, studOrTrack) {
  const sel = getEl(selectId);
  if (!sel) return;

  const depthCode = Math.round(depthMm / 25.4 * 100);
  const prefix = depthCode.toString() + studOrTrack;

  for (let i = 0; i < sel.options.length; i++) {
    const val = safeGet(sel.options, i).value;
    const checkVal = val.startsWith('revit:') ? val.substring(6) : val;
    if (checkVal.startsWith(prefix)) {
      sel.value = val;
      const p = resolveProfile(val);
      if (p) {
        if (studOrTrack === 'S') {
          setFieldMm('cfg-stud-flange', p.flange_mm);
          setFieldMm('cfg-stud-gauge', p.gauge_mm);
        } else {
          setFieldMm('cfg-track-flange', p.flange_mm);
          setFieldMm('cfg-track-gauge', p.gauge_mm);
        }
      }
      return;
    }
  }
}

function updateSSMAFromFields(selectId, depthId, flangeId, gaugeId) {
  const depthMm = parseFloat(getEl(depthId).dataset.mm);
  const flangeMm = parseFloat(getEl(flangeId).dataset.mm);
  const gaugeMm = parseFloat(getEl(gaugeId).dataset.mm);
  const sel = getEl(selectId);
  if (!sel || isNaN(depthMm) || isNaN(flangeMm) || isNaN(gaugeMm)) return;

  for (let i = 0; i < sel.options.length; i++) {
    const val = safeGet(sel.options, i).value;
    if (!val || val === 'revit_select') continue;
    const p = resolveProfile(val);
    if (p && Math.abs(p.depth_mm - depthMm) < 1 &&
      Math.abs(p.flange_mm - flangeMm) < 1 &&
      Math.abs(p.gauge_mm - gaugeMm) < 0.1) {
      sel.value = val;
      return;
    }
  }
  sel.value = "";
  if (typeof syncSearchableSelects === 'function') {
    syncSearchableSelects();
  }
}

/** 
 * Mark the current wall as having custom (user-modified) configuration.
 * This gets called whenever any config input changes.
 */
function markWallCustom() {
  if (!state.wallsData) return;
  // Show in the main Config System dropdown
  const cs = getEl('configSelect');
  if (cs) {
    let hasOpt = false;
    for (let i = 0; i < cs.options.length; i++) {
      if (safeGet(cs.options, i).value === 'Custom *') hasOpt = true;
    }
    if (!hasOpt) {
      const o = document.createElement('option');
      o.value = 'Custom *';
      o.textContent = 'Custom *';
      o.disabled = true;
      cs.appendChild(o);
    }
    cs.value = 'Custom *';
  }
}

/** Update the wall info panel to show which config is active for this wall */
function updateWallConfigLabel() {
  let label = '';
  if (state.selectedWallIndices && state.selectedWallIndices.length > 1) {
    const configs = state.selectedWallIndices.map(idx => getWallConfigName(safeGet(state.wallsData, idx)));
    const uniqueConfigs = [...new Set(configs)];
    if (uniqueConfigs.length > 1) {
      label = '(Multiple)';
    } else {
      label = uniqueConfigs[0];
    }
  } else {
    label = getWallConfigName(safeGet(state.wallsData, state.currentWallIdx));
  }

  // Show in wall info
  const indicator = document.getElementById('wallConfigIndicator');
  if (indicator) {
    indicator.textContent = label;
    indicator.style.color = label === 'Custom *' ? '#ecc94b' : (label === '(Multiple)' ? '#90cdf4' : 'var(--accent)');
  }

  // Show in the main Config System dropdown as well
  const cs = getEl('configSelect');
  if (cs) {
    // Clean up temporary disabled options if they are not the active label
    for (let i = cs.options.length - 1; i >= 0; i--) {
      const opt = cs.options[i];
      if ((opt.value === 'Custom *' || opt.value === '(Multiple)') && opt.value !== label) {
        cs.remove(i);
      }
    }
    // Check if we have the active label
    let hasOpt = false;
    for (let i = 0; i < cs.options.length; i++) {
      if (cs.options[i].value === label) hasOpt = true;
    }
    if (!hasOpt) {
      const o = document.createElement('option');
      o.value = label;
      o.textContent = label;
      if (label === 'Custom *' || label === '(Multiple)') {
        o.disabled = true;
      }
      cs.appendChild(o);
    }
    cs.value = label;
  }
}

function updateControlJoinStatusUI() {
  const container = getEl('cfg-control-join-status-container');
  if (!container) return;

  if (!state.wallsData) {
    container.style.display = 'none';
    return;
  }

  const currentWall = safeGet(state.wallsData, state.currentWallIdx);
  if (!currentWall) {
    container.style.display = 'none';
    return;
  }

  const parentIdx = getParentWallIdx(currentWall);
  const systemMaxLen = state.configRaw?.control_join?.max_length_mm || state.configRaw?.control_join_max_length_mm || 0;
  const parentWall = state.originalWallsData?.[parentIdx] || currentWall;
  const parentLength = parentWall ? (parentWall.length || 0) : 0;
  const hasRemoveOverride = (
    safeGet(safeGet(state.perWallOverrides, parentIdx), 'control_join_max_length_mm') === 0 &&
    systemMaxLen > 0 &&
    parentLength > systemMaxLen
  );
  const isSplitPanel = /_P\d+$/.test(currentWall.wall_id);

  if (isSplitPanel || hasRemoveOverride) {
    container.style.display = 'block';
    if (hasRemoveOverride) {
      container.innerHTML = `
        <div style="padding: 10px; border-radius: 4px; background: rgba(236,201,75,0.08); border: 1px solid rgba(236,201,75,0.2); font-size: 11px; margin-top: 4px; grid-column: 1 / span 2;">
          <div style="font-weight: 600; color: #ecc94b; margin-bottom: 2px;">✓ Control join will be removed</div>
          <div style="color: var(--text-secondary); margin-bottom: 6px;">Click Apply & Refresh to restore default.</div>
          <button id="btnRemoveJoinCancel" type="button" class="btn btn-accent" style="width: 100%; padding: 4px 8px; font-size: 11px; font-weight: 600; height: 24px; display: flex; align-items: center; justify-content: center;">Undo Remove</button>
        </div>
      `;

      const btnUndo = container.querySelector('#btnRemoveJoinCancel');
      if (btnUndo) {
        btnUndo.addEventListener('click', async () => {
          // Remove override for control join only
          if (safeGet(state.perWallOverrides, parentIdx)) {
            Reflect.deleteProperty(safeGet(state.perWallOverrides, parentIdx), 'control_join_max_length_mm');

            // Revert back config selectivity if no overrides remain
            if (Object.keys(safeGet(state.perWallOverrides, parentIdx)).length === 0) {
              Reflect.deleteProperty(state.perWallOverrides, parentIdx);
              if (state.wallConfigNames) {
                Reflect.deleteProperty(state.wallConfigNames, parentIdx);
              }
              const cs = getEl('configSelect');
              if (cs) {
                cs.value = state.configName || 'us_default';
              }
            }
          }
          // Restore values
          await restoreWallConfig(state.currentWallIdx);
          updateControlJoinStatusUI();
          updateSelectedElementInfo();
        });
      }
    } else {
      container.innerHTML = `
        <div style="padding: 10px; border-radius: 4px; background: rgba(66,153,225,0.08); border: 1px solid rgba(66,153,225,0.2); font-size: 11px; margin-top: 4px; grid-column: 1 / span 2;">
          <div style="font-weight: 600; color: var(--accent); margin-bottom: 2px;">✓ Control join was applied on wall</div>
          <div style="color: var(--text-secondary); margin-bottom: 6px;">Split into multiple panels.</div>
          <button id="btnRemoveJoinConfirm" type="button" class="btn" style="width: 100%; padding: 4px 8px; font-size: 11px; background: #f56565; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; height: 24px; display: flex; align-items: center; justify-content: center;">Remove Join</button>
        </div>
      `;

      const btnRemove = container.querySelector('#btnRemoveJoinConfirm');
      if (btnRemove) {
        btnRemove.addEventListener('click', () => {
          // Stage removal by setting max length override to 0
          const ov = collectOverrides();
          ov.control_join_max_length_mm = 0;
          safeSet(state.perWallOverrides, parentIdx, ov);

          // Also update wallConfigNames to Custom *
          if (!state.wallConfigNames) state.wallConfigNames = {};
          safeSet(state.wallConfigNames, parentIdx, 'Custom *');

          // Update input field to show 0
          setFieldMm('cfg-control-join-max-length', 0);

          markWallCustom();
          updateControlJoinStatusUI();
          updateSelectedElementInfo();
        });
      }
    }
  } else {
    container.style.display = 'none';
  }
}

function getParentWallIdx(wall) {
  if (!wall) return 0;

  // 1. Exact object reference match (most reliable)
  if (state.originalWallsData) {
    const objIdx = state.originalWallsData.indexOf(wall);
    if (objIdx !== -1) return objIdx;
  }
  if (state.wallsData) {
    const objIdx = state.wallsData.indexOf(wall);
    if (objIdx !== -1) return objIdx;
  }

  // 2. ID-based match (only if wall has a truthy wall_id or WallId)
  const rawId = wall.wall_id || wall.WallId;
  if (rawId) {
    const wallIdStr = String(rawId);
    const baseId = wallIdStr.replace(/_P\d+$/, '');

    if (state.originalWallsData) {
      const idx = state.originalWallsData.findIndex(w => {
        const wId = w.wall_id || w.WallId;
        return wId && String(wId) === baseId;
      });
      if (idx !== -1) return idx;
      
      const idx2 = state.originalWallsData.findIndex(w => {
        const wId = w.wall_id || w.WallId;
        return wId && String(wId) === wallIdStr;
      });
      if (idx2 !== -1) return idx2;
    }

    if (state.wallsData) {
      const idx = state.wallsData.findIndex(w => {
        const wId = w.wall_id || w.WallId;
        return wId && String(wId) === baseId;
      });
      if (idx !== -1) return idx;
      
      const idx2 = state.wallsData.findIndex(w => {
        const wId = w.wall_id || w.WallId;
        return wId && String(wId) === wallIdStr;
      });
      if (idx2 !== -1) return idx2;
    }
  }

  // 3. Last resort fallbacks
  if (state.wallsData && state.currentWallIdx < state.wallsData.length && state.wallsData[state.currentWallIdx] === wall) {
    return state.currentWallIdx;
  }

  if (typeof state.currentWallIdx === 'number') {
    return state.currentWallIdx;
  }

  return 0;
}

function getOriginalWallInput(wallIdx) {
  if (wallIdx === undefined) wallIdx = state.currentWallIdx;
  if (!state.wallsData) return null;
  if (!state.framingResult || !safeGet(state.framingResult, wallIdx)) {
    if (state.originalWallsData && safeGet(state.originalWallsData, wallIdx)) {
      return safeGet(state.originalWallsData, wallIdx);
    }
    return safeGet(state.wallsData, wallIdx) || null;
  }
  const wallResult = safeGet(state.framingResult, wallIdx);
  const rawId = wallResult ? (wallResult.wall_id || wallResult.WallId) : null;
  if (rawId) {
    const baseId = String(rawId).replace(/_P\d+$/, '');
    const found = (state.originalWallsData || state.wallsData).find(w => {
      const wId = w.wall_id || w.WallId;
      return wId && String(wId) === baseId;
    });
    if (found) return found;
  }
  return safeGet(state.wallsData, wallIdx) || null;
}

/** Get the config name for a given wall or parent index */
function getWallConfigName(wall) {
  if (!state.wallConfigNames) state.wallConfigNames = {};
  if (typeof wall === 'number') {
    return safeGet(state.wallConfigNames, wall) || state.configName || 'us_default';
  }
  if (wall) {
    const parentIdx = getParentWallIdx(wall);
    return safeGet(state.wallConfigNames, parentIdx) || state.configName || 'us_default';
  }
  return state.configName || 'us_default';
}

/** Save the current wall's config panel values into perWallOverrides or commit config name */
function saveCurrentWallConfig() {
  if (state.isReadOnly) return;
  const cs = getEl('configSelect');
  const currentVal = cs ? cs.value : 'Custom *';

  const currentWall = safeGet(state.wallsData, state.currentWallIdx);
  if (!currentWall) return;
  const parentIdx = getParentWallIdx(currentWall);

  if (!state.wallConfigNames) state.wallConfigNames = {};
  safeSet(state.wallConfigNames, parentIdx, currentVal);

  if (currentVal === 'Custom *') {
    syncAllInputs();
    const ov = collectOverrides();
    safeSet(state.perWallOverrides, parentIdx, ov);
    if (state.configRaw) {
      if (ov.header_rules) state.configRaw.header_rules = ov.header_rules;
      if (ov.king_stud_rules) state.configRaw.king_stud_rules = ov.king_stud_rules;
    }
  } else {
    Reflect.deleteProperty(state.perWallOverrides, parentIdx);
  }
  updateWallConfigLabel();
}

/** Restore a wall's saved config into the config panel, or sync from thickness if none saved */
async function restoreWallConfig(wallIdx) {
  const wall = safeGet(state.wallsData, wallIdx);
  if (!wall) return;
  const parentIdx = getParentWallIdx(wall);

  let baseConfigName = getWallConfigName(parentIdx);
  if (baseConfigName === 'Custom *') {
    baseConfigName = 'us_default';
  }

  try {
    const baseConfig = await api.get(`/api/configs?name=${encodeURIComponent(baseConfigName)}`);
    state.configRaw = mergeConfigRaw(baseConfig);
    await mergeCustomAssembliesToActiveConfig();
    populateConfigEditor(state.configRaw);
  } catch (err) {
    console.error(`Failed to load base config ${baseConfigName}:`, err);
  }

  // Only sync depth from wall thickness if using the default configuration
  if (baseConfigName === 'us_default') {
    syncDepthFromWall();
  }

  const saved = safeGet(state.perWallOverrides, parentIdx);
  if (saved) {
    // Restore saved values to the config panel
    if (saved.stud_alignment !== undefined) getEl('cfg-stud-alignment').value = saved.stud_alignment;
    if (saved.stud_rotation !== undefined && getEl('cfg-stud-rotation')) getEl('cfg-stud-rotation').value = String(saved.stud_rotation);
    if (saved.stud_spacing !== undefined) setFieldMm('cfg-stud-spacing', saved.stud_spacing);
    if (saved.stud_depth !== undefined) setFieldMm('cfg-stud-depth', saved.stud_depth);
    if (saved.stud_flange !== undefined) setFieldMm('cfg-stud-flange', saved.stud_flange);
    if (saved.stud_lip !== undefined) setFieldMm('cfg-stud-lip', saved.stud_lip);
    if (saved.stud_gauge !== undefined) setFieldMm('cfg-stud-gauge', saved.stud_gauge);
    if (saved.track_depth !== undefined) setFieldMm('cfg-track-depth', saved.track_depth);
    if (saved.track_flange !== undefined) setFieldMm('cfg-track-flange', saved.track_flange);
    if (saved.track_gauge !== undefined) setFieldMm('cfg-track-gauge', saved.track_gauge);
    // Restore toggles
    if (saved.use_king_studs !== undefined) getEl('cfg-king-studs').checked = saved.use_king_studs;
    if (saved.use_trimmer_studs !== undefined) getEl('cfg-trimmer-studs').checked = saved.use_trimmer_studs;
    if (saved.use_cripple_studs !== undefined) getEl('cfg-cripple-studs').checked = saved.use_cripple_studs;
    if (saved.use_nogging !== undefined) getEl('cfg-nogging').checked = saved.use_nogging;
    if (saved.king_stud_mode !== undefined) getEl('cfg-king-mode').value = saved.king_stud_mode;

    // Restore additional settings
    if (saved.stud_top_offset_mm !== undefined) setFieldMm('cfg-stud-top-offset', saved.stud_top_offset_mm);
    if (saved.stud_bottom_offset_mm !== undefined) setFieldMm('cfg-stud-bottom-offset', saved.stud_bottom_offset_mm);
    if (saved.top_track_offset_mm !== undefined) setFieldMm('cfg-top-track-offset', saved.top_track_offset_mm);
    if (saved.bottom_track_offset_mm !== undefined) setFieldMm('cfg-bottom-track-offset', saved.bottom_track_offset_mm);
    if (saved.opening_tolerance_left_mm !== undefined) setFieldMm('cfg-opening-tolerance-left', saved.opening_tolerance_left_mm);
    if (saved.opening_tolerance_right_mm !== undefined) setFieldMm('cfg-opening-tolerance-right', saved.opening_tolerance_right_mm);
    if (saved.opening_tolerance_top_mm !== undefined) setFieldMm('cfg-opening-tolerance-top', saved.opening_tolerance_top_mm);
    if (saved.opening_tolerance_bottom_mm !== undefined) setFieldMm('cfg-opening-tolerance-bottom', saved.opening_tolerance_bottom_mm);

    if (saved.control_join_max_length_mm !== undefined) setFieldMm('cfg-control-join-max-length', saved.control_join_max_length_mm);
    if (saved.control_join_gap_mm !== undefined) setFieldMm('cfg-control-join-gap', saved.control_join_gap_mm);
    if (saved.control_join_start_from !== undefined) getEl('cfg-control-join-start-from').value = saved.control_join_start_from;

    if (saved.end_stud_revit_family !== undefined) {
      const lbl = getEl('cfg-end-stud-revit-label');
      if (lbl) {
        lbl.dataset.family = saved.end_stud_revit_family;
        lbl.dataset.symbol = saved.end_stud_revit_symbol || "";
      }
      updateRevitModeSelectOptionText('cfg-end-stud', saved.end_stud_revit_symbol);
    }
    if (saved.end_stud_mode !== undefined) {
      getEl('cfg-end-stud-mode').value = saved.end_stud_mode;
      updateOverrideFieldsVisibility('cfg-end-stud', saved.end_stud_mode);
    }
    if (saved.end_stud_ssma !== undefined) getEl('cfg-end-stud-ssma').value = saved.end_stud_ssma;
    if (saved.end_stud_depth_mm !== undefined) setFieldMm('cfg-end-stud-depth', saved.end_stud_depth_mm);
    if (saved.end_stud_flange_mm !== undefined) setFieldMm('cfg-end-stud-flange', saved.end_stud_flange_mm);
    if (saved.end_stud_gauge_mm !== undefined) setFieldMm('cfg-end-stud-gauge', saved.end_stud_gauge_mm);

    if (saved.king_stud_revit_family !== undefined) {
      const lbl = getEl('cfg-king-stud-revit-label');
      if (lbl) {
        lbl.dataset.family = saved.king_stud_revit_family;
        lbl.dataset.symbol = saved.king_stud_revit_symbol || "";
      }
      updateRevitModeSelectOptionText('cfg-king-stud', saved.king_stud_revit_symbol);
    }
    if (saved.king_stud_profile_mode !== undefined) {
      getEl('cfg-king-stud-profile-mode').value = saved.king_stud_profile_mode;
      updateOverrideFieldsVisibility('cfg-king-stud', saved.king_stud_profile_mode);
    }
    if (saved.king_stud_ssma !== undefined) getEl('cfg-king-stud-ssma').value = saved.king_stud_ssma;
    if (saved.king_stud_depth_mm !== undefined) setFieldMm('cfg-king-stud-depth', saved.king_stud_depth_mm);
    if (saved.king_stud_flange_mm !== undefined) setFieldMm('cfg-king-stud-flange', saved.king_stud_flange_mm);
    if (saved.king_stud_gauge_mm !== undefined) setFieldMm('cfg-king-stud-gauge', saved.king_stud_gauge_mm);

    if (saved.top_track_revit_family !== undefined) {
      const lbl = getEl('cfg-top-track-revit-label');
      if (lbl) {
        lbl.dataset.family = saved.top_track_revit_family;
        lbl.dataset.symbol = saved.top_track_revit_symbol || "";
      }
      updateRevitModeSelectOptionText('cfg-top-track', saved.top_track_revit_symbol);
    }
    if (saved.top_track_mode !== undefined) {
      getEl('cfg-top-track-mode').value = saved.top_track_mode;
      updateOverrideFieldsVisibility('cfg-top-track', saved.top_track_mode);
    }
    if (saved.top_track_ssma !== undefined) getEl('cfg-top-track-ssma').value = saved.top_track_ssma;
    if (saved.top_track_depth_mm !== undefined) setFieldMm('cfg-top-track-depth', saved.top_track_depth_mm);
    if (saved.top_track_flange_mm !== undefined) setFieldMm('cfg-top-track-flange', saved.top_track_flange_mm);
    if (saved.top_track_gauge_mm !== undefined) setFieldMm('cfg-top-track-gauge', saved.top_track_gauge_mm);

    if (saved.bottom_track_revit_family !== undefined) {
      const lbl = getEl('cfg-bottom-track-revit-label');
      if (lbl) {
        lbl.dataset.family = saved.bottom_track_revit_family;
        lbl.dataset.symbol = saved.bottom_track_revit_symbol || "";
      }
      updateRevitModeSelectOptionText('cfg-bottom-track', saved.bottom_track_revit_symbol);
    }
    if (saved.bottom_track_mode !== undefined) {
      getEl('cfg-bottom-track-mode').value = saved.bottom_track_mode;
      updateOverrideFieldsVisibility('cfg-bottom-track', saved.bottom_track_mode);
    }
    if (saved.bottom_track_ssma !== undefined) getEl('cfg-bottom-track-ssma').value = saved.bottom_track_ssma;
    if (saved.bottom_track_depth_mm !== undefined) setFieldMm('cfg-bottom-track-depth', saved.bottom_track_depth_mm);
    if (saved.bottom_track_flange_mm !== undefined) setFieldMm('cfg-bottom-track-flange', saved.bottom_track_flange_mm);
    if (saved.bottom_track_gauge_mm !== undefined) setFieldMm('cfg-bottom-track-gauge', saved.bottom_track_gauge_mm);

    // Restore custom assemblies to state.configRaw so they are saved / referenced correctly
    if (!state.configRaw) state.configRaw = {};
    if (saved.custom_headers) state.configRaw.custom_headers = { ...state.configRaw.custom_headers, ...saved.custom_headers };
    if (saved.custom_kings) state.configRaw.custom_kings = { ...state.configRaw.custom_kings, ...saved.custom_kings };
    if (saved.custom_l_joins) state.configRaw.custom_l_joins = { ...state.configRaw.custom_l_joins, ...saved.custom_l_joins };
    if (saved.custom_t_joins) state.configRaw.custom_t_joins = { ...state.configRaw.custom_t_joins, ...saved.custom_t_joins };
    if (saved.header_rules) state.configRaw.header_rules = saved.header_rules;
    if (saved.king_stud_rules) state.configRaw.king_stud_rules = saved.king_stud_rules;
    if (saved.l_join_style !== undefined) {
      state.configRaw.l_join_style = saved.l_join_style;
      if (getEl('cfg-l-join-style')) getEl('cfg-l-join-style').value = saved.l_join_style;
    }
    if (saved.t_join_style !== undefined) {
      state.configRaw.t_join_style = saved.t_join_style;
      if (getEl('cfg-t-join-style')) getEl('cfg-t-join-style').value = saved.t_join_style;
    }

    // Restore rule dropdowns and list
    if (saved.header_rules || saved.king_stud_rules || saved.custom_headers || saved.custom_kings || saved.custom_l_joins || saved.custom_t_joins) {
      populateRules(state.configRaw);
    }
  } else {
    // Clear datasets
    ['cfg-end-stud', 'cfg-king-stud', 'cfg-top-track', 'cfg-bottom-track'].forEach(prefix => {
      const lbl = getEl(`${prefix}-revit-label`);
      if (lbl) {
        delete lbl.dataset.family;
        delete lbl.dataset.symbol;
        lbl.innerText = 'None Selected';
      }
      updateRevitModeSelectOptionText(prefix, null);
    });
  }

  // Make sure SSMA dropdown matches exactly what's shown
  const studSymbol = saved?.stud_revit_symbol || state.configRaw?.stud?.revit_symbol || state.configRaw?.stud_revit_symbol;
  const ss = getEl('ssma-stud');
  if (ss) {
    if (studSymbol) {
      let o = ss.querySelector(`option[value="revit:${studSymbol}"]`);
      if (!o) {
        o = document.createElement('option');
        o.value = `revit:${studSymbol}`;
        o.textContent = `Revit: ${studSymbol}`;
        const optGroup = ss.querySelector('optgroup[label="Revit Family Profiles"]');
        if (optGroup) optGroup.appendChild(o);
        else ss.appendChild(o);
      }
      ss.value = `revit:${studSymbol}`;
      makeSelectSearchable(ss);
    } else {
      updateSSMAFromFields('ssma-stud', 'cfg-stud-depth', 'cfg-stud-flange', 'cfg-stud-gauge');
      makeSelectSearchable(ss);
    }
  }

  const trackSymbol = saved?.track_revit_symbol || state.configRaw?.track?.revit_symbol || state.configRaw?.track_revit_symbol;
  const ts = getEl('ssma-track');
  if (ts) {
    if (trackSymbol) {
      let o = ts.querySelector(`option[value="revit:${trackSymbol}"]`);
      if (!o) {
        o = document.createElement('option');
        o.value = `revit:${trackSymbol}`;
        o.textContent = `Revit: ${trackSymbol}`;
        const optGroup = ts.querySelector('optgroup[label="Revit Family Profiles"]');
        if (optGroup) optGroup.appendChild(o);
        else ts.appendChild(o);
      }
      ts.value = `revit:${trackSymbol}`;
      makeSelectSearchable(ts);
    } else {
      updateSSMAFromFields('ssma-track', 'cfg-track-depth', 'cfg-track-flange', 'cfg-track-gauge');
      makeSelectSearchable(ts);
    }
  }

  // Update the top configSelect to match this wall's config
  updateWallConfigLabel();
  updateControlJoinStatusUI();
  if (typeof syncBrowserTreeSelection === 'function') {
    syncBrowserTreeSelection();
  }
  if (typeof syncSearchableSelects === 'function') {
    syncSearchableSelects();
  }
}

function updateWallDropdownOptions() {
  const sel = getEl('wallSelect');
  if (!sel || !state.wallsData) return;
  for (let i = 0; i < sel.options.length; i++) {
    const opt = safeGet(sel.options, i);
    const wallIdx = parseInt(opt.value);
    const wallResult = state.framingResult?.[wallIdx];
    const hasErrors = wallResult?.validation_errors && wallResult.validation_errors.length > 0;
    const isMatched = state.filteredIndices && state.filteredIndices.includes(wallIdx);
    opt.textContent = (hasErrors ? '⚠️ ' : '') + (isMatched ? '✓ ' : '') + (safeGet(state.wallsData, wallIdx)?.label || safeGet(state.wallsData, wallIdx)?.wall_id || `Wall ${wallIdx}`);
    if (hasErrors) {
      opt.classList.add('wall-option-error');
    } else {
      opt.classList.remove('wall-option-error');
    }
  }
}

async function runFraming(keepView = true) {

  const sourceWalls = state.originalWallsData || state.wallsData;
  if (!sourceWalls) return;
  // Save current wall's config before framing
  saveCurrentWallConfig();
  const globalOverrides = collectOverrides(); // we will not pass this as global, just ignore it globally
  const walls = sourceWalls.map((w, i) => {
    const wallPayload = {
      wall_id: w.wall_id, label: w.label || '', length: w.length, height: w.height, thickness: w.thickness || 92.08,
      height_start: w.height_start,
      height_end: w.height_end,
      base_start: w.base_start,
      base_end: w.base_end,
      origin_x: w.origin_x || 0, origin_y: w.origin_y || 0, origin_z: w.origin_z || 0,
      direction_x: w.direction_x !== undefined ? w.direction_x : 1, direction_y: w.direction_y !== undefined ? w.direction_y : 0,
      layers: w.layers || [],
      fire_rating: w.fire_rating || '',
      revit_parameters: w.revit_parameters || {},
      openings: (w.openings || []).map(o => ({
        type: o.type || o.opening_type || 'window',
        x_offset: o.x_offset !== undefined ? o.x_offset : (o.x_start !== undefined ? o.x_start : 0.0),
        width: o.width,
        height: o.height,
        sill_height: o.sill_height || 0,
        label: o.label || null,
        config_overrides: o.config_overrides || null
      })),
    };

    // Attach per-wall config base name
    const wallConfName = getWallConfigName(i);
    wallPayload.config_name = wallConfName === 'Custom *' ? 'us_default' : wallConfName;

    // Attach per-wall overrides if they exist
    const wallOv = safeGet(state.perWallOverrides, i);
    if (wallOv) {
      wallPayload.config_overrides = wallOv;
    }
    return wallPayload;
  });
  const globalConfigOverrides = {};
  if (state.configRaw) {
    if (state.configRaw.custom_headers) globalConfigOverrides.custom_headers = state.configRaw.custom_headers;
    if (state.configRaw.custom_kings) globalConfigOverrides.custom_kings = state.configRaw.custom_kings;
    if (state.configRaw.custom_l_joins) globalConfigOverrides.custom_l_joins = state.configRaw.custom_l_joins;
    if (state.configRaw.custom_t_joins) globalConfigOverrides.custom_t_joins = state.configRaw.custom_t_joins;
  }
  const result = await api.post('/api/frame', {
    walls,
    config_name: state.configName,
    config_overrides: globalConfigOverrides,
    join_overrides: state.joinOverrides || {},
    custom_profiles: state.customRevitProfiles || []
  });
  state.framingResult = result.walls;
  if (result.inputs) {
    state.wallsData = result.inputs;
  }

  // Re-populate wallSelect with the actual split/unsplit panels
  const sel = getEl('wallSelect');
  if (sel && state.wallsData) {
    const prevVal = sel.value; // Store previous value if any
    sel.innerHTML = '';
    state.wallsData.forEach((w, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = w.label || w.wall_id;
      sel.appendChild(o);
    });
    // Try to restore selection by index, or default to 0
    if (prevVal !== '' && parseInt(prevVal) < state.wallsData.length) {
      sel.value = prevVal;
      state.currentWallIdx = parseInt(prevVal);
    } else {
      sel.value = 0;
      state.currentWallIdx = 0;
    }
    updateWallDropdownOptions();
    if (typeof renderProjectBrowser === 'function') renderProjectBrowser();
  }

  if (!keepView) {
    fitView();
  }
  if (planCanvas) {
    resizePlanCanvas();
    if (!keepView) {
      fitPlanView();
    }
    renderPlan();
  }
  render();
  updateMemberSummary();
  updateWallInfo();
  updateSelectedElementInfo();
  updateControlJoinStatusUI();

  if (state.currentView === '3D') {
    render3DScene();
  }
}

function base64ToBlob(base64, mimeType = 'application/octet-stream') {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    safeSet(byteNumbers, i, byteCharacters.charCodeAt(i));
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
}

async function exportJson() {
  if (!state.wallsData) return;
  saveCurrentWallConfig();
  const globalOverrides = collectOverrides();
  const walls = state.wallsData.map((w, i) => {
    const wallPayload = {
      wall_id: w.wall_id, label: w.label || '', length: w.length, height: w.height, thickness: w.thickness || 92.08,
      height_start: w.height_start,
      height_end: w.height_end,
      base_start: w.base_start,
      base_end: w.base_end,
      origin_x: w.origin_x || 0, origin_y: w.origin_y || 0, origin_z: w.origin_z || 0,
      direction_x: w.direction_x !== undefined ? w.direction_x : 1, direction_y: w.direction_y !== undefined ? w.direction_y : 0,
      layers: w.layers || [],
      fire_rating: w.fire_rating || '',
      revit_parameters: w.revit_parameters || {},
      openings: (w.openings || []).map(o => ({
        type: o.type || o.opening_type || 'window',
        x_offset: o.x_offset !== undefined ? o.x_offset : (o.x_start !== undefined ? o.x_start : 0.0),
        width: o.width,
        height: o.height,
        sill_height: o.sill_height || 0,
        label: o.label || null
      })),
    };
    // Attach per-wall config base name
    const wallConfName = getWallConfigName(i);
    wallPayload.config_name = wallConfName === 'Custom *' ? 'us_default' : wallConfName;

    const wallOv = safeGet(state.perWallOverrides, i);
    if (wallOv) wallPayload.config_overrides = wallOv;
    return wallPayload;
  });

  try {
    const globalConfigOverrides = {};
    if (state.configRaw) {
      if (state.configRaw.custom_headers) globalConfigOverrides.custom_headers = state.configRaw.custom_headers;
      if (state.configRaw.custom_kings) globalConfigOverrides.custom_kings = state.configRaw.custom_kings;
      if (state.configRaw.custom_l_joins) globalConfigOverrides.custom_l_joins = state.configRaw.custom_l_joins;
      if (state.configRaw.custom_t_joins) globalConfigOverrides.custom_t_joins = state.configRaw.custom_t_joins;
    }
    const result = await api.post('/api/export', {
      walls,
      config_name: state.configName,
      config_overrides: globalConfigOverrides,
      join_overrides: state.joinOverrides || {},
      custom_profiles: state.customRevitProfiles || []
    });
    if (result && result.data) {
      const blob = base64ToBlob(result.data, 'application/octet-stream');
      const url = URL.createObjectURL(blob);
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.href = url;
      downloadAnchorNode.setAttribute('download', result.filename || "revit_framing_data.frmx");
      downloadAnchorNode.style.display = 'none';

      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();

      setTimeout(() => {
        if (downloadAnchorNode.parentNode) {
          document.body.removeChild(downloadAnchorNode);
        }
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          // ignore
        }
      }, 30000);
    } else {
      showToast("Export failed: Invalid response format from server");
    }
  } catch (e) {
    showToast("Export failed: " + e.message);
  }
}

// ─── View Management ────────────────────────────────────────────────
state.currentView = '2D';

function switchView(view) {
  state.currentView = view;

  // Set all container displays
  getEl('view2DContainer').style.display = view === '2D' ? 'block' : 'none';
  getEl('viewPlanContainer').style.display = view === 'Plan' ? 'block' : 'none';
  getEl('view3DContainer').style.display = view === '3D' ? 'block' : 'none';

  // Show wall display overlay for both 3D and Plan views
  const overlay = getEl('controls3DOverlay');
  if (overlay) {
    overlay.style.display = (view === '3D' || view === 'Plan') ? 'flex' : 'none';
  }

  // Reset all button styles
  const btn2D = getEl('btnView2D');
  const btnPlan = getEl('btnViewPlan');
  const btn3D = getEl('btnView3D');

  btn2D.className = view === '2D' ? 'btn btn-primary' : 'btn';
  btnPlan.className = view === 'Plan' ? 'btn btn-primary' : 'btn';
  btn3D.className = view === '3D' ? 'btn btn-primary' : 'btn';

  // Reset manual background overrides
  [btn2D, btnPlan, btn3D].forEach(b => {
    b.style.background = '';
    b.style.color = '';
  });

  // Apply standard panel styles to non-active buttons
  if (view !== '2D') {
    btn2D.style.background = 'var(--bg-panel)';
    btn2D.style.color = 'var(--text-secondary)';
  }
  if (view !== 'Plan') {
    btnPlan.style.background = 'var(--bg-panel)';
    btnPlan.style.color = 'var(--text-secondary)';
  }
  if (view !== '3D') {
    btn3D.style.background = 'var(--bg-panel)';
    btn3D.style.color = 'var(--text-secondary)';
  }

  if (view === '2D') {
    resizeCanvas();
    fitView();
    render();
  } else if (view === 'Plan') {
    resizePlanCanvas();
    fitPlanView();
    renderPlan();
  } else if (view === '3D') {
    requestAnimationFrame(() => {
      init3D();
      resize3D();
      render3DScene();
    });
  }
}

// ─── Revit Profile Geometry Helpers ──────────────────────────────────────────

function parseProfileVertices(vertices) {
  if (!Array.isArray(vertices)) return null;
  return vertices.map(pt => {
    if (Array.isArray(pt)) {
      return { u: pt[0], v: pt[1] };
    } else if (pt && typeof pt === 'object') {
      const u = pt.u !== undefined ? pt.u : pt.x;
      const v = pt.v !== undefined ? pt.v : pt.y;
      if (u !== undefined && v !== undefined) {
        return { u, v };
      }
    }
    return null;
  }).filter(pt => pt !== null);
}

function getProfileShapeDefault(p) {
  if (p.shape_profile) return p.shape_profile;
  const fam = (p.familyName || '').toLowerCase();
  const des = (p.designation || '').toLowerCase();
  if (fam.includes('ch_stud') || fam.includes('ch stud') || fam.includes('ch-stud') || des.includes('ch')) {
    return 'ch_stud';
  }
  if (fam.includes('j_runner') || fam.includes('j runner') || fam.includes('j-runner') || 
      fam.includes('j_track') || fam.includes('j track') || fam.includes('j-track') || 
      des.includes('jr') || des.includes('j-runner') || des.includes('j-track')) {
    return 'j_runner';
  }
  if (fam.includes('hat') || fam.includes('furring') || fam.includes('dwc') || 
      des.includes('fc') || des.includes('hat') || des.includes('furring')) {
    return 'hat_channel';
  }
  if (fam.includes('z_girt') || fam.includes('z girt') || fam.includes('z-girt') || 
      fam.includes('z_section') || fam.includes('z section') || fam.includes('z-section') || 
      des.includes('zg') || des.includes('z-girt')) {
    return 'z_girt';
  }
  if (fam.includes('angle') || fam.includes('l-angle') || fam.includes('l_angle') || 
      des.includes('angle') || des.includes('l-angle') || des.includes('l-header')) {
    return 'angle';
  }
  if (p.type === 'track') {
    return 'track';
  }
  return 'c_stud';
}

function inferShapeProfile(familyName, designation, type, lip) {
  const fam = (familyName || '').toLowerCase();
  const des = (designation || '').toLowerCase();
  if (fam.includes('ch_stud') || fam.includes('ch stud') || fam.includes('ch-stud') || des.includes('ch')) {
    return 'ch_stud';
  }
  if (fam.includes('j_runner') || fam.includes('j runner') || fam.includes('j-runner') || 
      fam.includes('j_track') || fam.includes('j track') || fam.includes('j-track') || 
      des.includes('jr') || des.includes('j-runner') || des.includes('j-track')) {
    return 'j_runner';
  }
  if (fam.includes('hat') || fam.includes('furring') || fam.includes('dwc') || 
      des.includes('fc') || des.includes('hat') || des.includes('furring')) {
    return 'hat_channel';
  }
  if (fam.includes('z_girt') || fam.includes('z girt') || fam.includes('z-girt') || 
      fam.includes('z_section') || fam.includes('z section') || fam.includes('z-section') || 
      des.includes('zg') || des.includes('z-girt')) {
    return 'z_girt';
  }
  if (fam.includes('angle') || fam.includes('l-angle') || fam.includes('l_angle') || 
      des.includes('angle') || des.includes('l-angle') || des.includes('l-header')) {
    return 'angle';
  }
  if (type === 'track' || des.includes('t') || (lip === 0)) {
    return 'track';
  }
  return 'c_stud';
}

function getMemberShapeProfile(m) {
  const hasRevitFamily = !!(m.revit_family_name || m.revit_symbol_name);
  if (!hasRevitFamily) {
    const isCProfile = m.profile === 'C_STUD' || m.type.includes('stud');
    return isCProfile ? 'c_stud' : 'track';
  }
  const fam = m.revit_family_name || '';
  const sym = m.revit_symbol_name || '';
  const match = (state.customRevitProfiles || []).find(p => p.familyName === fam && p.designation === sym);
  if (match && match.shape_profile) {
    return match.shape_profile;
  }
  const isCProfile = m.profile === 'C_STUD' || m.type.includes('stud');
  const lip = isCProfile ? (m.lip_mm || 12.7) : 0;
  return inferShapeProfile(m.revit_family_name || m.label, m.revit_symbol_name || m.label, isCProfile ? 'stud' : 'track', lip);
}

// ─── Revit Family Type Catalog Parser & Upload ──────────────────────────

function parseUnitMultiplier(header) {
  const parts = header.split('##');
  if (parts.length >= 3) {
    const unit = parts[2].toLowerCase();
    if (unit.startsWith('inch') || unit === 'in') return 25.4;
    if (unit.startsWith('millimeter') || unit === 'mm') return 1.0;
    if (unit.startsWith('feet') || unit === 'ft') return 304.8;
  }
  return 25.4; // default fallback
}

function parseRevitTypeCatalog(content, filename) {
  const familyName = filename.replace(/\.[^/.]+$/, "");
  const lines = content.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headerLine = lines[0];
  const columns = headerLine.split(',');

  let colDepthIdx = -1;
  let colFlangeIdx = -1;
  let colFlangeShortIdx = -1;
  let colGaugeIdx = -1;
  let colLipIdx = -1;

  let depthMult = 25.4;
  let flangeMult = 25.4;
  let flangeShortMult = 25.4;
  let gaugeMult = 25.4;
  let lipMult = 25.4;

  for (let i = 1; i < columns.length; i++) {
    const col = safeGet(columns, i).trim().toLowerCase();
    const baseName = col.split('##')[0];

    if (baseName === 'd' || baseName === 'depth' || baseName === 'height' || baseName === 'section depth') {
      colDepthIdx = i;
      depthMult = parseUnitMultiplier(safeGet(columns, i));
    } else if (baseName === 'bf' || baseName === 'flange' || baseName === 'width' || baseName === 'flange width' || baseName === 'flangewidth') {
      colFlangeIdx = i;
      flangeMult = parseUnitMultiplier(safeGet(columns, i));
    } else if (baseName === 'bf2' || baseName === 'flange2' || baseName === 'short flange' || baseName === 'shortflange' || baseName === 'f2') {
      colFlangeShortIdx = i;
      flangeShortMult = parseUnitMultiplier(safeGet(columns, i));
    } else if (baseName === 'tf' || baseName === 'tf1' || baseName === 'thickness' || baseName === 'gauge' || baseName === 'design thickness') {
      colGaugeIdx = i;
      gaugeMult = parseUnitMultiplier(safeGet(columns, i));
    } else if (baseName === 'return' || baseName === 'lip' || baseName === 'return width' || baseName === 'r') {
      colLipIdx = i;
      lipMult = parseUnitMultiplier(safeGet(columns, i));
    }
  }

  const profiles = [];
  for (let i = 1; i < lines.length; i++) {
    const line = safeGet(lines, i).trim();
    if (!line) continue;
    const fields = line.split(',');
    if (fields.length < Math.max(colDepthIdx, colFlangeIdx, colGaugeIdx) + 1) continue;

    const designation = fields[0].trim();
    if (!designation) continue;

    const depth = colDepthIdx !== -1 ? (parseFloat(safeGet(fields, colDepthIdx)) || 0) * depthMult : 0;
    const flange = colFlangeIdx !== -1 ? (parseFloat(safeGet(fields, colFlangeIdx)) || 0) * flangeMult : 0;
    const flange_short = colFlangeShortIdx !== -1 ? (parseFloat(safeGet(fields, colFlangeShortIdx)) || 0) * flangeShortMult : 0;
    const gauge = colGaugeIdx !== -1 ? (parseFloat(safeGet(fields, colGaugeIdx)) || 0) * gaugeMult : 0;
    const lip = colLipIdx !== -1 ? (parseFloat(safeGet(fields, colLipIdx)) || 0) * lipMult : 0;

    let type = 'stud';
    if (designation.includes('T') || (colLipIdx === -1 || lip === 0)) {
      type = 'track';
    }

    const tempProfile = {
      designation,
      familyName,
      type,
      depth_mm: depth,
      flange_mm: flange,
      flange_short_mm: flange_short || undefined,
      gauge_mm: gauge,
      lip_mm: lip
    };
    tempProfile.shape_profile = getProfileShapeDefault(tempProfile);

    profiles.push(tempProfile);
  }

  return profiles;
}

function handleFamilyUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const content = event.target.result;
      let newProfiles = [];
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(content);
        newProfiles = Array.isArray(parsed) ? parsed : (parsed.profiles || []);
      } else {
        newProfiles = parseRevitTypeCatalog(content, file.name);
      }

      if (newProfiles.length === 0) {
        showToast("No valid framing profiles found in the uploaded file.");
        return;
      }

      if (!state.customRevitProfiles) state.customRevitProfiles = [];
      newProfiles.forEach(newP => {
        if (newP.vertices) {
          newP.vertices = parseProfileVertices(newP.vertices);
        }
        if (!newP.shape_profile) {
          newP.shape_profile = getProfileShapeDefault(newP);
        }
        const idx = state.customRevitProfiles.findIndex(p => p.designation === newP.designation && p.familyName === newP.familyName);
        if (idx !== -1) {
          // Merge custom parameters like vertices if they exist
          safeSet(state.customRevitProfiles, idx, { ...safeGet(state.customRevitProfiles, idx), ...newP });
        } else {
          state.customRevitProfiles.push(newP);
        }
      });

      localStorage.setItem('lgsf_custom_revit_profiles', JSON.stringify(state.customRevitProfiles));
      populateQuickSelectDropdowns();

      showToast(`Successfully loaded ${newProfiles.length} Revit profile(s) from '${file.name}'!`);
    } catch (err) {
      showToast("Error parsing Revit Family catalog: " + err.message);
    }
    getEl('uploadRevitFamily').value = '';
  };
  reader.readAsText(file);
}

// ─── Revit Profile Selector Modal ───────────────────────────────────────
let activeProfileCallback = null;
let activeProfileFilterType = 'any';

function showRevitProfileSelector(filterType, callback) {
  activeProfileCallback = callback;
  activeProfileFilterType = filterType;

  getEl('revitProfileSearch').value = '';
  getEl('revitProfileModal').classList.remove('hidden');

  renderRevitProfileList();
}

function renderRevitProfileList() {
  const container = getEl('revitProfileListContainer');
  const searchVal = getEl('revitProfileSearch').value.toLowerCase().trim();

  let profiles = state.customRevitProfiles || [];

  if (activeProfileFilterType === 'stud') {
    profiles = profiles.filter(p => p.type === 'stud');
  } else if (activeProfileFilterType === 'track') {
    profiles = profiles.filter(p => p.type === 'track');
  } else if (activeProfileFilterType === 'stud_or_track') {
    profiles = profiles.filter(p => p.type === 'stud' || p.type === 'track');
  }

  if (searchVal) {
    profiles = profiles.filter(p =>
      p.designation.toLowerCase().includes(searchVal) ||
      p.familyName.toLowerCase().includes(searchVal)
    );
  }

  // Populate family select dropdown dynamically with unique family names from state.customRevitProfiles
  const familySelect = getEl('deleteFamilySelect');
  if (familySelect) {
    const prevSelected = familySelect.value;
    familySelect.innerHTML = '<option value="">-- Remove Family --</option>';
    const uniqueFamilies = [...new Set((state.customRevitProfiles || []).map(p => p.familyName))].sort();
    uniqueFamilies.forEach(fam => {
      const opt = document.createElement('option');
      opt.value = fam;
      opt.textContent = fam;
      familySelect.appendChild(opt);
    });
    if (prevSelected && uniqueFamilies.includes(prevSelected)) {
      familySelect.value = prevSelected;
    }
  }

  // Reset multi-select button state on re-render
  const masterChk = getEl('chkSelectAllProfiles');
  if (masterChk) masterChk.checked = false;
  const btnDeleteSelected = getEl('btnDeleteSelectedProfiles');
  if (btnDeleteSelected) btnDeleteSelected.style.display = 'none';

  if (profiles.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
        ${(state.customRevitProfiles || []).length === 0
        ? 'No Revit profiles loaded. Please upload a Revit type catalog (.txt) first using the "Load Revit Family" button.'
        : 'No profiles match the search criteria.'}
      </div>
    `;
    return;
  }

  let html = `
    <table style="width: 100%; border-collapse: collapse; text-align: left;">
      <thead>
        <tr style="background: rgba(255,255,255,0.04); border-bottom: 1px solid var(--border-color);">
          <th style="padding: 10px 12px; width: 40px; text-align: center;">
            <input type="checkbox" id="chkSelectAllProfiles" onclick="toggleSelectAllProfiles(event)">
          </th>
          <th style="padding: 10px 12px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Designation</th>
          <th style="padding: 10px 12px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Family</th>
          <th style="padding: 10px 12px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase;">Shape (Override)</th>
          <th style="padding: 10px 12px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; text-align: right;">Depth</th>
          <th style="padding: 10px 12px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; text-align: right;">Flange</th>
          <th style="padding: 10px 12px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; text-align: right;">Lip</th>
          <th style="padding: 10px 12px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; text-align: right;">Thickness</th>
          <th style="padding: 10px 12px; font-size: 11px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; text-align: center; width: 60px;">Action</th>
        </tr>
      </thead>
      <tbody>
  `;

  profiles.forEach((p, idx) => {
    const originalIdx = state.customRevitProfiles.indexOf(p);
    const customLabel = (p.vertices && p.vertices.length > 0) ? ' <span class="badge" style="background: rgba(159, 122, 234, 0.15); color: #d6bcfa; font-size: 9px; padding: 1px 4px; border-radius: 3px; font-weight: 600; margin-left: 4px;">Custom Shape</span>' : '';
    html += `
      <tr class="revit-profile-row" style="border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background 0.15s;" onclick="selectRevitProfile(${idx})">
        <td style="padding: 10px 12px; text-align: center;" onclick="event.stopPropagation()">
          <input type="checkbox" class="chk-profile-select" data-original-idx="${originalIdx}" onclick="updateSelectedProfilesCount(event)">
        </td>
        <td style="padding: 10px 12px; font-weight: 600; color: var(--text-primary); font-family: var(--font-mono);">${p.designation}${customLabel}</td>
        <td style="padding: 10px 12px; color: var(--text-secondary); font-size: 11px;">${p.familyName}</td>
        <td style="padding: 10px 12px; color: var(--text-secondary);" onclick="event.stopPropagation()">
          <select style="background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); padding: 2px 4px; border-radius: 4px; font-size: 11px; outline: none;" onchange="changeProfileShape(event, ${originalIdx})">
            <option value="c_stud" ${p.shape_profile === 'c_stud' ? 'selected' : ''}>C-Stud</option>
            <option value="track" ${p.shape_profile === 'track' ? 'selected' : ''}>Track</option>
            <option value="ch_stud" ${p.shape_profile === 'ch_stud' ? 'selected' : ''}>CH-Stud</option>
            <option value="j_runner" ${p.shape_profile === 'j_runner' ? 'selected' : ''}>J-Runner</option>
            <option value="hat_channel" ${p.shape_profile === 'hat_channel' ? 'selected' : ''}>Hat Channel</option>
            <option value="z_girt" ${p.shape_profile === 'z_girt' ? 'selected' : ''}>Z-Girt</option>
            <option value="angle" ${p.shape_profile === 'angle' ? 'selected' : ''}>L-Angle</option>
          </select>
        </td>
        <td style="padding: 10px 12px; text-align: right; color: var(--text-primary); font-family: var(--font-mono);">${p.depth_mm.toFixed(2)}mm</td>
        <td style="padding: 10px 12px; text-align: right; color: var(--text-primary); font-family: var(--font-mono);">${p.flange_mm.toFixed(2)}mm</td>
        <td style="padding: 10px 12px; text-align: right; color: var(--text-primary); font-family: var(--font-mono);">${p.lip_mm > 0 ? p.lip_mm.toFixed(2) + 'mm' : '-'}</td>
        <td style="padding: 10px 12px; text-align: right; color: var(--text-primary); font-family: var(--font-mono);">${p.gauge_mm.toFixed(3)}mm</td>
        <td style="padding: 10px 12px; text-align: center;">
          <button type="button" class="btn-delete-profile" style="background: none; border: none; color: #f56565; cursor: pointer; padding: 4px; font-size: 14px; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; transition: background 0.15s, color 0.15s;" onclick="deleteRevitProfile(event, ${originalIdx})" title="Remove profile">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;

  if (!document.getElementById('revit-row-style')) {
    const style = document.createElement('style');
    style.id = 'revit-row-style';
    style.innerHTML = `
      .revit-profile-row:hover {
        background: rgba(255, 255, 255, 0.04) !important;
      }
      .btn-delete-profile:hover {
        background: rgba(245, 101, 101, 0.15) !important;
        color: #feb2b2 !important;
      }
    `;
    document.head.appendChild(style);
  }
}

window.changeProfileShape = function(event, idx) {
  const val = event.target.value;
  const p = safeGet(state.customRevitProfiles, idx);
  if (!p) return;
  p.shape_profile = val;
  p.type = (val === 'c_stud' || val === 'ch_stud' || val === 'hat_channel' || val === 'z_girt' || val === 'angle') ? 'stud' : 'track';
  localStorage.setItem('lgsf_custom_revit_profiles', JSON.stringify(state.customRevitProfiles));
  showToast(`Profile ${p.designation} shape updated to ${val.toUpperCase()}`);
  renderRevitProfileList();
  populateQuickSelectDropdowns();
  
  if (state.currentView === '3D') {
    render3DScene();
  } else if (state.currentView === 'Plan') {
    renderPlan();
  }
};

window.toggleSelectAllProfiles = function (event) {
  event.stopPropagation();
  const master = event.target.checked;
  const checkboxes = document.querySelectorAll('.chk-profile-select');
  checkboxes.forEach(cb => cb.checked = master);
  updateSelectedProfilesCount();
};

window.updateSelectedProfilesCount = function (event) {
  if (event) event.stopPropagation();
  const checkboxes = document.querySelectorAll('.chk-profile-select:checked');
  const count = checkboxes.length;
  const btn = getEl('btnDeleteSelectedProfiles');
  if (btn) {
    if (count > 0) {
      btn.style.display = 'inline-block';
      btn.textContent = `Delete Selected (${count})`;
    } else {
      btn.style.display = 'none';
    }
  }
};

window.deleteRevitProfile = async function (event, originalIdx) {
  event.stopPropagation();
  const p = safeGet(state.customRevitProfiles, originalIdx);
  if (p) {
    await performProfileDeletion([p]);
  }
};

window.deleteSelectedProfiles = async function () {
  const checkboxes = document.querySelectorAll('.chk-profile-select:checked');
  const profilesToDelete = [];
  checkboxes.forEach(cb => {
    const originalIdx = parseInt(cb.dataset.originalIdx);
    const p = safeGet(state.customRevitProfiles, originalIdx);
    if (p) profilesToDelete.push(p);
  });

  if (profilesToDelete.length === 0) return;
  await performProfileDeletion(profilesToDelete);
};

window.deleteWholeFamily = async function () {
  const select = getEl('deleteFamilySelect');
  const familyName = select ? select.value : '';
  if (!familyName) {
    showToast("Please select a Revit family name to delete from the dropdown first.");
    return;
  }

  const profilesToDelete = (state.customRevitProfiles || []).filter(p => p.familyName === familyName);
  if (profilesToDelete.length === 0) return;

  await performProfileDeletion(profilesToDelete);
};

async function performProfileDeletion(profilesToDelete) {
  if (!profilesToDelete || profilesToDelete.length === 0) return;

  // 1. Check references for ALL profiles being deleted
  let isReferenced = false;
  let referencingWalls = new Set();

  const checkOverrideForProfile = (ov, p) => {
    if (!ov) return false;
    return (
      (ov.stud_revit_family === p.familyName && ov.stud_revit_symbol === p.designation) ||
      (ov.track_revit_family === p.familyName && ov.track_revit_symbol === p.designation) ||
      (ov.end_stud_revit_family === p.familyName && ov.end_stud_revit_symbol === p.designation) ||
      (ov.king_stud_revit_family === p.familyName && ov.king_stud_revit_symbol === p.designation) ||
      (ov.top_track_revit_family === p.familyName && ov.top_track_revit_symbol === p.designation) ||
      (ov.bottom_track_revit_family === p.familyName && ov.bottom_track_revit_symbol === p.designation)
    );
  };

  const activeOverrides = collectOverrides();

  profilesToDelete.forEach(p => {
    if (checkOverrideForProfile(activeOverrides, p)) {
      isReferenced = true;
      const currentWallLabel = state.wallsData && safeGet(state.wallsData, state.currentWallIdx)
        ? (safeGet(state.wallsData, state.currentWallIdx).label || safeGet(state.wallsData, state.currentWallIdx).wall_id)
        : `Wall ${state.currentWallIdx}`;
      referencingWalls.add(`${currentWallLabel} (Currently Editing)`);
    }

    if (state.perWallOverrides) {
      for (const [wallIdx, ov] of Object.entries(state.perWallOverrides)) {
        const idxInt = parseInt(wallIdx);
        if (idxInt === state.currentWallIdx) continue;
        if (checkOverrideForProfile(ov, p)) {
          isReferenced = true;
          const wallLabel = state.wallsData && safeGet(state.wallsData, idxInt)
            ? (safeGet(state.wallsData, idxInt).label || safeGet(state.wallsData, idxInt).wall_id)
            : `Wall ${idxInt}`;
          referencingWalls.add(wallLabel);
        }
      }
    }
  });

  let confirmMsg = `Are you sure you want to remove the ${profilesToDelete.length} selected Revit profile(s)?`;
  if (profilesToDelete.length === 1) {
    confirmMsg = `Are you sure you want to remove the Revit profile '${profilesToDelete[0].designation}'?`;
  }

  if (isReferenced) {
    confirmMsg = `WARNING: One or more profiles being deleted are currently in use by the following wall(s):\n\n` +
      Array.from(referencingWalls).join('\n') +
      `\n\nIf you remove them, these walls will fall back to using standard SSMA/US default profiles. Do you want to proceed?`;
  }

  if (await showConfirm(confirmMsg)) {
    // 2. Clear references for each profile being deleted
    profilesToDelete.forEach(p => {
      if (checkOverrideForProfile(activeOverrides, p)) {
        // Clear main stud select if it was set to this profile
        const ss = getEl('ssma-stud');
        if (ss && ss.value === `revit:${p.designation}`) {
          ss.value = '';
          setFieldMm('cfg-stud-depth', 92.08);
          setFieldMm('cfg-stud-flange', 31.75);
          setFieldMm('cfg-stud-gauge', 0.843);
          if (getEl('cfg-stud-lip')) setFieldMm('cfg-stud-lip', 9.53);
        }

        // Clear main track select if it was set to this profile
        const ts = getEl('ssma-track');
        if (ts && ts.value === `revit:${p.designation}`) {
          ts.value = '';
          setFieldMm('cfg-track-depth', 92.08);
          setFieldMm('cfg-track-flange', 31.75);
          setFieldMm('cfg-track-gauge', 0.843);
        }

        // Clear helper lists for overrides
        const clearLabelIfMatch = (prefix) => {
          const lbl = getEl(`${prefix}-revit-label`);
          if (lbl && lbl.dataset.family === p.familyName && lbl.dataset.symbol === p.designation) {
            lbl.textContent = 'None Selected';
            lbl.dataset.family = '';
            lbl.dataset.symbol = '';
            updateRevitModeSelectOptionText(prefix, null);
            const modeSelect = getEl(`${prefix}-mode`) || getEl(`${prefix}-profile-mode`);
            if (modeSelect) {
              modeSelect.value = 'standard';
              const ev = document.createEvent('HTMLEvents');
              ev.initEvent('change', true, false);
              modeSelect.dispatchEvent(ev);
            }
          }
        };

        clearLabelIfMatch('cfg-end-stud');
        clearLabelIfMatch('cfg-king-stud');
        clearLabelIfMatch('cfg-top-track');
        clearLabelIfMatch('cfg-bottom-track');
      }

      // Clear stored overrides in state.perWallOverrides
      if (state.perWallOverrides) {
        for (const [wallIdx, ov] of Object.entries(state.perWallOverrides)) {
          if (checkOverrideForProfile(ov, p)) {
            if (ov.stud_revit_family === p.familyName && ov.stud_revit_symbol === p.designation) {
              ov.stud_revit_family = "";
              ov.stud_revit_symbol = "";
              ov.stud_depth = 92.08;
              ov.stud_flange = 31.75;
              ov.stud_gauge = 0.843;
              ov.stud_lip = 9.53;
            }
            if (ov.track_revit_family === p.familyName && ov.track_revit_symbol === p.designation) {
              ov.track_revit_family = "";
              ov.track_revit_symbol = "";
              ov.track_depth = 92.08;
              ov.track_flange = 31.75;
              ov.track_gauge = 0.843;
            }
            if (ov.end_stud_revit_family === p.familyName && ov.end_stud_revit_symbol === p.designation) {
              ov.end_stud_revit_family = "";
              ov.end_stud_revit_symbol = "";
              ov.end_stud_mode = "standard";
              ov.end_stud_depth_mm = 92.08;
              ov.end_stud_flange_mm = 31.75;
              ov.end_stud_gauge_mm = 0.843;
            }
            if (ov.king_stud_revit_family === p.familyName && ov.king_stud_revit_symbol === p.designation) {
              ov.king_stud_revit_family = "";
              ov.king_stud_revit_symbol = "";
              ov.king_stud_profile_mode = "standard";
              ov.king_stud_depth_mm = 92.08;
              ov.king_stud_flange_mm = 31.75;
              ov.king_stud_gauge_mm = 0.843;
            }
            if (ov.top_track_revit_family === p.familyName && ov.top_track_revit_symbol === p.designation) {
              ov.top_track_revit_family = "";
              ov.top_track_revit_symbol = "";
              ov.top_track_mode = "standard";
              ov.top_track_depth_mm = 92.08;
              ov.top_track_flange_mm = 31.75;
              ov.top_track_gauge_mm = 0.843;
            }
            if (ov.bottom_track_revit_family === p.familyName && ov.bottom_track_revit_symbol === p.designation) {
              ov.bottom_track_revit_family = "";
              ov.bottom_track_revit_symbol = "";
              ov.bottom_track_mode = "standard";
              ov.bottom_track_depth_mm = 92.08;
              ov.bottom_track_flange_mm = 31.75;
              ov.bottom_track_gauge_mm = 0.843;
            }
          }
        }
      }
    });

    // Update current panel values in state.perWallOverrides if active panel was cleaned
    const parentIdx = getParentWallIdx(safeGet(state.wallsData, state.currentWallIdx));
    if (safeGet(state.perWallOverrides, parentIdx)) {
      const cleanedActive = collectOverrides();
      safeSet(state.perWallOverrides, parentIdx, cleanedActive);
    }

    // 3. Delete from state.customRevitProfiles
    state.customRevitProfiles = state.customRevitProfiles.filter(p => !profilesToDelete.includes(p));
    localStorage.setItem('lgsf_custom_revit_profiles', JSON.stringify(state.customRevitProfiles));

    // Reset controls
    const masterChk = getEl('chkSelectAllProfiles');
    if (masterChk) masterChk.checked = false;
    updateSelectedProfilesCount();

    // Clear select dropdown selection
    const select = getEl('deleteFamilySelect');
    if (select) select.value = '';

    populateQuickSelectDropdowns();
    renderRevitProfileList();
    runFraming();
  }
}

window.selectRevitProfile = function (filteredIdx) {
  let profiles = state.customRevitProfiles || [];
  if (activeProfileFilterType === 'stud') {
    profiles = profiles.filter(p => p.type === 'stud');
  } else if (activeProfileFilterType === 'track') {
    profiles = profiles.filter(p => p.type === 'track');
  } else if (activeProfileFilterType === 'stud_or_track') {
    profiles = profiles.filter(p => p.type === 'stud' || p.type === 'track');
  }

  const searchVal = getEl('revitProfileSearch').value.toLowerCase().trim();
  if (searchVal) {
    profiles = profiles.filter(p =>
      p.designation.toLowerCase().includes(searchVal) ||
      p.familyName.toLowerCase().includes(searchVal)
    );
  }

  const selected = safeGet(profiles, filteredIdx);
  if (selected && activeProfileCallback) {
    activeProfileCallback(selected);
  }

  getEl('revitProfileModal').classList.add('hidden');
};

// ─── Revit JSON Upload ────────────────────────────────────────────────
// ─── Load Wall Data from Payload ───────────────────────────────────────
async function loadWallData(payload, uploadName) {
  const wallsArray = payload.walls || payload.Walls;
  if (!wallsArray || !Array.isArray(wallsArray)) {
    throw new Error("Invalid Revit JSON: Missing 'walls' or 'Walls' array.");
  }

  // Map: handle both snake_case (from C# JsonPropertyName) and PascalCase
  const mappedWalls = wallsArray.map(w => ({
    wall_id: w.wall_id || w.WallId,
    label: w.label || w.Label || w.wall_id || w.WallId,
    length: w.length || w.Length,
    height: w.height || w.Height,
    thickness: w.thickness || w.Thickness || 92.08,
    height_start: w.height_start !== undefined ? w.height_start : (w.HeightStart !== undefined ? w.HeightStart : null),
    height_end: w.height_end !== undefined ? w.height_end : (w.HeightEnd !== undefined ? w.HeightEnd : null),
    base_start: w.base_start !== undefined ? w.base_start : (w.BaseStart !== undefined ? w.BaseStart : null),
    base_end: w.base_end !== undefined ? w.base_end : (w.BaseEnd !== undefined ? w.BaseEnd : null),
    origin_x: w.origin_x || w.OriginX || 0,
    origin_y: w.origin_y || w.OriginY || 0,
    origin_z: w.origin_z || w.OriginZ || 0,
    direction_x: w.direction_x !== undefined ? w.direction_x : (w.DirectionX !== undefined ? w.DirectionX : 1),
    direction_y: w.direction_y !== undefined ? w.direction_y : (w.DirectionY !== undefined ? w.DirectionY : 0),
    revit_parameters: w.revit_parameters || w.RevitParameters || {},
    layers: (w.layers || w.Layers || []).map(l => ({
      function: l.function || l.Function || 'Other',
      function_name: l.function_name || l.FunctionName || '',
      material_name: l.material_name || l.MaterialName || '',
      thickness_mm: l.thickness_mm !== undefined ? l.thickness_mm : (l.ThicknessMm || 0),
      is_structural: l.is_structural !== undefined ? l.is_structural : (l.IsStructural || false),
    })),
    openings: (w.openings || w.Openings || []).map(o => ({
      type: (o.type || o.Type || 'window').toLowerCase(),
      x_offset: o.x_offset !== undefined ? o.x_offset : (o.XOffset !== undefined ? o.XOffset : 0.0),
      width: o.width !== undefined ? o.width : (o.Width !== undefined ? o.Width : 0.0),
      height: o.height !== undefined ? o.height : (o.Height !== undefined ? o.Height : 0.0),
      sill_height: o.sill_height !== undefined ? o.sill_height : (o.SillHeight !== undefined ? o.SillHeight : 0.0),
      label: o.label || o.Label || null
    }))
  }));

  state.wallsData = mappedWalls;
  state.originalWallsData = JSON.parse(JSON.stringify(mappedWalls));
  state.gridsData = payload.grids || payload.Grids || [];
  state.currentWallIdx = 0;
  state.selectedMember = null;
  state.selectedMembers = [];
  state.selectedWallIndices = [0];
  resetSectionBoxState();

  // Reset 3D camera so it re-frames to the new wall set
  camera3DFramed = false;
  hovered3DMember = null;
  hovered3DWallIdx = null;

  // Add to dropdown
  const wfs = getEl('wallFile');
  if (wfs && uploadName) {
    let exists = false;
    for (let i = 0; i < wfs.options.length; i++) {
      if (safeGet(wfs.options, i).value === uploadName) exists = true;
    }
    if (!exists) {
      const o = document.createElement('option');
      o.value = uploadName;
      o.textContent = `\u{1F4C1} ${uploadName}`;
      wfs.appendChild(o);
    }
    wfs.value = uploadName;
  }

  // Populate wallSelect
  const sel = getEl('wallSelect');
  if (sel) {
    sel.innerHTML = '';
    state.wallsData.forEach((w, i) => {
      const o = document.createElement('option');
      o.value = i;
      o.textContent = w.label || w.wall_id;
      sel.appendChild(o);
    });
  }

  if (typeof renderProjectBrowser === 'function') renderProjectBrowser();

  state.perWallOverrides = payload.perWallOverrides || {};
  state.wallConfigNames = payload.wallConfigNames || {};
  state.joinOverrides = payload.joinOverrides || {};
  if (state.hiddenElements) state.hiddenElements.clear();
  await restoreWallConfig(0);
  await runFraming(false);

  // Automatically switch to 3D view for Revit uploads
  if (state.currentView !== '3D') {
    switchView('3D');
  }

  if (typeof updateTopBarVersionSelector === 'function') {
    await updateTopBarVersionSelector();
  }
}

// ─── Revit JSON Upload ────────────────────────────────────────────────
function handleRevitUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const isWex = file.name.endsWith('.wex');
  const reader = new FileReader();
  reader.onload = async (event) => {
    if (typeof window.showLoading === 'function') {
      window.showLoading("Uploading and framing Revit model...");
    }
    try {
      let payload;
      if (isWex) {
        const base64Data = event.target.result.split(',')[1];
        const res = await api.post('/api/wex/parse', { data: base64Data });
        payload = res;
      } else {
        payload = JSON.parse(event.target.result);
      }

      if (!payload.walls && !payload.Walls) {
        showToast("Invalid file format. Missing 'walls' list.");
        return;
      }

      if (state.currentExchangeId) {
        // Active Exchange Option: Add as a new version!
        // Fetch versions and exchange option in parallel
        const [versions, opt] = await Promise.all([
          projectsDB.getVersions(state.currentExchangeId),
          projectsDB.getExchangeOption(state.currentExchangeId)
        ]);
        const nextVerNum = versions.length + 1;

        const newVerId = await projectsDB.addVersion({
          exchangeOptionId: state.currentExchangeId,
          name: `Version ${nextVerNum} - ${file.name}`,
          uploadedAt: new Date().toISOString(),
          uploadedBy: getCurrentUserName(),
          payload: payload
        });

        // Update active version
        if (opt) {
          opt.activeVersionId = newVerId;
          await projectsDB.updateExchangeOption(opt);
        }

        // Load into workspace
        await loadWallData(payload, opt.name);

        // Refresh sidebar and selector
        renderSettingsPanel();
        await updateTopBarVersionSelector();
        showToast("New version uploaded successfully!");
      } else {
        // Fallback: Normal standalone upload
        const uploadName = file.name.replace('.json', '').replace('.wex', '');
        await loadWallData(payload, uploadName);
        state.currentProjectId = null;
        state.currentExchangeId = null;
        state.activeExchangeName = null;
        state.activeProjectName = null;
        updateSidebarLayout();
        await updateTopBarVersionSelector();
      }
    } catch (err) {
      showToast("Error parsing file: " + err.message);
    } finally {
      if (typeof window.hideLoading === 'function') {
        window.hideLoading();
      }
      getEl('uploadRevitWalls').value = '';
    }
  };

  if (isWex) {
    reader.readAsDataURL(file);
  } else {
    reader.readAsText(file);
  }
}

// ─── Config Editor ────────────────────────────────────────────────
function populateConfigEditor(cfg) {
  getEl('cfg-stud-alignment').value = cfg.stud?.alignment ?? cfg.additional_settings?.stud_alignment ?? cfg.stud_alignment ?? 'structural';
  if (getEl('cfg-stud-rotation')) getEl('cfg-stud-rotation').value = String(cfg.stud?.rotation ?? cfg.additional_settings?.stud_rotation ?? cfg.stud_rotation ?? 90);
  setFieldMm('cfg-stud-spacing', cfg.stud?.default_spacing_mm ?? 609.6);
  setFieldMm('cfg-stud-depth', cfg.stud?.default_depth_mm ?? 92.08);
  setFieldMm('cfg-stud-flange', cfg.stud?.default_flange_mm ?? 31.75);
  setFieldMm('cfg-stud-lip', cfg.stud?.default_lip_mm ?? 9.525);
  setFieldMm('cfg-stud-gauge', cfg.stud?.default_gauge_mm ?? 0.893);
  setFieldMm('cfg-track-depth', cfg.track?.default_depth_mm ?? 92.08);
  setFieldMm('cfg-track-flange', cfg.track?.default_flange_mm ?? 31.75);
  setFieldMm('cfg-track-gauge', cfg.track?.default_gauge_mm ?? 0.893);
  getEl('cfg-king-studs').checked = cfg.opening_rules?.king_studs !== false;
  getEl('cfg-trimmer-studs').checked = cfg.opening_rules?.trimmer_studs !== false;
  getEl('cfg-cripple-studs').checked = cfg.opening_rules?.cripple_studs !== false;
  getEl('cfg-nogging').checked = cfg.nogging?.enabled !== false;
  getEl('cfg-king-mode').value = cfg.opening_rules?.king_stud_mode || 'full_height';

  const add = cfg.additional_settings || {};
  setFieldMm('cfg-stud-top-offset', add.stud_top_offset_mm ?? cfg.stud_top_offset_mm ?? 0);
  setFieldMm('cfg-stud-bottom-offset', add.stud_bottom_offset_mm ?? cfg.stud_bottom_offset_mm ?? 0);
  setFieldMm('cfg-top-track-offset', add.top_track_offset_mm ?? cfg.top_track_offset_mm ?? 0);
  setFieldMm('cfg-bottom-track-offset', add.bottom_track_offset_mm ?? cfg.bottom_track_offset_mm ?? 0);
  setFieldMm('cfg-opening-tolerance-left', add.opening_tolerance_left_mm ?? cfg.opening_tolerance_left_mm ?? 0);
  setFieldMm('cfg-opening-tolerance-right', add.opening_tolerance_right_mm ?? cfg.opening_tolerance_right_mm ?? 0);
  setFieldMm('cfg-opening-tolerance-top', add.opening_tolerance_top_mm ?? cfg.opening_tolerance_top_mm ?? 0);
  setFieldMm('cfg-opening-tolerance-bottom', add.opening_tolerance_bottom_mm ?? cfg.opening_tolerance_bottom_mm ?? 0);

  setFieldMm('cfg-control-join-max-length', add.control_join_max_length_mm ?? cfg.control_join_max_length_mm ?? cfg.control_join?.max_length_mm ?? 0);
  setFieldMm('cfg-control-join-gap', add.control_join_gap_mm ?? cfg.control_join_gap_mm ?? cfg.control_join?.gap_mm ?? 0);
  getEl('cfg-control-join-start-from').value = add.control_join_start_from ?? cfg.control_join_start_from ?? cfg.control_join?.start_from ?? 'start';

  const endStudMode = add.end_stud_mode ?? cfg.end_stud_mode ?? 'default';
  const endStudLbl = getEl('cfg-end-stud-revit-label');
  if (endStudLbl) {
    endStudLbl.dataset.family = add.end_stud_revit_family ?? cfg.end_stud_revit_family ?? '';
    endStudLbl.dataset.symbol = add.end_stud_revit_symbol ?? cfg.end_stud_revit_symbol ?? '';
  }
  getEl('cfg-end-stud-mode').value = endStudMode;
  getEl('cfg-end-stud-ssma').value = add.end_stud_ssma ?? cfg.end_stud_ssma ?? '';
  setFieldMm('cfg-end-stud-depth', add.end_stud_depth_mm ?? cfg.end_stud_depth_mm ?? 0);
  setFieldMm('cfg-end-stud-flange', add.end_stud_flange_mm ?? cfg.end_stud_flange_mm ?? 0);
  setFieldMm('cfg-end-stud-gauge', add.end_stud_gauge_mm ?? cfg.end_stud_gauge_mm ?? 0);
  updateOverrideFieldsVisibility('cfg-end-stud', endStudMode);

  const kingStudMode = add.king_stud_profile_mode ?? cfg.king_stud_profile_mode ?? 'default';
  const kingStudLbl = getEl('cfg-king-stud-revit-label');
  if (kingStudLbl) {
    kingStudLbl.dataset.family = add.king_stud_revit_family ?? cfg.king_stud_revit_family ?? '';
    kingStudLbl.dataset.symbol = add.king_stud_revit_symbol ?? cfg.king_stud_revit_symbol ?? '';
  }
  getEl('cfg-king-stud-profile-mode').value = kingStudMode;
  getEl('cfg-king-stud-ssma').value = add.king_stud_ssma ?? cfg.king_stud_ssma ?? '';
  setFieldMm('cfg-king-stud-depth', add.king_stud_depth_mm ?? cfg.king_stud_depth_mm ?? 0);
  setFieldMm('cfg-king-stud-flange', add.king_stud_flange_mm ?? cfg.king_stud_flange_mm ?? 0);
  setFieldMm('cfg-king-stud-gauge', add.king_stud_gauge_mm ?? cfg.king_stud_gauge_mm ?? 0);
  updateOverrideFieldsVisibility('cfg-king-stud', kingStudMode);

  const topTrackMode = add.top_track_mode ?? cfg.top_track_mode ?? 'default';
  const topTrackLbl = getEl('cfg-top-track-revit-label');
  if (topTrackLbl) {
    topTrackLbl.dataset.family = add.top_track_revit_family ?? cfg.top_track_revit_family ?? '';
    topTrackLbl.dataset.symbol = add.top_track_revit_symbol ?? cfg.top_track_revit_symbol ?? '';
  }
  getEl('cfg-top-track-mode').value = topTrackMode;
  getEl('cfg-top-track-ssma').value = add.top_track_ssma ?? cfg.top_track_ssma ?? '';
  setFieldMm('cfg-top-track-depth', add.top_track_depth_mm ?? cfg.top_track_depth_mm ?? 0);
  setFieldMm('cfg-top-track-flange', add.top_track_flange_mm ?? cfg.top_track_flange_mm ?? 0);
  setFieldMm('cfg-top-track-gauge', add.top_track_gauge_mm ?? cfg.top_track_gauge_mm ?? 0);
  updateOverrideFieldsVisibility('cfg-top-track', topTrackMode);

  const bottomTrackMode = add.bottom_track_mode ?? cfg.bottom_track_mode ?? 'default';
  const bottomTrackLbl = getEl('cfg-bottom-track-revit-label');
  if (bottomTrackLbl) {
    bottomTrackLbl.dataset.family = add.bottom_track_revit_family ?? cfg.bottom_track_revit_family ?? '';
    bottomTrackLbl.dataset.symbol = add.bottom_track_revit_symbol ?? cfg.bottom_track_revit_symbol ?? '';
  }
  getEl('cfg-bottom-track-mode').value = bottomTrackMode;
  getEl('cfg-bottom-track-ssma').value = add.bottom_track_ssma ?? cfg.bottom_track_ssma ?? '';
  setFieldMm('cfg-bottom-track-depth', add.bottom_track_depth_mm ?? cfg.bottom_track_depth_mm ?? 0);
  setFieldMm('cfg-bottom-track-flange', add.bottom_track_flange_mm ?? cfg.bottom_track_flange_mm ?? 0);
  setFieldMm('cfg-bottom-track-gauge', add.bottom_track_gauge_mm ?? cfg.bottom_track_gauge_mm ?? 0);
  updateOverrideFieldsVisibility('cfg-bottom-track', bottomTrackMode);

  updateSSMAFromFields('cfg-end-stud-ssma', 'cfg-end-stud-depth', 'cfg-end-stud-flange', 'cfg-end-stud-gauge');
  updateSSMAFromFields('cfg-king-stud-ssma', 'cfg-king-stud-depth', 'cfg-king-stud-flange', 'cfg-king-stud-gauge');
  updateSSMAFromFields('cfg-top-track-ssma', 'cfg-top-track-depth', 'cfg-top-track-flange', 'cfg-top-track-gauge');
  updateSSMAFromFields('cfg-bottom-track-ssma', 'cfg-bottom-track-depth', 'cfg-bottom-track-flange', 'cfg-bottom-track-gauge');

  // Sync main quick selects to Revit values if specified
  const ss = getEl('ssma-stud');
  if (ss) {
    const studSymbol = cfg.stud?.revit_symbol || cfg.stud_revit_symbol;
    if (studSymbol) {
      let o = ss.querySelector(`option[value="revit:${studSymbol}"]`);
      if (!o) {
        o = document.createElement('option');
        o.value = `revit:${studSymbol}`;
        o.textContent = `Revit: ${studSymbol}`;
        const optGroup = ss.querySelector('optgroup[label="Revit Family Profiles"]');
        if (optGroup) optGroup.appendChild(o);
        else ss.appendChild(o);
      }
      ss.value = `revit:${studSymbol}`;
    } else {
      updateSSMAFromFields('ssma-stud', 'cfg-stud-depth', 'cfg-stud-flange', 'cfg-stud-gauge');
    }
    makeSelectSearchable(ss);
  }

  const ts = getEl('ssma-track');
  if (ts) {
    const trackSymbol = cfg.track?.revit_symbol || cfg.track_revit_symbol;
    if (trackSymbol) {
      let o = ts.querySelector(`option[value="revit:${trackSymbol}"]`);
      if (!o) {
        o = document.createElement('option');
        o.value = `revit:${trackSymbol}`;
        o.textContent = `Revit: ${trackSymbol}`;
        const optGroup = ts.querySelector('optgroup[label="Revit Family Profiles"]');
        if (optGroup) optGroup.appendChild(o);
        else ts.appendChild(o);
      }
      ts.value = `revit:${trackSymbol}`;
    } else {
      updateSSMAFromFields('ssma-track', 'cfg-track-depth', 'cfg-track-flange', 'cfg-track-gauge');
    }
    makeSelectSearchable(ts);
  }

  const lJoinStyle = cfg.l_join_style || 'standard_l';
  if (getEl('cfg-l-join-style')) getEl('cfg-l-join-style').value = lJoinStyle;
  const tJoinStyle = cfg.t_join_style || 'T10';
  if (getEl('cfg-t-join-style')) getEl('cfg-t-join-style').value = tJoinStyle;

  populateRules(cfg);
}
function populateRules(cfg) {
  const hr = cfg.header_rules || [{ max_width_mm: 1219.2, header_type: 'single' }, { max_width_mm: 9999999, header_type: 'box' }];
  const kr = cfg.king_stud_rules || [{ max_width_mm: 1219.2, king_type: 'single' }, { max_width_mm: 9999999, king_type: 'single_box' }];

  const customHeaders = Object.keys(cfg.custom_headers || {});
  const customKings = Object.keys(cfg.custom_kings || {});
  const customLJoins = Object.keys(cfg.custom_l_joins || {});
  const customTJoins = Object.keys(cfg.custom_t_joins || {});

  // Populate L-Join style select dropdown
  const lSelect = getEl('cfg-l-join-style');
  if (lSelect) {
    const lVal = cfg.l_join_style || 'standard_l';
    lSelect.innerHTML = 
      '<option value="standard_l" ' + (lVal === 'standard_l' || lVal === 'L10' ? 'selected' : '') + '>L10 (Stop at Core Face)</option>' +
      '<option value="L11" ' + (lVal === 'L11' ? 'selected' : '') + '>L11 (Stop at Finish Face)</option>' +
      '<option value="L12" ' + (lVal === 'L12' ? 'selected' : '') + '>L12 (Core Face + Extra Stud)</option>' +
      '<option value="L13" ' + (lVal === 'L13' ? 'selected' : '') + '>L13 (Finish Face + Extra Stud)</option>' +
      '<option value="L14" ' + (lVal === 'L14' ? 'selected' : '') + '>L14 (Core Face + Back-to-Back Studs)</option>' +
      '<option value="L15" ' + (lVal === 'L15' ? 'selected' : '') + '>L15 (Rotated Backing Stud)</option>' +
      customLJoins.map(n => '<option value="' + escapeHtml(n) + '" ' + (lVal === n ? 'selected' : '') + '>' + escapeHtml(n) + ' (Custom)</option>').join('');
  }

  // Populate T-Join style select dropdown
  const tSelect = getEl('cfg-t-join-style');
  if (tSelect) {
    const tVal = cfg.t_join_style || 'T10';
    tSelect.innerHTML = 
      '<option value="T10" ' + (tVal === 'T10' || tVal === 'standard_t' ? 'selected' : '') + '>T10 (Standard)</option>' +
      '<option value="T11" ' + (tVal === 'T11' ? 'selected' : '') + '>T11 (Double Backing Studs)</option>' +
      '<option value="T12" ' + (tVal === 'T12' ? 'selected' : '') + '>T12 (Double Backing + Mirrored Stud)</option>' +
      customTJoins.map(n => '<option value="' + escapeHtml(n) + '" ' + (tVal === n ? 'selected' : '') + '>' + escapeHtml(n) + ' (Custom)</option>').join('');
  }

  getEl('headerRules').innerHTML = hr.map((r, i) => {
    const isLast = i === hr.length - 1;
    const widthLabel = isLast ? 'Above previous' : 'Up to';
    const cOpts = customHeaders.map(n => '<option value="' + escapeHtml(n) + '" ' + (r.header_type === n ? 'selected' : '') + '>' + escapeHtml(n) + ' (Custom)</option>').join('');
    return '<div class="rule-card">' +
      '<div class="rule-card-label">' + escapeHtml(widthLabel) + '</div>' +
      '<div class="rule-card-grid">' +
        '<input type="text" value="' + (isLast ? '∞' : escapeHtml(mmToDisplay(r.max_width_mm))) + '" data-mm="' + escapeHtml(r.max_width_mm) + '" class="hr-width" placeholder="Width" ' + (isLast ? 'disabled' : '') + '>' +
        '<select class="hr-type">' +
          '<option value="single" ' + (r.header_type === 'single' ? 'selected' : '') + '>Single Track</option>' +
          '<option value="box" ' + (r.header_type === 'box' ? 'selected' : '') + '>Box Header</option>' +
          '<option value="built_up" ' + (r.header_type === 'built_up' ? 'selected' : '') + '>Built-up</option>' +
          cOpts +
        '</select>' +
      '</div></div>';
  }).join('');

  getEl('kingRules').innerHTML = kr.map((r, i) => {
    const isLast = i === kr.length - 1;
    const widthLabel = isLast ? 'Above previous' : 'Up to';
    const cOpts = customKings.map(n => '<option value="' + escapeHtml(n) + '" ' + (r.king_type === n ? 'selected' : '') + '>' + escapeHtml(n) + ' (Custom)</option>').join('');
    return '<div class="rule-card">' +
      '<div class="rule-card-label">' + escapeHtml(widthLabel) + '</div>' +
      '<div class="rule-card-grid">' +
        '<input type="text" value="' + (isLast ? '∞' : escapeHtml(mmToDisplay(r.max_width_mm))) + '" data-mm="' + escapeHtml(r.max_width_mm) + '" class="kr-width" placeholder="Width" ' + (isLast ? 'disabled' : '') + '>' +
        '<select class="kr-type">' +
          '<option value="single" ' + (r.king_type === 'single' ? 'selected' : '') + '>Single</option>' +
          '<option value="single_box" ' + (r.king_type === 'single_box' ? 'selected' : '') + '>Single Box</option>' +
          '<option value="double" ' + (r.king_type === 'double' ? 'selected' : '') + '>Double</option>' +
          cOpts +
        '</select>' +
      '</div></div>';
  }).join('');

  getEl('headerRules').insertAdjacentHTML('beforeend', `<button class="btn btn-accent btn-block" style="margin-top:8px" onclick="openAssemblyBuilder('header')">+ Custom Header Assembly</button>`);
  getEl('kingRules').insertAdjacentHTML('beforeend', `<button class="btn btn-accent btn-block" style="margin-top:8px" onclick="openAssemblyBuilder('king')">+ Custom King Stud Assembly</button>`);

  renderAssemblyLibrary();
}

function renderAssemblyLibrary() {
  const hList = getEl('customHeadersLibraryList');
  const kList = getEl('customKingsLibraryList');
  const lList = getEl('customLJoinsLibraryList');
  const tList = getEl('customTJoinsLibraryList');
  if (!hList || !kList) return;
  hList.innerHTML = '';
  kList.innerHTML = '';
  if (lList) lList.innerHTML = '';
  if (tList) tList.innerHTML = '';

  const headers = state.configRaw?.custom_headers || {};
  const kings = state.configRaw?.custom_kings || {};
  const l_joins = state.configRaw?.custom_l_joins || {};
  const t_joins = state.configRaw?.custom_t_joins || {};

  const renderList = (listEl, dict, type) => {
    if (!listEl) return;
    const names = Object.keys(dict);
    if (names.length === 0) {
      listEl.innerHTML = '<div style="color:var(--text-muted); font-size:12px; text-align:center; padding: 12px 0;">No custom ' + escapeHtml(type) + ' saved.</div>';
      return;
    }
    names.forEach(name => {
      const data = safeGet(dict, name);
      const memCount = Array.isArray(data) ? data.length : (data?.members ? data.members.length : 0);
      const html = 
        '<div style="background: var(--bg-canvas); border: 1px solid var(--border-color); padding: 8px 12px; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">' +
          '<div>' +
            '<div style="font-weight: 600; font-size: 13px; color: var(--text-primary);">' + escapeHtml(name) + '</div>' +
            '<div style="font-size: 11px; color: var(--text-muted);">' + escapeHtml(memCount) + ' member(s)</div>' +
          '</div>' +
          '<div style="display: flex; gap: 4px;">' +
            '<button class="btn-icon" title="Edit" onclick="editAssembly(\'' + escapeHtml(name) + '\', \'' + escapeHtml(type) + '\')" style="background: rgba(255,255,255,0.05); padding: 4px; border-radius: 4px;">✎</button>' +
            '<button class="btn-icon" title="Duplicate" onclick="duplicateAssembly(\'' + escapeHtml(name) + '\', \'' + escapeHtml(type) + '\')" style="background: rgba(255,255,255,0.05); padding: 4px; border-radius: 4px;">⧉</button>' +
            '<button class="btn-icon" title="Delete" onclick="deleteAssembly(\'' + escapeHtml(name) + '\', \'' + escapeHtml(type) + '\')" style="background: rgba(255,100,100,0.1); color: #fc8181; padding: 4px; border-radius: 4px;">✕</button>' +
          '</div>' +
        '</div>';
      listEl.insertAdjacentHTML('beforeend', html);
    });
  };

  renderList(hList, headers, 'header');
  renderList(kList, kings, 'king');
  renderList(lList, l_joins, 'l_join');
  renderList(tList, t_joins, 't_join');
}

window.editAssembly = function (name, type) {
  let dict;
  if (type === 'header') dict = state.configRaw?.custom_headers;
  else if (type === 'king') dict = state.configRaw?.custom_kings;
  else if (type === 'l_join') dict = state.configRaw?.custom_l_joins;
  else if (type === 't_join') dict = state.configRaw?.custom_t_joins;
  const data = safeGet(dict, name);
  if (!data) return;
  openAssemblyBuilder(type);
  getEl('assemblyName').value = name;
  const members = Array.isArray(data) ? data : (data.members || []);
  currentAssemblyMembers = JSON.parse(JSON.stringify(members)); // Deep copy
  if (type === 'l_join' || type === 't_join') {
    currentAssemblyMembers.forEach(m => initializeMemberAlignments(m, m.wall));
  }
  renderAssemblyMembers();
};

window.duplicateAssembly = function (name, type) {
  let dictKey;
  if (type === 'header') dictKey = 'custom_headers';
  else if (type === 'king') dictKey = 'custom_kings';
  else if (type === 'l_join') dictKey = 'custom_l_joins';
  else if (type === 't_join') dictKey = 'custom_t_joins';
  const members = safeGet(safeGet(state.configRaw, dictKey), name);
  if (!members) return;
  let newName = name + "_Copy";
  let counter = 1;
  while (safeGet(safeGet(state.configRaw, dictKey), newName)) {
    counter++;
    newName = name + "_Copy" + counter;
  }
  safeSet(safeGet(state.configRaw, dictKey), newName, JSON.parse(JSON.stringify(members)));
  populateRules(state.configRaw);
  if (type !== 'l_join' && type !== 't_join') {
    markWallCustom();
  }
};

window.deleteAssembly = async function (name, type) {
  let dictKey;
  if (type === 'header') dictKey = 'custom_headers';
  else if (type === 'king') dictKey = 'custom_kings';
  else if (type === 'l_join') dictKey = 'custom_l_joins';
  else if (type === 't_join') dictKey = 'custom_t_joins';
  if (await showConfirm(`Are you sure you want to delete '${name}'?`)) {
    Reflect.deleteProperty(safeGet(state.configRaw, dictKey), name);
    try {
      const targetCid = state.currentProjectCompanyId || window.currentCompanyId;
      await projectsDB.deleteCustomAssembly(type, name, targetCid);
    } catch (err) {
      console.warn("Failed to delete custom assembly from Firestore:", err);
    }
    populateRules(state.configRaw);
    if (type !== 'l_join' && type !== 't_join') {
      markWallCustom();
    }
  }
};

/** Collect all config overrides — reads dataset.mm which is kept in sync */
function collectOverrides() {
  // Read header rules from rule cards
  const headerRules = [];
  document.querySelectorAll('#headerRules .rule-card').forEach(card => {
    const widthInput = card.querySelector('.hr-width');
    const typeSelect = card.querySelector('.hr-type');
    const mm = widthInput.disabled ? 9999999 : (parseFloat(widthInput.dataset.mm) || displayToMm(widthInput.value));
    headerRules.push({ max_width_mm: mm, header_type: typeSelect.value });
  });

  // Read king rules from rule cards
  const kingRules = [];
  document.querySelectorAll('#kingRules .rule-card').forEach(card => {
    const widthInput = card.querySelector('.kr-width');
    const typeSelect = card.querySelector('.kr-type');
    const mm = widthInput.disabled ? 9999999 : (parseFloat(widthInput.dataset.mm) || displayToMm(widthInput.value));
    kingRules.push({ max_width_mm: mm, king_type: typeSelect.value });
  });

  const ov = {
    stud_alignment: getEl('cfg-stud-alignment').value,
    stud_rotation: parseFloat(getEl('cfg-stud-rotation')?.value ?? '90') ?? 90,
    stud_spacing: parseFloat(getEl('cfg-stud-spacing').dataset.mm) || 609.6,
    stud_depth: parseFloat(getEl('cfg-stud-depth').dataset.mm) || 92.08,
    stud_flange: parseFloat(getEl('cfg-stud-flange').dataset.mm) || 31.75,
    stud_lip: parseFloat(getEl('cfg-stud-lip').dataset.mm) || 9.525,
    stud_gauge: parseFloat(getEl('cfg-stud-gauge').dataset.mm) || 0.893,
    track_depth: parseFloat(getEl('cfg-track-depth').dataset.mm) || 92.08,
    track_flange: parseFloat(getEl('cfg-track-flange').dataset.mm) || 31.75,
    track_gauge: parseFloat(getEl('cfg-track-gauge').dataset.mm) || 0.893,
    use_king_studs: getEl('cfg-king-studs').checked,
    use_trimmer_studs: getEl('cfg-trimmer-studs').checked,
    use_cripple_studs: getEl('cfg-cripple-studs').checked,
    use_nogging: getEl('cfg-nogging').checked,
    king_stud_mode: getEl('cfg-king-mode').value,

    // Additional Settings
    stud_top_offset_mm: parseFloat(getEl('cfg-stud-top-offset').dataset.mm) || 0,
    stud_bottom_offset_mm: parseFloat(getEl('cfg-stud-bottom-offset').dataset.mm) || 0,
    top_track_offset_mm: parseFloat(getEl('cfg-top-track-offset').dataset.mm) || 0,
    bottom_track_offset_mm: parseFloat(getEl('cfg-bottom-track-offset').dataset.mm) || 0,
    opening_tolerance_left_mm: parseFloat(getEl('cfg-opening-tolerance-left').dataset.mm) || 0,
    opening_tolerance_right_mm: parseFloat(getEl('cfg-opening-tolerance-right').dataset.mm) || 0,
    opening_tolerance_top_mm: parseFloat(getEl('cfg-opening-tolerance-top').dataset.mm) || 0,
    opening_tolerance_bottom_mm: parseFloat(getEl('cfg-opening-tolerance-bottom').dataset.mm) || 0,

    control_join_max_length_mm: parseFloat(getEl('cfg-control-join-max-length').dataset.mm) || 0,
    control_join_gap_mm: parseFloat(getEl('cfg-control-join-gap').dataset.mm) || 0,
    control_join_start_from: getEl('cfg-control-join-start-from').value,

    end_stud_mode: getEl('cfg-end-stud-mode').value,
    end_stud_ssma: getEl('cfg-end-stud-ssma').value,
    end_stud_depth_mm: parseFloat(getEl('cfg-end-stud-depth').dataset.mm) || 0,
    end_stud_flange_mm: parseFloat(getEl('cfg-end-stud-flange').dataset.mm) || 0,
    end_stud_gauge_mm: parseFloat(getEl('cfg-end-stud-gauge').dataset.mm) || 0,

    king_stud_profile_mode: getEl('cfg-king-stud-profile-mode').value,
    king_stud_ssma: getEl('cfg-king-stud-ssma').value,
    king_stud_depth_mm: parseFloat(getEl('cfg-king-stud-depth').dataset.mm) || 0,
    king_stud_flange_mm: parseFloat(getEl('cfg-king-stud-flange').dataset.mm) || 0,
    king_stud_gauge_mm: parseFloat(getEl('cfg-king-stud-gauge').dataset.mm) || 0,

    top_track_mode: getEl('cfg-top-track-mode').value,
    top_track_ssma: getEl('cfg-top-track-ssma').value,
    top_track_depth_mm: parseFloat(getEl('cfg-top-track-depth').dataset.mm) || 0,
    top_track_flange_mm: parseFloat(getEl('cfg-top-track-flange').dataset.mm) || 0,
    top_track_gauge_mm: parseFloat(getEl('cfg-top-track-gauge').dataset.mm) || 0,

    bottom_track_mode: getEl('cfg-bottom-track-mode').value,
    bottom_track_ssma: getEl('cfg-bottom-track-ssma').value,
    bottom_track_depth_mm: parseFloat(getEl('cfg-bottom-track-depth').dataset.mm) || 0,
    bottom_track_flange_mm: parseFloat(getEl('cfg-bottom-track-flange').dataset.mm) || 0,
    bottom_track_gauge_mm: parseFloat(getEl('cfg-bottom-track-gauge').dataset.mm) || 0,
  };

  const ssVal = getEl('ssma-stud')?.value || '';
  if (ssVal.startsWith('revit:')) {
    const des = ssVal.substring(6);
    const p = state.customRevitProfiles.find(x => x.designation === des && x.type === 'stud');
    if (p) {
      ov.stud_revit_family = p.familyName;
      ov.stud_revit_symbol = p.designation;
    }
  } else {
    ov.stud_revit_family = "";
    ov.stud_revit_symbol = "";
  }

  const tsVal = getEl('ssma-track')?.value || '';
  if (tsVal.startsWith('revit:')) {
    const des = tsVal.substring(6);
    const p = state.customRevitProfiles.find(x => x.designation === des && x.type === 'track');
    if (p) {
      ov.track_revit_family = p.familyName;
      ov.track_revit_symbol = p.designation;
    }
  } else {
    ov.track_revit_family = "";
    ov.track_revit_symbol = "";
  }

  const getRevitOverrideInfo = (prefix, mode) => {
    if (mode !== 'revit') return { family: "", symbol: "" };
    const lbl = getEl(`${prefix}-revit-label`);
    if (lbl && lbl.dataset.family && lbl.dataset.symbol) {
      return { family: lbl.dataset.family, symbol: lbl.dataset.symbol };
    }
    return { family: "", symbol: "" };
  };

  const endStudRevit = getRevitOverrideInfo('cfg-end-stud', ov.end_stud_mode);
  ov.end_stud_revit_family = endStudRevit.family;
  ov.end_stud_revit_symbol = endStudRevit.symbol;

  const kingStudRevit = getRevitOverrideInfo('cfg-king-stud', ov.king_stud_profile_mode);
  ov.king_stud_revit_family = kingStudRevit.family;
  ov.king_stud_revit_symbol = kingStudRevit.symbol;

  const topTrackRevit = getRevitOverrideInfo('cfg-top-track', ov.top_track_mode);
  ov.top_track_revit_family = topTrackRevit.family;
  ov.top_track_revit_symbol = topTrackRevit.symbol;

  const bottomTrackRevit = getRevitOverrideInfo('cfg-bottom-track', ov.bottom_track_mode);
  ov.bottom_track_revit_family = bottomTrackRevit.family;
  ov.bottom_track_revit_symbol = bottomTrackRevit.symbol;

  if (headerRules.length > 0) ov.header_rules = headerRules;
  if (kingRules.length > 0) ov.king_stud_rules = kingRules;

  if (state.configRaw) {
    if (state.configRaw.custom_headers) ov.custom_headers = state.configRaw.custom_headers;
    if (state.configRaw.custom_kings) ov.custom_kings = state.configRaw.custom_kings;
    if (state.configRaw.custom_l_joins) ov.custom_l_joins = state.configRaw.custom_l_joins;
    if (state.configRaw.custom_t_joins) ov.custom_t_joins = state.configRaw.custom_t_joins;
  }

  if (getEl('cfg-l-join-style')) ov.l_join_style = getEl('cfg-l-join-style').value;
  if (getEl('cfg-t-join-style')) ov.t_join_style = getEl('cfg-t-join-style').value;

  return ov;
}
function getFullConfig() {
  const ov = collectOverrides();
  return {
    region: state.configRaw?.region || "US",
    units: "imperial", // internal standard
    stud: {
      default_spacing_mm: ov.stud_spacing,
      default_depth_mm: ov.stud_depth,
      default_flange_mm: ov.stud_flange,
      default_lip_mm: ov.stud_lip,
      default_gauge_mm: ov.stud_gauge
    },
    track: {
      default_depth_mm: ov.track_depth,
      default_flange_mm: ov.track_flange,
      default_gauge_mm: ov.track_gauge
    },
    opening_rules: {
      king_studs: ov.use_king_studs,
      trimmer_studs: ov.use_trimmer_studs,
      cripple_studs: ov.use_cripple_studs,
      king_stud_mode: ov.king_stud_mode
    },
    nogging: {
      enabled: ov.use_nogging
    },
    header_rules: ov.header_rules || state.configRaw?.header_rules,
    king_stud_rules: ov.king_stud_rules || state.configRaw?.king_stud_rules,
    custom_headers: ov.custom_headers || state.configRaw?.custom_headers,
    custom_kings: ov.custom_kings || state.configRaw?.custom_kings,
    custom_l_joins: ov.custom_l_joins || state.configRaw?.custom_l_joins,
    custom_t_joins: ov.custom_t_joins || state.configRaw?.custom_t_joins,
    l_join_style: ov.l_join_style || state.configRaw?.l_join_style || "standard_l",
    t_join_style: ov.t_join_style || state.configRaw?.t_join_style || "T10",
    gaps: state.configRaw?.gaps || {},
    control_join: {
      max_length_mm: ov.control_join_max_length_mm,
      gap_mm: ov.control_join_gap_mm,
      start_from: ov.control_join_start_from
    },
    additional_settings: {
      stud_top_offset_mm: ov.stud_top_offset_mm,
      stud_bottom_offset_mm: ov.stud_bottom_offset_mm,
      top_track_offset_mm: ov.top_track_offset_mm,
      bottom_track_offset_mm: ov.bottom_track_offset_mm,
      opening_tolerance_left_mm: ov.opening_tolerance_left_mm,
      opening_tolerance_right_mm: ov.opening_tolerance_right_mm,
      opening_tolerance_top_mm: ov.opening_tolerance_top_mm,
      opening_tolerance_bottom_mm: ov.opening_tolerance_bottom_mm,

      control_join_max_length_mm: ov.control_join_max_length_mm,
      control_join_gap_mm: ov.control_join_gap_mm,
      control_join_start_from: ov.control_join_start_from,

      stud_lip: ov.stud_lip,

      stud_revit_family: ov.stud_revit_family,
      stud_revit_symbol: ov.stud_revit_symbol,
      track_revit_family: ov.track_revit_family,
      track_revit_symbol: ov.track_revit_symbol,

      end_stud_mode: ov.end_stud_mode,
      end_stud_ssma: ov.end_stud_ssma,
      end_stud_depth_mm: ov.end_stud_depth_mm,
      end_stud_flange_mm: ov.end_stud_flange_mm,
      end_stud_gauge_mm: ov.end_stud_gauge_mm,
      end_stud_revit_family: ov.end_stud_revit_family,
      end_stud_revit_symbol: ov.end_stud_revit_symbol,

      king_stud_profile_mode: ov.king_stud_profile_mode,
      king_stud_ssma: ov.king_stud_ssma,
      king_stud_depth_mm: ov.king_stud_depth_mm,
      king_stud_flange_mm: ov.king_stud_flange_mm,
      king_stud_gauge_mm: ov.king_stud_gauge_mm,
      king_stud_revit_family: ov.king_stud_revit_family,
      king_stud_revit_symbol: ov.king_stud_revit_symbol,

      top_track_mode: ov.top_track_mode,
      top_track_ssma: ov.top_track_ssma,
      top_track_depth_mm: ov.top_track_depth_mm,
      top_track_flange_mm: ov.top_track_flange_mm,
      top_track_gauge_mm: ov.top_track_gauge_mm,
      top_track_revit_family: ov.top_track_revit_family,
      top_track_revit_symbol: ov.top_track_revit_symbol,

      bottom_track_mode: ov.bottom_track_mode,
      bottom_track_ssma: ov.bottom_track_ssma,
      bottom_track_depth_mm: ov.bottom_track_depth_mm,
      bottom_track_flange_mm: ov.bottom_track_flange_mm,
      bottom_track_gauge_mm: ov.bottom_track_gauge_mm,
      bottom_track_revit_family: ov.bottom_track_revit_family,
      bottom_track_revit_symbol: ov.bottom_track_revit_symbol,
    }
  };
}

// ─── UI Updates ───────────────────────────────────────────────────
function updateMemberSummary() {
  const wall = getCurrentWall(), el = getEl('memberSummary');
  if (!wall) { el.innerHTML = '<p class="muted">No data</p>'; getEl('memberCount').textContent = '0'; return; }
  const c = {}; wall.members.forEach(m => { safeSet(c, m.type, (safeGet(c, m.type) || 0) + 1); });
  getEl('memberCount').textContent = wall.members.length;
  el.innerHTML = MEMBER_DRAW_ORDER.filter(t => safeGet(c, t)).map(t =>
    `<div class="member-row"><span class="dot" style="background:` + safeGet(MEMBER_COLORS, t) + `"></span><span class="name">` + safeGet(MEMBER_LABELS, t) + `</span><span class="count">` + safeGet(c, t) + `</span></div>`
  ).join('');
}

function updateWallInfo() {
  const wall = getCurrentWall(), el = getEl('wallInfo');
  if (!wall) { el.innerHTML = '<p class="muted">Select a wall</p>'; return; }

  // Get input data for this wall (has origin, direction, etc.)
  const input = safeGet(state.wallsData, state.currentWallIdx);

  const configLabel = getWallConfigName(input);
  const configColor = configLabel === 'Custom *' ? '#ecc94b' : 'var(--accent)';

  let html = '';
  const hasErrors = wall.validation_errors && wall.validation_errors.length > 0;
  if (hasErrors) {
    html += `
      <div class="warning-box">
        <h4>⚠️ Warning: Framing Failed</h4>
        <ul>
          wall.validation_errors.map(err => '<li>' + escapeHtml(err) + '</li>').join('')
        </ul>
      </div>
    `;
  }

  html += 
    '<div class="wall-stat"><span class="label">Wall ID</span><span class="value" style="font-size:11px;word-break:break-all">' + escapeHtml(wall.wall_id || input?.wall_id || '—') + '</span></div>' +
    '<div class="wall-stat"><span class="label">Config</span><span class="value" id="wallConfigIndicator" style="font-size:11px;font-weight:600;color:' + escapeHtml(configColor) + '">' + escapeHtml(configLabel) + '</span></div>' +
    '<div class="wall-stat"><span class="label">Length</span><span class="value">' + escapeHtml(mmToDisplay(wall.length_mm)) + '</span></div>' +
    '<div class="wall-stat"><span class="label">Height</span><span class="value">' + escapeHtml(mmToDisplay(wall.height_mm)) + '</span></div>' +
    '<div class="wall-stat"><span class="label">Thickness</span><span class="value">' + escapeHtml(mmToDisplay(wall.thickness_mm || input?.thickness || 0)) + '</span></div>' +
    '<div class="wall-stat"><span class="label">Members</span><span class="value">' + wall.members.length + '</span></div>' +
    '<div class="wall-stat"><span class="label">Openings</span><span class="value">' + (wall.openings?.length || 0) + '</span></div>';

  // Revit coordinates (if available)
  if (input && (input.origin_x || input.origin_y || input.origin_z)) {
    html += 
    '<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border-color);">' +
      '<div class="wall-stat"><span class="label" style="color:var(--accent)">Origin X</span><span class="value">' + escapeHtml(mmToDisplay(input.origin_x || 0)) + '</span></div>' +
      '<div class="wall-stat"><span class="label" style="color:var(--accent)">Origin Y</span><span class="value">' + escapeHtml(mmToDisplay(input.origin_y || 0)) + '</span></div>' +
      '<div class="wall-stat"><span class="label" style="color:var(--accent)">Origin Z</span><span class="value">' + escapeHtml(mmToDisplay(input.origin_z || 0)) + '</span></div>' +
      '<div class="wall-stat"><span class="label" style="color:var(--accent)">Direction</span><span class="value">(' + (input.direction_x || 0).toFixed(2) + ', ' + (input.direction_y || 0).toFixed(2) + ')</span></div>' +
    '</div>';
  }

  // Opening details
  if (wall.openings && wall.openings.length > 0) {
    html += `<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border-color);">`;
    wall.openings.forEach((op, i) => {
      const typeIcon = (op.type === 'door') ? '🚪' : '🪟';
      html +=
      '<div style="margin-bottom:6px;">' +
        '<div class="wall-stat"><span class="label">' + escapeHtml(typeIcon) + ' ' + escapeHtml(op.label || (op.type === 'door' ? 'Door' : 'Window') + ' ' + (i + 1)) + '</span><span class="value" style="color:var(--text-secondary)">' + escapeHtml(op.type) + '</span></div>' +
        '<div class="wall-stat"><span class="label" style="padding-left:16px;font-size:11px">Size</span><span class="value" style="font-size:11px">' + escapeHtml(mmToDisplay(op.width)) + ' × ' + escapeHtml(mmToDisplay(op.height)) + '</span></div>' +
        '<div class="wall-stat"><span class="label" style="padding-left:16px;font-size:11px">Offset</span><span class="value" style="font-size:11px">' + escapeHtml(mmToDisplay(op.x_offset || op.x_start || 0)) + '</span></div>' +
        (op.sill_height > 0 ? '<div class="wall-stat"><span class="label" style="padding-left:16px;font-size:11px">Sill</span><span class="value" style="font-size:11px">' + escapeHtml(mmToDisplay(op.sill_height)) + '</span></div>' : '') +
      '</div>';
    });
    html += '</div>';
  }

  el.innerHTML = html;
}

function updateZoomLabel() { getEl('statusZoom').textContent = Math.round(state.zoom * 100) + '%'; }
function getCurrentWall() { return safeGet(state.framingResult, state.currentWallIdx) || null; }

// ─── Canvas ───────────────────────────────────────────────────────
function resizeCanvas() {
  const r = canvas.parentElement.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  canvas.width = r.width * d; canvas.height = r.height * d;
  canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
  ctx.setTransform(d, 0, 0, d, 0, 0);
}
function fitView() {
  const w = getCurrentWall(); if (!w) return;
  const cw = canvas.clientWidth, ch = canvas.clientHeight, p = 80;
  state.zoom = Math.min((cw - p * 2) / w.length_mm, (ch - p * 2) / w.height_mm);
  state.panX = (cw - w.length_mm * state.zoom) / 2;
  state.panY = (ch - w.height_mm * state.zoom) / 2;
  updateZoomLabel();
}
function w2s(x, y) { const w = getCurrentWall(); return w ? [state.panX + x * state.zoom, state.panY + (w.height_mm - y) * state.zoom] : [0, 0]; }
function s2w(sx, sy) { const w = getCurrentWall(); return w ? [(sx - state.panX) / state.zoom, w.height_mm - (sy - state.panY) / state.zoom] : [0, 0]; }

function render() {
  const cw = canvas.clientWidth, ch = canvas.clientHeight;
  ctx.clearRect(0, 0, cw, ch);
  const wall = getCurrentWall();
  if (!wall) { ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted'); ctx.font = '14px Inter'; ctx.textAlign = 'center'; ctx.fillText('Select a wall to visualize', cw / 2, ch / 2); return; }

  const [bx0, by0] = w2s(0, wall.height_mm), [bx1, by1] = w2s(wall.length_mm, 0);
  const cs = getComputedStyle(document.documentElement);

  const hasErrors = wall.validation_errors && wall.validation_errors.length > 0;
  if (hasErrors) {
    ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
    ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);

    // Draw warnings in center
    ctx.fillStyle = '#f87171';
    ctx.font = 'bold 15px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('⚠️ WALL CANNOT BE FRAMED', bx0 + (bx1 - bx0) / 2, by0 + (by1 - by0) / 2 - 10);

    ctx.fillStyle = cs.getPropertyValue('--text-secondary') || '#94a3b8';
    ctx.font = '12px Inter';
    ctx.fillText(wall.validation_errors[0], bx0 + (bx1 - bx0) / 2, by0 + (by1 - by0) / 2 + 15);
  } else {
    if (getActiveVisibilitySettings().showWallVolume) {
      ctx.fillStyle = cs.getPropertyValue('--canvas-wall-bg'); ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    }
    ctx.strokeStyle = cs.getPropertyValue('--border-color'); ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0); ctx.setLineDash([]);
  }

  if (wall.openings) wall.openings.forEach(op => {
    if (state.hiddenElements && state.hiddenElements.has(op)) return;
    const xo = op.x_offset || op.x_start;
    const [ox0, oy0] = w2s(xo, op.sill_height + op.height), [ox1, oy1] = w2s(xo + op.width, op.sill_height);

    const isSelected = state.selectedOpening && (state.selectedOpening.label === op.label);
    const isHovered = state.hoveredOpening && (state.hoveredOpening.label === op.label);

    const accent = (cs.getPropertyValue('--accent') || '#007fff').trim();
    if (isSelected) {
      ctx.fillStyle = hexA(accent, 0.2);
      ctx.fillRect(ox0, oy0, ox1 - ox0, oy1 - oy0);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      ctx.strokeRect(ox0, oy0, ox1 - ox0, oy1 - oy0);
    } else if (isHovered) {
      ctx.fillStyle = hexA(accent, 0.12);
      ctx.fillRect(ox0, oy0, ox1 - ox0, oy1 - oy0);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(ox0, oy0, ox1 - ox0, oy1 - oy0);
      ctx.setLineDash([]);
    } else {
      ctx.fillStyle = hexA(accent, 0.05);
      ctx.fillRect(ox0, oy0, ox1 - ox0, oy1 - oy0);
      ctx.strokeStyle = hexA(accent, 0.35);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(ox0, oy0, ox1 - ox0, oy1 - oy0);
      ctx.setLineDash([]);
    }

    const ls = Math.max(9, Math.min(14, state.zoom * 60));
    ctx.fillStyle = isSelected ? accent : hexA(accent, 0.6);
    ctx.font = isSelected ? `bold ${ls}px Inter` : `600 ${ls}px Inter`;
    ctx.textAlign = 'center';
    ctx.fillText(op.label || '', ox0 + (ox1 - ox0) / 2, oy0 + (oy1 - oy0) / 2 + ls / 3);
  });

  // Draw grids
  const showGrids = getActiveVisibilitySettings().showGrids;
  if (showGrids && state.gridsData && state.gridsData.length > 0) {
    const wInput = safeGet(state.wallsData, state.currentWallIdx);
    if (wInput) {
      ctx.save();
      ctx.strokeStyle = '#4299e1'; // Blueish grid line color
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.fillStyle = '#4299e1';
      ctx.font = 'bold 10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const p1 = { x: wInput.origin_x || 0, y: wInput.origin_y || 0 };
      const wl = wall.length_mm || wInput.length || 0;
      const dx = wInput.direction_x !== undefined ? wInput.direction_x : 1;
      const dy = wInput.direction_y !== undefined ? wInput.direction_y : 0;
      const p2 = { x: p1.x + wl * dx, y: p1.y + wl * dy };

      state.gridsData.forEach(grid => {
        const p3 = { x: grid.start_x, y: grid.start_y };
        const p4 = { x: grid.end_x, y: grid.end_y };

        // Filter: only show grids crossing perpendicular to the wall.
        const gdx = p4.x - p3.x;
        const gdy = p4.y - p3.y;
        const glen = Math.hypot(gdx, gdy);
        if (glen > 0) {
          const ndx = gdx / glen;
          const ndy = gdy / glen;
          const dot = Math.abs(dx * ndx + dy * ndy);
          if (dot > 0.1) { // Limit strictly to perpendicular grids (allow minor tolerance)
            return;
          }
        }

        const ip = getLineIntersection(p1, p2, p3, p4);
        if (ip) {
          // Project intersection point to find local X-coordinate along the wall length
          const localX = (ip.x - p1.x) * dx + (ip.y - p1.y) * dy;

          if (localX >= 0 && localX <= wl) {
            const [sx, syWallTop] = w2s(localX, wall.height_mm);
            const [, syWallBottom] = w2s(localX, 0);

            const syTop = syWallTop - 25;
            const syBottom = syWallBottom + 15;

            // Draw vertical grid line
            ctx.beginPath();
            ctx.moveTo(sx, syTop);
            ctx.lineTo(sx, syBottom);
            ctx.stroke();

            // Draw grid bubble at the top
            ctx.save();
            ctx.setLineDash([]);
            ctx.fillStyle = cs.getPropertyValue('--bg-canvas') || '#121214';
            ctx.strokeStyle = '#4299e1';
            ctx.beginPath();
            ctx.arc(sx, syTop, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#4299e1';
            ctx.fillText(grid.label || '', sx, syTop);
            ctx.restore();
          }
        }
      });
      ctx.restore();
    }
  }

  MEMBER_DRAW_ORDER.forEach(t => {
    wall.members.forEach(m => {
      if (state.hiddenElements && state.hiddenElements.has(m)) return;
      if (m.type === t) {
        const isVisible = getActiveVisibilitySettings().showFramingGlobal && safeGet(getActiveVisibilitySettings(), m.type);
        if (isVisible) {
          drawMember(m, m === state.hoveredMember || m === state.selectedMember || (state.selectedMembers && state.selectedMembers.includes(m)));
        }
      }
    });
  });
  drawDimensions(wall);

  // Draw Panel Name badge
  if (getActiveVisibilitySettings().showPanelNames) {
    const labelText = `Panel ${wall.label || wall.wall_id}`;
    const cx = wall.length_mm / 2;
    const cy = wall.height_mm / 2;
    const [scx, scy] = w2s(cx, cy);

    ctx.save();
    const fontSize = 11;
    ctx.font = `bold ${fontSize}px Inter`;
    const textW = ctx.measureText(labelText).width;
    const padX = 10, padY = 5;
    const badgeW = textW + padX * 2;
    const badgeH = fontSize + padY * 2;

    const isSelected = state.selectedWallIndices && state.selectedWallIndices.includes(state.currentWallIdx);
    const style = getPanelBadgeStyle(isSelected, false);

    ctx.fillStyle = style.bg;
    ctx.strokeStyle = style.border;
    ctx.lineWidth = 2;

    drawRoundedRect(ctx, scx - badgeW / 2, scy - badgeH / 2, badgeW, badgeH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = style.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, scx, scy);
    ctx.restore();
  }
}

function drawMember(m, h) {
  const [x1, y1] = w2s(m.start.x, m.start.y), [x2, y2] = w2s(m.end.x, m.end.y);
  const c = safeGet(MEMBER_COLORS, m.type) || '#888';

  let thickness = m.flange_mm;
  if (!m.is_vertical) {
    const rot = Math.abs(m.rotation || 0) % 360;
    if (rot === 0 || rot === 180) thickness = m.depth_mm;
  } else {
    const rot = Math.abs(m.rotation || 0) % 360;
    if (rot === 0 || rot === 180) thickness = m.depth_mm;
  }

  const hp = Math.max(1.5, (thickness * state.zoom) / 2);
  ctx.fillStyle = h ? c : hexA(c, 0.25); ctx.strokeStyle = c; ctx.lineWidth = h ? 2 : 1;
  if (m.is_vertical) {
    ctx.fillRect(x1 - hp, y1, hp * 2, y2 - y1);
    ctx.strokeRect(x1 - hp, y1, hp * 2, y2 - y1);

    // Web line highlight
    if (m.profile === 'C_STUD' || m.profile === 'TRACK' || m.type.includes('stud') || m.type.includes('track') || m.type.includes('header')) {
      const rot = (Math.abs(m.rotation || 0)) % 360;
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(2, 3 * state.zoom);
      ctx.beginPath();
      if (rot === 90) { ctx.moveTo(x1 - hp, y1); ctx.lineTo(x1 - hp, y2); }
      else if (rot === 270) { ctx.moveTo(x1 + hp, y1); ctx.lineTo(x1 + hp, y2); }
      ctx.stroke();
    }
  }
  else {
    ctx.fillRect(x1, y1 - hp, x2 - x1, hp * 2);
    ctx.strokeRect(x1, y1 - hp, x2 - x1, hp * 2);

    // Horizontal web line
    if (m.profile === 'C_STUD' || m.profile === 'TRACK' || m.type.includes('track') || m.type.includes('header')) {
      const rot = (Math.abs(m.rotation || 0)) % 360;
      ctx.strokeStyle = c;
      ctx.lineWidth = Math.max(2, 3 * state.zoom);
      ctx.beginPath();
      // Canvas Y points down, y1+hp is bottom of visual bounding box
      if (rot === 90) { ctx.moveTo(x1, y1 + hp); ctx.lineTo(x2, y1 + hp); }
      else if (rot === 270) { ctx.moveTo(x1, y1 - hp); ctx.lineTo(x2, y1 - hp); }
      ctx.stroke();
    }
  }
}

function drawDimensions(wall) {
  const fs = Math.max(9, Math.min(11, state.zoom * 40));
  const cs = getComputedStyle(document.documentElement);
  ctx.font = `500 ${fs}px JetBrains Mono`; ctx.fillStyle = cs.getPropertyValue('--canvas-text'); ctx.textAlign = 'center';
  const [lx0, ly] = w2s(0, -80 / state.zoom), [lx1] = w2s(wall.length_mm, 0);
  ctx.fillText(mmToDisplay(wall.length_mm), (lx0 + lx1) / 2, ly + 4);
  ctx.strokeStyle = cs.getPropertyValue('--border-color'); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(lx0, ly - 6); ctx.lineTo(lx1, ly - 6); ctx.stroke();
  ctx.save(); const [hx, hy0] = w2s(-80 / state.zoom, 0), [, hy1] = w2s(0, wall.height_mm);
  ctx.translate(hx - 4, (hy0 + hy1) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(mmToDisplay(wall.height_mm), 0, 0); ctx.restore();
}

// ─── Canvas Interaction ───────────────────────────────────────────
function onWheel(e) {
  e.preventDefault(); const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const oz = state.zoom; state.zoom = Math.max(0.01, Math.min(10, state.zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
  state.panX = mx - (mx - state.panX) * (state.zoom / oz); state.panY = my - (my - state.panY) * (state.zoom / oz);
  render(); updateZoomLabel();
}
function updateElevationCursor(e) {
  if (!canvas) return;
  if (state.isDragging) {
    canvas.style.cursor = 'grabbing';
    return;
  }
  const isCtrl = e ? e.ctrlKey : false;
  const isShift = e ? e.shiftKey : false;
  if (isCtrl) {
    canvas.classList.add('cursor-select-add');
    canvas.classList.remove('cursor-select-remove');
    canvas.style.cursor = '';
  } else if (isShift) {
    canvas.classList.add('cursor-select-remove');
    canvas.classList.remove('cursor-select-add');
    canvas.style.cursor = '';
  } else {
    canvas.classList.remove('cursor-select-add');
    canvas.classList.remove('cursor-select-remove');
    if (state.hoveredMember || state.hoveredOpening) {
      canvas.style.cursor = 'pointer';
    } else {
      canvas.style.cursor = 'grab';
    }
  }
}

function updatePlanCursor(e) {
  if (!planCanvas) return;
  if (state.isPlanDragging) {
    planCanvas.style.cursor = 'grabbing';
    return;
  }
  const isCtrl = e ? e.ctrlKey : false;
  const isShift = e ? e.shiftKey : false;
  if (isCtrl) {
    planCanvas.classList.add('cursor-select-add');
    planCanvas.classList.remove('cursor-select-remove');
    planCanvas.style.cursor = '';
  } else if (isShift) {
    planCanvas.classList.add('cursor-select-remove');
    planCanvas.classList.remove('cursor-select-add');
    planCanvas.style.cursor = '';
  } else {
    planCanvas.classList.remove('cursor-select-add');
    planCanvas.classList.remove('cursor-select-remove');
    if (state.hoveredPlanMember || state.hoveredPlanWallIdx !== null || state.hoveredPlanOpening) {
      planCanvas.style.cursor = 'pointer';
    } else {
      planCanvas.style.cursor = 'grab';
    }
  }
}

function onMouseDown(e) {
  state.isDragging = true;
  state.dragStartX = e.clientX;
  state.dragStartY = e.clientY;
  state.dragDistance = 0;
  updateElevationCursor(e);
}
function onMouseMove(e) {
  const r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const [wx, wy] = s2w(mx, my); getEl('statusCoord').textContent = `X:${mmToDisplay(Math.max(0, wx))} Y:${mmToDisplay(Math.max(0, wy))}`;
  if (state.isDragging) {
    const dx = e.clientX - state.dragStartX;
    const dy = e.clientY - state.dragStartY;
    state.dragDistance += Math.sqrt(dx * dx + dy * dy);
    state.panX += dx; state.panY += dy; state.dragStartX = e.clientX; state.dragStartY = e.clientY; render(); return;
  }
  const wall = getCurrentWall(); if (!wall) return;

  // Check if hovering the Panel Name badge
  if (getActiveVisibilitySettings().showPanelNames) {
    const [scx, scy] = w2s(wall.length_mm / 2, wall.height_mm / 2);
    const screenDx = Math.abs(mx - scx);
    const screenDy = Math.abs(my - scy);

    const labelText = `Panel ${wall.label || wall.wall_id}`;
    ctx.save();
    const fontSize = 11;
    ctx.font = `bold ${fontSize}px Inter`;
    const textW = ctx.measureText(labelText).width;
    ctx.restore();

    const badgeHalfW = (textW + 20) / 2;
    const badgeHalfH = 11;

    if (screenDx <= badgeHalfW && screenDy <= badgeHalfH) {
      if (state.hoveredMember !== null) {
        state.hoveredMember = null;
        render();
        updateTooltip(null);
      }
      canvas.style.cursor = 'pointer';
      return;
    }
  }

  let hit = null; const hd = 5 / state.zoom;

  // Prioritize vertical members (studs)
  for (let i = wall.members.length - 1; i >= 0; i--) {
    const m = safeGet(wall.members, i);
    if (state.hiddenElements && state.hiddenElements.has(m)) continue;
    if (!m.is_vertical) continue;

    // Visibility check
    const isVisible = getActiveVisibilitySettings().showFramingGlobal && safeGet(getActiveVisibilitySettings(), m.type);
    if (!isVisible) continue;

    if (Math.abs(wx - m.start.x) < hd + m.flange_mm / 2 && wy >= Math.min(m.start.y, m.end.y) && wy <= Math.max(m.start.y, m.end.y)) { hit = m; break; }
  }
  // Check non-vertical members if no vertical member was hit
  if (!hit) {
    for (let i = wall.members.length - 1; i >= 0; i--) {
      const m = safeGet(wall.members, i);
      if (state.hiddenElements && state.hiddenElements.has(m)) continue;
      if (m.is_vertical) continue;

      // Visibility check
      const isVisible = getActiveVisibilitySettings().showFramingGlobal && safeGet(getActiveVisibilitySettings(), m.type);
      if (!isVisible) continue;

      if (Math.abs(wy - m.start.y) < hd + m.flange_mm / 2 && wx >= Math.min(m.start.x, m.end.x) && wx <= Math.max(m.start.x, m.end.x)) { hit = m; break; }
    }
  }

  let hitOpening = null;
  if (!hit && wall.openings) {
    for (let i = wall.openings.length - 1; i >= 0; i--) {
      const op = safeGet(wall.openings, i);
      if (state.hiddenElements && state.hiddenElements.has(op)) continue;
      const xo = op.x_offset || op.x_start || 0;
      const xEnd = xo + op.width;
      const yStart = op.sill_height || 0;
      const yEnd = yStart + op.height;
      if (wx >= xo && wx <= xEnd && wy >= yStart && wy <= yEnd) {
        hitOpening = op;
        break;
      }
    }
  }

  let needRender = false;
  if (hit !== state.hoveredMember) {
    state.hoveredMember = hit;
    needRender = true;
    updateTooltip(hit, e.clientX, e.clientY);
  } else if (hit) {
    updateTooltip(hit, e.clientX, e.clientY);
  }

  if (hitOpening !== state.hoveredOpening) {
    state.hoveredOpening = hitOpening;
    needRender = true;
  }

  if (needRender) {
    render();
  }
  updateElevationCursor(e);
}
function onMouseUp(e) { state.isDragging = false; updateElevationCursor(e); }

function updateTooltip(m, cx, cy) {
  const el = getEl('tooltip'); if (!m) { el.classList.add('hidden'); return; }
  const len = m.is_vertical ? Math.abs(m.end.y - m.start.y) : Math.abs(m.end.x - m.start.x);
  el.innerHTML = '<div class="tt-label">' + escapeHtml(m.label || m.type) + '</div>' +
    '<div class="tt-row"><span class="tt-key">Type</span><span class="tt-val">' + escapeHtml(safeGet(MEMBER_LABELS, m.type) || m.type) + '</span></div>' +
    '<div class="tt-row"><span class="tt-key">Profile</span><span class="tt-val">' + escapeHtml(m.profile) + '</span></div>' +
    '<div class="tt-row"><span class="tt-key">Length</span><span class="tt-val">' + escapeHtml(mmToDisplay(len)) + '</span></div>' +
    '<div class="tt-row"><span class="tt-key">Depth</span><span class="tt-val">' + escapeHtml(mmToDisplay(m.depth_mm)) + '</span></div>' +
    '<div class="tt-row"><span class="tt-key">Rotation</span><span class="tt-val">' + escapeHtml(m.rotation) + '°</span></div>';
  el.classList.remove('hidden');

  const rect = canvas.getBoundingClientRect();
  const tx = cx - rect.left;
  const ty = cy - rect.top;
  let l = tx + 14, t = ty + 14; if (l + 220 > rect.width) l = tx - 234; if (t + 150 > rect.height) t = ty - 164;
  el.style.left = l + 'px'; el.style.top = t + 'px';
}



function hexA(hex, a) { const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16); return `rgba(${r},${g},${b},${a})`; }

// ─── Custom Assembly Builder ──────────────────────────────────────────

function getStructuralThickness(wall) {
  if (!wall || !wall.layers || wall.layers.length === 0) return wall ? (wall.thickness || 92.08) : 92.08;
  const struct = wall.layers.find(l => l.is_structural) || wall.layers.find(l => l.function && l.function.toLowerCase() === 'structure');
  if (struct) return struct.thickness_mm;
  return Math.max(...wall.layers.map(l => l.thickness_mm));
}

function getExteriorFinishThickness(wall) {
  if (!wall || !wall.layers || wall.layers.length === 0) return 0;
  const structIdx = wall.layers.findIndex(l => l.is_structural || (l.function && l.function.toLowerCase() === 'structure'));
  if (structIdx <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < structIdx; i++) {
    sum += safeGet(wall.layers, i).thickness_mm || 0;
  }
  return sum;
}

function getInteriorFinishThickness(wall) {
  if (!wall || !wall.layers || wall.layers.length === 0) return 0;
  const structIdx = wall.layers.findIndex(l => l.is_structural || (l.function && l.function.toLowerCase() === 'structure'));
  if (structIdx === -1 || structIdx >= wall.layers.length - 1) return 0;
  let sum = 0;
  for (let i = structIdx + 1; i < wall.layers.length; i++) {
    sum += safeGet(wall.layers, i).thickness_mm || 0;
  }
  return sum;
}

let currentAssemblyMembers = [];
let assemblyContext = 'header'; // 'header' or 'king'

const STANDARD_JOIN_TEMPLATES = {
  L12: [
    {
      wall: 'continue',
      source: 'panel_stud',
      type: 'stud',
      rotation: 90,
      align_x_target: 'stop_core_int',
      align_x_source: 'center',
      align_x_offset: 15.875,
      align_y_target: 'cont_core_center',
      align_y_source: 'center',
      align_y_offset: 0,
      label: 'Backing Stud'
    }
  ],
  L13: [
    {
      wall: 'continue',
      source: 'panel_stud',
      type: 'stud',
      rotation: 90,
      align_x_target: 'stop_finish_int',
      align_x_source: 'center',
      align_x_offset: 15.875,
      align_y_target: 'cont_core_center',
      align_y_source: 'center',
      align_y_offset: 0,
      label: 'Backing Stud (Finish Aligned)'
    }
  ],
  L14: [
    {
      wall: 'continue',
      source: 'panel_stud',
      type: 'stud',
      rotation: 90,
      align_x_target: 'stop_core_int',
      align_x_source: 'center',
      align_x_offset: 15.875,
      align_y_target: 'cont_core_center',
      align_y_source: 'center',
      align_y_offset: 0,
      label: 'Backing Stud 1'
    },
    {
      wall: 'continue',
      source: 'panel_stud',
      type: 'stud',
      rotation: 270,
      align_x_target: 'stop_core_int',
      align_x_source: 'center',
      align_x_offset: -15.875,
      align_y_target: 'cont_core_center',
      align_y_source: 'center',
      align_y_offset: 0,
      label: 'Backing Stud 2 (Back-to-Back)'
    }
  ],
  L15: [
    {
      wall: 'continue',
      source: 'panel_stud',
      type: 'stud',
      rotation: 180,
      align_x_target: 'stop_core_int',
      align_x_source: 'web_face',
      align_x_offset: 31.75,
      align_y_target: 'cont_core_ext',
      align_y_source: 'web_face',
      align_y_offset: 0,
      label: 'Rotated Backing Stud'
    }
  ],
  T11: [
    {
      wall: 'continue',
      source: 'panel_stud',
      type: 'stud',
      rotation: 270,
      align_x_target: 'stop_core_ext',
      align_x_source: 'center',
      align_x_offset: -15.875,
      align_y_target: 'cont_core_center',
      align_y_source: 'center',
      align_y_offset: 0,
      label: 'Left Backing Stud'
    },
    {
      wall: 'continue',
      source: 'panel_stud',
      type: 'stud',
      rotation: 90,
      align_x_target: 'stop_core_int',
      align_x_source: 'center',
      align_x_offset: 15.875,
      align_y_target: 'cont_core_center',
      align_y_source: 'center',
      align_y_offset: 0,
      label: 'Right Backing Stud'
    }
  ],
  T12: [
    {
      wall: 'continue',
      source: 'panel_stud',
      type: 'stud',
      rotation: 270,
      align_x_target: 'stop_core_ext',
      align_x_source: 'center',
      align_x_offset: -15.875,
      align_y_target: 'cont_core_center',
      align_y_source: 'center',
      align_y_offset: 0,
      label: 'Left Backing Stud'
    },
    {
      wall: 'continue',
      source: 'panel_stud',
      type: 'stud',
      rotation: 90,
      align_x_target: 'stop_core_int',
      align_x_source: 'center',
      align_x_offset: 15.875,
      align_y_target: 'cont_core_center',
      align_y_source: 'center',
      align_y_offset: 0,
      label: 'Right Backing Stud'
    },
    {
      wall: 'continue',
      source: 'panel_stud',
      type: 'stud',
      rotation: 180,
      align_x_target: 'stop_core_center',
      align_x_source: 'center',
      align_x_offset: 0,
      align_y_target: 'cont_core_ext',
      align_y_source: 'web_face',
      align_y_offset: 0,
      label: 'Mirrored Backing Stud'
    }
  ]
};

function openAssemblyBuilder(context = 'header') {
  assemblyContext = context;
  getEl('assemblyModal').classList.remove('hidden');
  getEl('assemblyName').value = '';

  if (assemblyContext === 'header') {
    getEl('assemblyModalTitle').innerText = "Visual Assembly Builder - Header (Section View)";
  } else if (assemblyContext === 'king') {
    getEl('assemblyModalTitle').innerText = "Visual Assembly Builder - King Stud (Plan View)";
  } else if (assemblyContext === 'l_join') {
    getEl('assemblyModalTitle').innerText = "Visual Assembly Builder - L-Join (Plan View)";
  } else if (assemblyContext === 't_join') {
    getEl('assemblyModalTitle').innerText = "Visual Assembly Builder - T-Join (Plan View)";
  }

  const templateContainer = getEl('assemblyTemplateContainer');
  const presetsContainer = getEl('assemblyPresetsContainer');
  const templateSelect = getEl('assemblyTemplateSelect');

  if (assemblyContext === 'l_join' || assemblyContext === 't_join') {
    if (templateContainer) templateContainer.style.display = 'block';
    if (presetsContainer) presetsContainer.style.display = 'block';
    if (templateSelect) {
      templateSelect.innerHTML = '';
      if (assemblyContext === 'l_join') {
        templateSelect.innerHTML = `
          <option value="L12">L12 (Core Face + Extra Stud)</option>
          <option value="L13">L13 (Finish Face + Extra Stud)</option>
          <option value="L14">L14 (Core Face + Back-to-Back Studs)</option>
          <option value="L15">L15 (Rotated Backing Stud)</option>
        `;
      } else {
        templateSelect.innerHTML = `
          <option value="T11">T11 (Double Backing Studs)</option>
          <option value="T12">T12 (Double Backing + Mirrored Stud)</option>
        `;
      }
    }
  } else {
    if (templateContainer) templateContainer.style.display = 'none';
    if (presetsContainer) presetsContainer.style.display = 'none';
  }

  currentAssemblyMembers = [];
  renderAssemblyMembers();
}

getEl('btnCloseAssemblyModal').addEventListener('click', closeAssemblyBuilder);
getEl('btnCancelAssembly').addEventListener('click', closeAssemblyBuilder);

function closeAssemblyBuilder() {
  getEl('assemblyModal').classList.add('hidden');
}

getEl('btnLoadTemplate').addEventListener('click', () => {
  const templateName = getEl('assemblyTemplateSelect').value;
  const template = safeGet(STANDARD_JOIN_TEMPLATES, templateName);
  if (template) {
    currentAssemblyMembers = JSON.parse(JSON.stringify(template));
    getEl('assemblyName').value = `Copy_of_${templateName}`;
    renderAssemblyMembers();
  }
});

getEl('btnPresetLeftBacking').addEventListener('click', () => {
  currentAssemblyMembers.push({
    wall: 'continue',
    source: 'panel_stud',
    type: 'stud',
    rotation: 270,
    align_x_target: 'stop_core_ext',
    align_x_source: 'center',
    align_x_offset: -15.875,
    align_y_target: 'cont_core_center',
    align_y_source: 'center',
    align_y_offset: 0,
    label: 'Left Backing Stud'
  });
  renderAssemblyMembers();
});

getEl('btnPresetRightBacking').addEventListener('click', () => {
  currentAssemblyMembers.push({
    wall: 'continue',
    source: 'panel_stud',
    type: 'stud',
    rotation: 90,
    align_x_target: 'stop_core_int',
    align_x_source: 'center',
    align_x_offset: 15.875,
    align_y_target: 'cont_core_center',
    align_y_source: 'center',
    align_y_offset: 0,
    label: 'Right Backing Stud'
  });
  renderAssemblyMembers();
});

getEl('btnPresetMirrored').addEventListener('click', () => {
  currentAssemblyMembers.push({
    wall: 'continue',
    source: 'panel_stud',
    type: 'stud',
    rotation: 180,
    align_x_target: 'stop_core_center',
    align_x_source: 'center',
    align_x_offset: 0,
    align_y_target: 'cont_core_ext',
    align_y_source: 'web_face',
    align_y_offset: 0,
    label: 'Mirrored Backing Stud'
  });
  renderAssemblyMembers();
});

getEl('btnAddMember').addEventListener('click', () => {
  currentAssemblyMembers.push({
    type: 'stud', source: 'panel_stud',
    depth_mm: 92.08, flange_mm: 31.75, gauge_mm: 0.893,
    rotation: 0, offset_x: 0, offset_y: 0, offset_z: 0,
    wall: (assemblyContext === 'l_join' || assemblyContext === 't_join') ? 'stop' : undefined,
    label: 'Custom Member'
  });
  renderAssemblyMembers();
});

function getMemberDims(m) {
  if (assemblyContext === 'l_join' || assemblyContext === 't_join') {
    if (m.source === 'panel_stud') return { d: 92.08, f: 31.75, g: 0.893, t: 'stud' };
    if (m.source === 'panel_track') return { d: 92.08, f: 31.75, g: 0.893, t: 'track' };
  } else {
    if (m.source === 'panel_stud') return { d: state.configRaw?.stud?.default_depth_mm || 92.08, f: state.configRaw?.stud?.default_flange_mm || 31.75, g: state.configRaw?.stud?.default_gauge_mm || 0.893, t: 'stud' };
    if (m.source === 'panel_track') return { d: state.configRaw?.track?.default_depth_mm || 92.08, f: state.configRaw?.track?.default_flange_mm || 31.75, g: state.configRaw?.track?.default_gauge_mm || 0.893, t: 'track' };
  }
  return { d: parseFloat(m.depth_mm) || 92.08, f: parseFloat(m.flange_mm) || 31.75, g: parseFloat(m.gauge_mm) || 0.893, t: m.type };
}

function getTargetsAndSources(m, wallType) {
  const isStopped = (wallType === 'stop');
  const rot = (parseFloat(m.rotation) || 0) % 360;
  const rotMod = Math.abs(rot) % 360;
  const dims = getMemberDims(m);

  let m_w = dims.f;
  let m_h = dims.d;
  if (rotMod === 90 || rotMod === 270) {
    const tmp = m_w; m_w = m_h; m_h = tmp;
  }

  function getSourceOffset(source, isY) {
    if (!isY) {
      if (source === 'center') return 0;
      if (source === 'left_edge') return -m_w / 2;
      if (source === 'right_edge') return m_w / 2;
      if (source === 'web_face') {
        if (rotMod === 0) return dims.f / 2;
        if (rotMod === 180) return -dims.f / 2;
        return 0;
      }
      if (source === 'flange_tips') {
        if (rotMod === 0) return -dims.f / 2;
        if (rotMod === 180) return dims.f / 2;
        return 0;
      }
    } else {
      if (source === 'center') return 0;
      if (source === 'top_edge') return -m_h / 2;
      if (source === 'bottom_edge') return m_h / 2;
      if (source === 'web_face') {
        if (rotMod === 90) return dims.f / 2;
        if (rotMod === 270) return -dims.f / 2;
        return 0;
      }
      if (source === 'flange_tips') {
        if (rotMod === 90) return -dims.f / 2;
        if (rotMod === 270) return dims.f / 2;
        return 0;
      }
    }
    return 0;
  }

  let x_targets, y_targets;
  if (isStopped) {
    x_targets = {
      'cont_core_face': 0,
      'cont_core_center': 46.04,
      'cont_core_int': 92.08,
      'cont_finish_ext': -15.0,
      'cont_finish_int': 107.08
    };
    y_targets = {
      'stop_core_center': 0,
      'stop_core_ext': -46.04,
      'stop_core_int': 46.04,
      'stop_finish_ext': -61.04,
      'stop_finish_int': 61.04
    };
  } else {
    x_targets = {
      'stop_core_center': 0,
      'stop_core_ext': -46.04,
      'stop_core_int': 46.04,
      'stop_finish_ext': -61.04,
      'stop_finish_int': 61.04
    };
    y_targets = {
      'cont_core_center': 0,
      'cont_core_ext': -46.04,
      'cont_core_int': 46.04,
      'cont_finish_ext': -61.04,
      'cont_finish_int': 61.04
    };
  }

  return { x_targets, y_targets, getSourceOffset };
}

function initializeMemberAlignments(m, wallType) {
  if (assemblyContext !== 'l_join' && assemblyContext !== 't_join') return;
  const isStopped = (wallType === 'stop');
  const { x_targets, y_targets, getSourceOffset } = getTargetsAndSources(m, wallType);

  const sources_x = ['center', 'left_edge', 'right_edge', 'web_face', 'flange_tips'];
  const sources_y = ['center', 'top_edge', 'bottom_edge', 'web_face', 'flange_tips'];

  const SNAP_TOLERANCE = 5.0; // mm

  if (m.align_x_target === undefined) {
    let bestTarget = isStopped ? 'cont_core_face' : 'stop_core_center';
    let bestSource = 'center';
    let bestOffset = parseFloat(m.offset_x) || 0;
    let bestDiff = 999999;

    const ox = parseFloat(m.offset_x) || 0;
    for (const [t_name, t_val] of Object.entries(x_targets)) {
      for (const s_name of sources_x) {
        const s_val = getSourceOffset(s_name, isStopped ? false : true);
        let computed_ox;
        if (isStopped) {
          computed_ox = s_val - t_val;
        } else {
          computed_ox = (assemblyContext === 'l_join') ? (t_val - s_val) : (s_val - t_val);
        }
        const diff = Math.abs(ox - computed_ox);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestTarget = t_name;
          bestSource = s_name;
          bestOffset = ox - computed_ox;
        }
      }
    }

    m.align_x_target = bestTarget;
    m.align_x_source = bestSource;
    m.align_x_offset = Math.abs(bestDiff) < SNAP_TOLERANCE ? 0.0 : parseFloat(bestOffset.toFixed(2));
  }

  if (m.align_y_target === undefined) {
    let bestTarget = isStopped ? 'stop_core_center' : 'cont_core_center';
    let bestSource = 'center';
    let bestOffset = parseFloat(m.offset_y) || 0;
    let bestDiff = 999999;

    const oy = parseFloat(m.offset_y) || 0;
    for (const [t_name, t_val] of Object.entries(y_targets)) {
      for (const s_name of sources_y) {
        const s_val = getSourceOffset(s_name, isStopped ? true : false);
        let computed_oy;
        if (isStopped) {
          computed_oy = s_val - t_val;
        } else {
          computed_oy = t_val - s_val;
        }
        const diff = Math.abs(oy - computed_oy);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestTarget = t_name;
          bestSource = s_name;
          bestOffset = oy - computed_oy;
        }
      }
    }

    m.align_y_target = bestTarget;
    m.align_y_source = bestSource;
    m.align_y_offset = Math.abs(bestDiff) < SNAP_TOLERANCE ? 0.0 : parseFloat(bestOffset.toFixed(2));
  }
}

function computeMemberOffsetsFromAlignments(m, wallType) {
  if (assemblyContext !== 'l_join' && assemblyContext !== 't_join') return;
  const isStopped = (wallType === 'stop');
  const { x_targets, y_targets, getSourceOffset } = getTargetsAndSources(m, wallType);

  const t_val_x = safeGet(x_targets, m.align_x_target) !== undefined ? safeGet(x_targets, m.align_x_target) : 0;
  const s_val_x = getSourceOffset(m.align_x_source, isStopped ? false : true);
  let base_ox;
  if (isStopped) {
    base_ox = s_val_x - t_val_x;
  } else {
    base_ox = t_val_x - s_val_x;
  }
  m.offset_x = parseFloat((base_ox + (parseFloat(m.align_x_offset) || 0)).toFixed(2));

  const t_val_y = safeGet(y_targets, m.align_y_target) !== undefined ? safeGet(y_targets, m.align_y_target) : 0;
  const s_val_y = getSourceOffset(m.align_y_source, isStopped ? true : false);
  let base_oy;
  if (isStopped) {
    base_oy = s_val_y - t_val_y;
  } else {
    base_oy = t_val_y - s_val_y;
  }
  m.offset_y = parseFloat((base_oy + (parseFloat(m.align_y_offset) || 0)).toFixed(2));
  m.offset_z = m.offset_y; // Keep offset_z aligned with offset_y
}

function getAlignLabelX(m) {
  const isL = (assemblyContext === 'l_join');
  let targetLabels;
  if (m.wall === 'continue') {
    targetLabels = {
      'stop_core_center': 'Stop. Centerline',
      'stop_core_ext': isL ? "Stop Wall's Core Face on Wall End Side" : "Stop. Left Core Face",
      'stop_core_int': isL ? "Stop Wall's Core Face on Opposite to Wall End Side" : "Stop. Right Core Face",
      'stop_finish_ext': isL ? "Stop Wall's Finish Face on Wall End Side" : "Stop. Left Finish Face",
      'stop_finish_int': isL ? "Stop Wall's Finish Face on Opposite to Wall End Side" : "Stop. Right Finish Face"
    };
  } else {
    targetLabels = {
      'cont_core_face': 'Cont. Join Core Face',
      'cont_core_center': 'Cont. Centerline',
      'cont_core_int': 'Cont. Opposite Core Face',
      'cont_finish_ext': 'Cont. Join Finish Face',
      'cont_finish_int': 'Cont. Opposite Finish Face'
    };
  }

  const rotMod = Math.abs(parseFloat(m.rotation) || 0) % 360;
  let sourceLabel = m.align_x_source;
  if (sourceLabel === 'left_edge') {
    if (rotMod === 0) sourceLabel = 'Flange Tips';
    else if (rotMod === 90) sourceLabel = 'Flange Face';
    else if (rotMod === 180) sourceLabel = 'Web Face';
    else if (rotMod === 270) sourceLabel = 'Flange Face';
  } else if (sourceLabel === 'right_edge') {
    if (rotMod === 0) sourceLabel = 'Web Face';
    else if (rotMod === 90) sourceLabel = 'Flange Face';
    else if (rotMod === 180) sourceLabel = 'Flange Tips';
    else if (rotMod === 270) sourceLabel = 'Flange Face';
  } else if (sourceLabel === 'web_face') {
    sourceLabel = 'Web Face';
  } else if (sourceLabel === 'flange_tips') {
    sourceLabel = 'Flange Tips';
  } else if (sourceLabel === 'center') {
    sourceLabel = 'Center';
  }

  const targetLabel = safeGet(targetLabels, m.align_x_target) || m.align_x_target || 'None';
  return `${sourceLabel} to ${targetLabel}`;
}

function getAlignLabelY(m) {
  const isL = (assemblyContext === 'l_join');
  const targetLabels = {
    'cont_core_center': 'Cont. Centerline',
    'cont_core_ext': 'Cont. Join Core Face',
    'cont_core_int': 'Cont. Opposite Core Face',
    'cont_finish_ext': 'Cont. Join Finish Face',
    'cont_finish_int': 'Cont. Opposite Finish Face',
    'stop_core_center': 'Stop. Centerline',
    'stop_core_ext': isL ? 'Stop. Outside Core Face' : 'Stop. Left Core Face',
    'stop_core_int': isL ? 'Stop. Inside Core Face' : 'Stop. Right Core Face',
    'stop_finish_ext': isL ? 'Stop. Outside Finish Face' : 'Stop. Left Finish Face',
    'stop_finish_int': isL ? 'Stop. Inside Finish Face' : 'Stop. Right Finish Face'
  };

  const rotMod = Math.abs(parseFloat(m.rotation) || 0) % 360;
  let sourceLabel = m.align_y_source;
  if (sourceLabel === 'top_edge') {
    if (rotMod === 0) sourceLabel = 'Flange Face';
    else if (rotMod === 90) sourceLabel = 'Flange Tips';
    else if (rotMod === 180) sourceLabel = 'Flange Face';
    else if (rotMod === 270) sourceLabel = 'Web Face';
  } else if (sourceLabel === 'bottom_edge') {
    if (rotMod === 0) sourceLabel = 'Flange Face';
    else if (rotMod === 90) sourceLabel = 'Web Face';
    else if (rotMod === 180) sourceLabel = 'Flange Face';
    else if (rotMod === 270) sourceLabel = 'Flange Tips';
  } else if (sourceLabel === 'web_face') {
    sourceLabel = 'Web Face';
  } else if (sourceLabel === 'flange_tips') {
    sourceLabel = 'Flange Tips';
  } else if (sourceLabel === 'center') {
    sourceLabel = 'Center';
  }

  const targetLabel = safeGet(targetLabels, m.align_y_target) || m.align_y_target || 'None';
  return `${sourceLabel} to ${targetLabel}`;
}

window.updateAssemblyAlignmentOffset = function (idx, key, val) {
  safeSet(safeGet(currentAssemblyMembers, idx), key, val);
  computeMemberOffsetsFromAlignments(safeGet(currentAssemblyMembers, idx), safeGet(currentAssemblyMembers, idx).wall);
  renderAssemblyMembers();
};

window.updateAssemblyAlignment = function (idx, key, val) {
  safeSet(safeGet(currentAssemblyMembers, idx), key, val);
  computeMemberOffsetsFromAlignments(safeGet(currentAssemblyMembers, idx), safeGet(currentAssemblyMembers, idx).wall);
  renderAssemblyMembers();
};

function renderAssemblyMembers() {
  if (assemblyContext === 'l_join' || assemblyContext === 't_join') {
    currentAssemblyMembers.forEach(m => {
      initializeMemberAlignments(m, m.wall);
      computeMemberOffsetsFromAlignments(m, m.wall);
    });
  }
  const list = getEl('assemblyMembersList');
  list.innerHTML = '';
  currentAssemblyMembers.forEach((m, i) => {
    const isCustom = m.source === 'custom';

    let targetOptionsX = '';
    if (m.wall === 'continue') {
      targetOptionsX = 
        '<option value="stop_core_center" ' + (m.align_x_target === 'stop_core_center' ? 'selected' : '') + '>Stopped Centerline</option>' +
        '<option value="stop_core_ext" ' + (m.align_x_target === 'stop_core_ext' ? 'selected' : '') + '>Stopped Core Face (Ext/Left)</option>' +
        '<option value="stop_core_int" ' + (m.align_x_target === 'stop_core_int' ? 'selected' : '') + '>Stopped Core Face (Int/Right)</option>' +
        '<option value="stop_finish_ext" ' + (m.align_x_target === 'stop_finish_ext' ? 'selected' : '') + '>Stopped Finish Face (Ext/Left)</option>' +
        '<option value="stop_finish_int" ' + (m.align_x_target === 'stop_finish_int' ? 'selected' : '') + '>Stopped Finish Face (Int/Right)</option>';
    } else {
      targetOptionsX = 
        '<option value="cont_core_face" ' + (m.align_x_target === 'cont_core_face' ? 'selected' : '') + '>Continuing Core Face (Left)</option>' +
        '<option value="cont_core_center" ' + (m.align_x_target === 'cont_core_center' ? 'selected' : '') + '>Continuing Centerline</option>' +
        '<option value="cont_core_int" ' + (m.align_x_target === 'cont_core_int' ? 'selected' : '') + '>Continuing Core Face (Right)</option>' +
        '<option value="cont_finish_ext" ' + (m.align_x_target === 'cont_finish_ext' ? 'selected' : '') + '>Continuing Finish Face (Left)</option>' +
        '<option value="cont_finish_int" ' + (m.align_x_target === 'cont_finish_int' ? 'selected' : '') + '>Continuing Finish Face (Right)</option>';
    }

    let targetOptionsY = '';
    if (m.wall === 'continue') {
      targetOptionsY = 
        '<option value="cont_core_center" ' + (m.align_y_target === 'cont_core_center' ? 'selected' : '') + '>Continuing Centerline</option>' +
        '<option value="cont_core_ext" ' + (m.align_y_target === 'cont_core_ext' ? 'selected' : '') + '>Continuing Core Face (Left)</option>' +
        '<option value="cont_core_int" ' + (m.align_y_target === 'cont_core_int' ? 'selected' : '') + '>Continuing Core Face (Right)</option>' +
        '<option value="cont_finish_ext" ' + (m.align_y_target === 'cont_finish_ext' ? 'selected' : '') + '>Continuing Finish Face (Left)</option>' +
        '<option value="cont_finish_int" ' + (m.align_y_target === 'cont_finish_int' ? 'selected' : '') + '>Continuing Finish Face (Right)</option>';
    } else {
      targetOptionsY = 
        '<option value="stop_core_center" ' + (m.align_y_target === 'stop_core_center' ? 'selected' : '') + '>Stopped Centerline</option>' +
        '<option value="stop_core_ext" ' + (m.align_y_target === 'stop_core_ext' ? 'selected' : '') + '>Stopped Core Face (Ext/Left)</option>' +
        '<option value="stop_core_int" ' + (m.align_y_target === 'stop_core_int' ? 'selected' : '') + '>Stopped Core Face (Int/Right)</option>' +
        '<option value="stop_finish_ext" ' + (m.align_y_target === 'stop_finish_ext' ? 'selected' : '') + '>Stopped Finish Face (Ext/Left)</option>' +
        '<option value="stop_finish_int" ' + (m.align_y_target === 'stop_finish_int' ? 'selected' : '') + '>Stopped Finish Face (Int/Right)</option>';
    }

    const html = `
      <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 10px; border-radius: 6px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
          <input type="text" value="${escapeHtml(m.label || `Member ${i + 1}`)}" onchange="updateAssemblyMember(${i}, 'label', this.value)" style="background:transparent; border:none; border-bottom:1px dashed var(--border-color); color:var(--text-primary); font-size:12px; font-weight:700; outline:none; padding:2px; max-width: 250px;" title="Click to edit member label">
          <button class="btn-icon" style="width:24px;height:24px;font-size:12px" onclick="removeAssemblyMember(${i})">✕</button>
        </div>
        <div class="config-grid" style="grid-template-columns: 60px 1fr 60px 1fr; gap:8px 6px; padding:0">
          ${(assemblyContext === 'l_join' || assemblyContext === 't_join') ? `
            <label>Wall</label>
            <select onchange="updateAssemblyMember(${i}, 'wall', this.value)" class="styled-select" style="padding:4px 6px; grid-column: span 3">
              <option value="stop" ${m.wall === 'stop' ? 'selected' : ''}>Stopped Wall</option>
              <option value="continue" ${m.wall === 'continue' ? 'selected' : ''}>Continuing Wall</option>
            </select>
          ` : ''}
          <label>Source</label>
          <select onchange="updateAssemblyMember(${i}, 'source', this.value)" class="styled-select" style="padding:4px 6px; grid-column: span 3">
            <option value="panel_stud" ${m.source === 'panel_stud' ? 'selected' : ''}>Same as Panel Stud</option>
            <option value="panel_track" ${m.source === 'panel_track' ? 'selected' : ''}>Same as Panel Track</option>
            <option value="custom" ${m.source === 'custom' ? 'selected' : ''}>Custom Dimensions...</option>
            <option value="revit" ${m.source === 'revit' ? 'selected' : ''}>Revit Profile...</option>
          </select>
          
          ${isCustom ? `
            <label>Type</label>
            <select onchange="updateAssemblyMember(${i}, 'type', this.value)" class="styled-select" style="padding:4px 6px">
              <option value="stud" ${m.type === 'stud' ? 'selected' : ''}>C-Stud</option>
              <option value="track" ${m.type === 'track' ? 'selected' : ''}>Track</option>
            </select>
            <label></label><div></div>
            <label>Depth</label>
            <input type="text" value="${mmToDisplay(m.depth_mm)}" onchange="updateAssemblyMember(${i}, 'depth_mm', displayToMm(this.value))" style="width:100%;background:var(--bg-input);border:1px solid var(--border-color);color:white;padding:4px;font-family:var(--font-mono)">
            <label>Flange</label>
            <input type="text" value="${mmToDisplay(m.flange_mm)}" onchange="updateAssemblyMember(${i}, 'flange_mm', displayToMm(this.value))" style="width:100%;background:var(--bg-input);border:1px solid var(--border-color);color:white;padding:4px;font-family:var(--font-mono)">
          ` : ''}

          ${m.source === 'revit' ? `
            <label>Profile</label>
            <div style="grid-column: span 3; display: flex; align-items: center; gap: 6px;">
              <span style="font-size: 11px; font-family: var(--font-mono); color: var(--text-secondary); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${m.designation || 'None Selected'}">${m.designation || 'None Selected'}</span>
              <button class="btn btn-accent" type="button" style="padding: 2px 6px; font-size: 10px; cursor: pointer;" onclick="selectAssemblyMemberRevitProfile(${i})">Change...</button>
            </div>
            <label>Depth</label>
            <input type="text" readonly value="${mmToDisplay(m.depth_mm)}" style="width:100%;background:rgba(255,255,255,0.05);border:1px solid var(--border-color);color:var(--text-muted);padding:4px;font-family:var(--font-mono);pointer-events:none;">
            <label>Flange</label>
            <input type="text" readonly value="${mmToDisplay(m.flange_mm)}" style="width:100%;background:rgba(255,255,255,0.05);border:1px solid var(--border-color);color:var(--text-muted);padding:4px;font-family:var(--font-mono);pointer-events:none;">
          ` : ''}

          <label>Rotation</label>
          <select onchange="updateAssemblyMember(${i}, 'rotation', this.value)" class="styled-select" style="padding:4px 6px">
            <option value="0" ${m.rotation == 0 ? 'selected' : ''}>0°</option>
            <option value="90" ${m.rotation == 90 ? 'selected' : ''}>90°</option>
            <option value="180" ${m.rotation == 180 ? 'selected' : ''}>180°</option>
            <option value="270" ${m.rotation == 270 ? 'selected' : ''}>270°</option>
          </select>
          
          ${(assemblyContext === 'l_join' || assemblyContext === 't_join') ? `
            <div style="grid-column: span 4; background: rgba(255,255,255,0.03); padding: 8px; border-radius: 4px; border: 1px dashed rgba(255,255,255,0.1); margin-top:4px; display:flex; flex-direction:column; gap:8px;">
              <div>
                <div style="font-size:10px; color:var(--text-muted); margin-bottom:4px;"><strong style="color:var(--text-secondary)">Longitudinal Align (X):</strong></div>
                <div style="display:flex; flex-direction:column; gap:4px; margin-bottom:4px;">
                  <select onchange="updateAssemblyAlignment(${i}, 'align_x_target', this.value)" class="styled-select" style="padding:2px 4px; font-size:11px; width:100%; height:24px;">
                    ${targetOptionsX}
                  </select>
                  <select onchange="updateAssemblyAlignment(${i}, 'align_x_source', this.value)" class="styled-select" style="padding:2px 4px; font-size:11px; width:100%; height:24px;">
                    <option value="center" ${m.align_x_source === 'center' ? 'selected' : ''}>Anchor: Center</option>
                    <option value="left_edge" ${m.align_x_source === 'left_edge' ? 'selected' : ''}>Anchor: Left Edge / Flange Tips</option>
                    <option value="right_edge" ${m.align_x_source === 'right_edge' ? 'selected' : ''}>Anchor: Right Edge / Web Face</option>
                    <option value="web_face" ${m.align_x_source === 'web_face' ? 'selected' : ''}>Anchor: Web Face</option>
                    <option value="flange_tips" ${m.align_x_source === 'flange_tips' ? 'selected' : ''}>Anchor: Flange Tips</option>
                  </select>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                  <span style="font-size:10px; color:var(--text-muted); width: 65px;">Rel. Offset:</span>
                  <input type="text" value="${mmToDisplay(m.align_x_offset || 0)}" onchange="updateAssemblyAlignmentOffset(${i}, 'align_x_offset', displayToMm(this.value))" style="flex:1;background:var(--bg-input);border:1px solid var(--border-color);color:white;padding:2px 4px;font-family:var(--font-mono);font-size:11px;">
                </div>
              </div>
              
              <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:8px; margin-top:2px;">
                <div style="font-size:10px; color:var(--text-muted); margin-bottom:4px;"><strong style="color:var(--text-secondary)">Lateral Align (Y):</strong></div>
                <div style="display:flex; flex-direction:column; gap:4px; margin-bottom:4px;">
                  <select onchange="updateAssemblyAlignment(${i}, 'align_y_target', this.value)" class="styled-select" style="padding:2px 4px; font-size:11px; width:100%; height:24px;">
                    ${targetOptionsY}
                  </select>
                  <select onchange="updateAssemblyAlignment(${i}, 'align_y_source', this.value)" class="styled-select" style="padding:2px 4px; font-size:11px; width:100%; height:24px;">
                    <option value="center" ${m.align_y_source === 'center' ? 'selected' : ''}>Anchor: Center</option>
                    <option value="top_edge" ${m.align_y_source === 'top_edge' ? 'selected' : ''}>Anchor: Top Edge</option>
                    <option value="bottom_edge" ${m.align_y_source === 'bottom_edge' ? 'selected' : ''}>Anchor: Bottom Edge</option>
                    <option value="web_face" ${m.align_y_source === 'web_face' ? 'selected' : ''}>Anchor: Web Face</option>
                    <option value="flange_tips" ${m.align_y_source === 'flange_tips' ? 'selected' : ''}>Anchor: Flange Tips</option>
                  </select>
                </div>
                <div style="display:flex; align-items:center; gap:4px;">
                  <span style="font-size:10px; color:var(--text-muted); width: 65px;">Rel. Offset:</span>
                  <input type="text" value="${mmToDisplay(m.align_y_offset || 0)}" onchange="updateAssemblyAlignmentOffset(${i}, 'align_y_offset', displayToMm(this.value))" style="flex:1;background:var(--bg-input);border:1px solid var(--border-color);color:white;padding:2px 4px;font-family:var(--font-mono);font-size:11px;">
                </div>
              </div>
            </div>
          ` : `
            <label title="X/Y Offset relative to context origin">Offset</label>
            <div style="display:flex; gap:4px; grid-column: span 3;">
              <div style="display:flex; align-items:center; gap:2px; flex:1">
                <span style="font-size:10px; color:var(--text-muted)">X:</span>
                <input type="text" placeholder="X" value="${mmToDisplay(m.offset_x || 0)}" onchange="updateAssemblyMember(${i}, 'offset_x', displayToMm(this.value))" style="width:100%;background:var(--bg-input);border:1px solid var(--border-color);color:white;padding:4px;font-family:var(--font-mono)">
              </div>
              <div style="display:flex; align-items:center; gap:2px; flex:1">
                <span style="font-size:10px; color:var(--text-muted)">Y:</span>
                <input type="text" placeholder="Y" value="${mmToDisplay(m.offset_y || 0)}" onchange="updateAssemblyMember(${i}, 'offset_y', displayToMm(this.value))" style="width:100%;background:var(--bg-input);border:1px solid var(--border-color);color:white;padding:4px;font-family:var(--font-mono)">
              </div>
            </div>
          `}
        </div>
    `;
    list.insertAdjacentHTML('beforeend', html);
  });
  renderAssemblyCanvas();
}

function renderAssemblyCanvas() {
  const canvas = getEl('assemblyCanvas');
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const isLight = document.documentElement.getAttribute('data-theme') === 'light' || state.theme === 'light';

  // Theme-aware colors
  const gridColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
  const wallFill = isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.12)';
  const wallStroke = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.35)';
  const labelColor = isLight ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.4)';
  const labelColorStrong = isLight ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.6)';
  const openingFill = isLight ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.18)';
  const openingStroke = isLight ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.4)';
  const finishFill = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
  const finishStroke = isLight ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.25)';
  const crosshairColor = isLight ? 'rgba(0,127,255,0.5)' : 'rgba(99,179,237,0.5)';

  // Draw Grid
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  const scale = 2.0; // 2 pixels per mm
  const gridPx = 25.4 * scale; // 1 inch grid
  for (let x = 0; x < canvas.width; x += gridPx) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
  for (let y = 0; y < canvas.height; y += gridPx) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke(); }

  let cx, cy;

  if (assemblyContext === 'header') {
    // Header Context: Section View
    // Origin is at bottom center. Draw a box representing the opening below.
    cx = canvas.width / 2;
    cy = canvas.height * 0.7;

    // Draw Opening Box (Below origin)
    ctx.fillStyle = openingFill;
    ctx.fillRect(cx - 100, cy, 200, canvas.height - cy);
    ctx.strokeStyle = openingStroke;
    ctx.strokeRect(cx - 100, cy, 200, canvas.height - cy);
    ctx.fillStyle = labelColorStrong;
    ctx.font = '12px var(--font-sans)';
    ctx.textAlign = 'center';
    ctx.fillText("OPENING", cx, cy + 30);

  } else if (assemblyContext === 'king') {
    // King Context: Plan View
    // Origin is at right edge, center vertically. Draw box representing opening to the right.
    cx = canvas.width * 0.4;
    cy = canvas.height / 2;

    // Draw Opening Box (To the right of origin)
    ctx.fillStyle = openingFill;
    ctx.fillRect(cx, cy - 100, canvas.width - cx, 200);
    ctx.strokeStyle = openingStroke;
    ctx.strokeRect(cx, cy - 100, canvas.width - cx, 200);
    ctx.fillStyle = labelColorStrong;
    ctx.font = '12px var(--font-sans)';
    ctx.textAlign = 'center';
    ctx.fillText("OPENING", cx + 60, cy);
  } else {
    // Join Context (l_join or t_join): Plan View
    cx = canvas.width * 0.6;
    cy = canvas.height / 2;

    const t_cont = 92.08;
    const t_stop = 92.08;
    const cont_ext_finish = 15;
    const cont_int_finish = 15;
    const stop_ext_finish = 15;
    const stop_int_finish = 15;

    const t_cont_px = t_cont * scale;
    const t_stop_px = t_stop * scale;
    const cont_ext_finish_px = cont_ext_finish * scale;
    const cont_int_finish_px = cont_int_finish * scale;
    const stop_ext_finish_px = stop_ext_finish * scale;
    const stop_int_finish_px = stop_int_finish * scale;

    // 1. Draw Continuing Wall (vertical box)
    ctx.fillStyle = wallFill;
    ctx.strokeStyle = wallStroke;
    if (assemblyContext === 'l_join') {
      const start_y = cy - t_stop_px / 2 - stop_ext_finish_px;
      ctx.fillRect(cx - t_cont_px / 2, start_y, t_cont_px, canvas.height - start_y);
      ctx.strokeRect(cx - t_cont_px / 2, start_y, t_cont_px, canvas.height - start_y);
    } else {
      ctx.fillRect(cx - t_cont_px / 2, 0, t_cont_px, canvas.height);
      ctx.strokeRect(cx - t_cont_px / 2, 0, t_cont_px, canvas.height);
    }

    // Draw Continuing Wall Finish Layers
    if (cont_ext_finish_px > 0) {
      ctx.fillStyle = finishFill;
      ctx.strokeStyle = finishStroke;
      const start_y = (assemblyContext === 'l_join') ? (cy - t_stop_px / 2 - stop_ext_finish_px) : 0;
      ctx.fillRect(cx - t_cont_px / 2 - cont_ext_finish_px, start_y, cont_ext_finish_px, canvas.height - start_y);
      ctx.strokeRect(cx - t_cont_px / 2 - cont_ext_finish_px, start_y, cont_ext_finish_px, canvas.height - start_y);
    }
    if (cont_int_finish_px > 0) {
      ctx.fillStyle = finishFill;
      ctx.strokeStyle = finishStroke;
      const start_y = (assemblyContext === 'l_join') ? (cy - t_stop_px / 2) : 0;
      ctx.fillRect(cx + t_cont_px / 2, start_y, cont_int_finish_px, canvas.height - start_y);
      ctx.strokeRect(cx + t_cont_px / 2, start_y, cont_int_finish_px, canvas.height - start_y);
    }

    // Draw continuing wall label
    ctx.fillStyle = labelColor;
    ctx.font = '10px var(--font-sans)';
    ctx.save();
    ctx.translate(cx + t_cont_px / 2 + cont_int_finish_px + 15, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText("CONTINUING WALL", 0, 0);
    ctx.restore();

    // 2. Draw Stopped Wall (horizontal box ending at continuing wall left face)
    const stop_end_px = cx - t_cont_px / 2;
    ctx.fillStyle = wallFill;
    ctx.fillRect(0, cy - t_stop_px / 2, stop_end_px, t_stop_px);
    ctx.strokeStyle = wallStroke;
    ctx.strokeRect(0, cy - t_stop_px / 2, stop_end_px, t_stop_px);

    // Draw Stopped Wall Finish Layers
    if (stop_ext_finish_px > 0) {
      ctx.fillStyle = finishFill;
      ctx.strokeStyle = finishStroke;
      ctx.fillRect(0, cy - t_stop_px / 2 - stop_ext_finish_px, stop_end_px - cont_ext_finish_px, stop_ext_finish_px);
      ctx.strokeRect(0, cy - t_stop_px / 2 - stop_ext_finish_px, stop_end_px - cont_ext_finish_px, stop_ext_finish_px);
    }
    if (stop_int_finish_px > 0) {
      ctx.fillStyle = finishFill;
      ctx.strokeStyle = finishStroke;
      ctx.fillRect(0, cy + t_stop_px / 2, stop_end_px, stop_int_finish_px);
      ctx.strokeRect(0, cy + t_stop_px / 2, stop_end_px, stop_int_finish_px);
    }

    // Draw stopped wall label
    ctx.fillStyle = labelColorStrong;
    ctx.font = '10px var(--font-sans)';
    ctx.textAlign = 'center';
    ctx.fillText("STOPPED WALL", stop_end_px / 2, cy - t_stop_px / 2 - stop_ext_finish_px - 10);
  }

  // Draw Origin Crosshair
  ctx.strokeStyle = crosshairColor;
  ctx.beginPath(); ctx.moveTo(cx - 30, cy); ctx.lineTo(cx + 30, cy); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy - 30); ctx.lineTo(cx, cy + 30); ctx.stroke();

  currentAssemblyMembers.forEach((m, idx) => {
    const dims = getMemberDims(m);
    const d = dims.d * scale;
    const f = dims.f * scale;
    const lip = 10 * scale;

    const rot = (parseFloat(m.rotation) || 0) % 360;
    const rotMod = Math.abs(rot) % 360;

    const ox = (parseFloat(m.offset_x) || 0) * scale;
    const oy = (parseFloat(m.offset_y) || 0) * scale;

    let m_w = (assemblyContext === 'header') ? d : f;
    let m_h = (assemblyContext === 'header') ? f : d;
    if (rotMod === 90 || rotMod === 270) {
      const tmp = m_w; m_w = m_h; m_h = tmp;
    }

    m._render = { cx: 0, cy: 0, w: m_w, h: m_h };

    ctx.save();

    if (assemblyContext === 'header') {
      m._render.cx = cx + ox;
      m._render.cy = cy - oy - (m_h / 2);
    } else if (assemblyContext === 'king') {
      m._render.cx = cx - ox - (m_w / 2);
      m._render.cy = cy - oy;
    } else {
      // L-Join or T-Join plan coordinates
      const isStopped = m.wall !== 'continue';
      if (isStopped) {
        const t_c = 92.08;
        const stop_end_px = cx - (t_c * scale) / 2;
        m._render.cx = stop_end_px - ox;
        m._render.cy = cy - oy;
      } else {
        m._render.cx = cx + oy;
        m._render.cy = cy + ox;
      }
    }
    ctx.translate(m._render.cx, m._render.cy);

    ctx.rotate(rot * Math.PI / 180);

    const isInteracting = (idx === draggingAssemblyMemberIdx) || (idx === hoveredAssemblyMemberIdx);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#007fff';
    ctx.strokeStyle = isInteracting ? accent : (dims.t === 'track' ? '#fc8181' : '#4299e1');
    if (isInteracting) {
      ctx.shadowColor = accent;
      ctx.shadowBlur = 10;
    }

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    const lw = 3;
    const hd = (d - lw) / 2;
    const hf = (f - lw) / 2;
    const hlip = 10 * scale;

    if (assemblyContext === 'header') {
      // Header base shape (rot=0): Web at BOTTOM. Width = d (thickness), Height = f (elevation).
      if (dims.t === 'track') {
        ctx.moveTo(-hd, -hf); ctx.lineTo(-hd, hf); ctx.lineTo(hd, hf); ctx.lineTo(hd, -hf);
      } else {
        // C-Stud (web at bottom, flanges pointing up)
        ctx.moveTo(-hd + hlip, -hf);
        ctx.lineTo(-hd, -hf);
        ctx.lineTo(-hd, hf);
        ctx.lineTo(hd, hf);
        ctx.lineTo(hd, -hf);
        ctx.lineTo(hd - hlip, -hf);
      }
    } else {
      // King / Join base shape (rot=0): Web at RIGHT. Width = f (along wall), Height = d (wall thickness).
      if (dims.t === 'track') {
        ctx.moveTo(-hf, -hd); ctx.lineTo(hf, -hd); ctx.lineTo(hf, hd); ctx.lineTo(-hf, hd);
      } else {
        // C-Stud (web at right, flanges pointing left)
        ctx.moveTo(-hf, -hd + hlip);
        ctx.lineTo(-hf, -hd);
        ctx.lineTo(hf, -hd);
        ctx.lineTo(hf, hd);
        ctx.lineTo(-hf, hd);
        ctx.lineTo(-hf, hd - hlip);
      }
    }

    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '10px var(--font-mono)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(idx + 1, 0, 0);

    ctx.restore();
  });

  // Draw snap guides
  if (window.snapGuides && window.snapGuides.length > 0) {
    ctx.save();
    const guideColor = isLight ? '#005cbc' : '#ecc94b';
    ctx.strokeStyle = guideColor;
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;

    // Draw lines
    window.snapGuides.forEach(g => {
      ctx.beginPath();
      if (g.type === 'v') { ctx.moveTo(g.pos, 0); ctx.lineTo(g.pos, canvas.height); }
      else { ctx.moveTo(0, g.pos); ctx.lineTo(canvas.width, g.pos); }
      ctx.stroke();
    });

    // Draw text labels
    if (draggingAssemblyMemberIdx !== -1) {
      const m = safeGet(currentAssemblyMembers, draggingAssemblyMemberIdx);
      ctx.fillStyle = guideColor;
      ctx.font = '10px var(--font-sans)';
      window.snapGuides.forEach(g => {
        let label = '';
        if (g.type === 'v') {
          label = getAlignLabelX(m);
          ctx.textAlign = 'left';
          ctx.fillText(`Snap X: ${label}`, g.pos + 5, 20);
        } else {
          label = getAlignLabelY(m);
          ctx.textAlign = 'left';
          ctx.fillText(`Snap Y: ${label}`, 10, g.pos - 5);
        }
      });
    }

    ctx.restore();
  }
}

// --- Drag & Drop for Assembly Canvas ---
let draggingAssemblyMemberIdx = -1;
let hoveredAssemblyMemberIdx = -1;
let assmDragStartX = 0, assmDragStartY = 0;

function getAssmMousePos(evt) {
  const r = getEl('assemblyCanvas').getBoundingClientRect();
  return { x: evt.clientX - r.left, y: evt.clientY - r.top };
}

getEl('assemblyCanvas').addEventListener('mousemove', (evt) => {
  const pos = getAssmMousePos(evt);
  const scale = 2.0;

  if (draggingAssemblyMemberIdx !== -1) {
    const dx = pos.x - assmDragStartX;
    const dy = pos.y - assmDragStartY;
    assmDragStartX = pos.x;
    assmDragStartY = pos.y;

    const m = safeGet(currentAssemblyMembers, draggingAssemblyMemberIdx);
    if (m._rawOx === undefined) m._rawOx = parseFloat(m.offset_x) || 0;
    if (m._rawOy === undefined) m._rawOy = parseFloat(m.offset_y) || 0;

    if (assemblyContext === 'header') {
      m._rawOx += (dx / scale);
      m._rawOy -= (dy / scale);
    } else if (assemblyContext === 'king') {
      m._rawOx -= (dx / scale);
      m._rawOy -= (dy / scale);
    } else {
      const isStopped = m.wall !== 'continue';
      if (isStopped) {
        m._rawOx -= (dx / scale);
        m._rawOy -= (dy / scale);
      } else {
        m._rawOx += dy / scale;
        m._rawOy += (dx / scale);
      }
    }

    // Snapping Logic
    const dims = getMemberDims(m);
    const d = dims.d * scale, f = dims.f * scale;
    const rotMod = Math.abs(parseFloat(m.rotation) || 0) % 360;
    let m_w = (assemblyContext === 'header') ? d : f;
    let m_h = (assemblyContext === 'header') ? f : d;
    if (rotMod === 90 || rotMod === 270) {
      const tmp = m_w; m_w = m_h; m_h = tmp;
    }

    const canvas = getEl('assemblyCanvas');
    let base_cx, base_cy;
    if (assemblyContext === 'l_join' || assemblyContext === 't_join') {
      base_cx = canvas.width * 0.6;
      base_cy = canvas.height / 2;
    } else {
      base_cx = assemblyContext === 'header' ? canvas.width / 2 : canvas.width * 0.4;
      base_cy = assemblyContext === 'header' ? canvas.height * 0.7 : canvas.height / 2;
    }

    if (assemblyContext === 'header') {
      cx = base_cx + (m._rawOx * scale);
      cy = base_cy - (m._rawOy * scale) - (m_h / 2);
    } else if (assemblyContext === 'king') {
      cx = base_cx - (m._rawOx * scale) - (m_w / 2);
      cy = base_cy - (m._rawOy * scale);
    } else {
      const isStopped = m.wall !== 'continue';
      if (isStopped) {
        const t_c = 92.08;
        const stop_end_px = base_cx - (t_c * scale) / 2;
        cx = stop_end_px - (m._rawOx * scale);
        cy = base_cy - (m._rawOy * scale);
      } else {
        cx = base_cx + (m._rawOy * scale);
        cy = base_cy + m._rawOx * scale;
      }
    }

    const m_left = cx - m_w / 2, m_right = cx + m_w / 2;
    const m_top = cy - m_h / 2, m_bottom = cy + m_h / 2;

    let snapX = [base_cx], snapY = [base_cy];
    if (assemblyContext === 'l_join' || assemblyContext === 't_join') {
      const t_c_cont = 92.08;
      const t_c_stop = 92.08;
      const c_ext_f = 15;
      const c_int_f = 15;
      const s_ext_f = 15;
      const s_int_f = 15;

      const t_c_cont_px = t_c_cont * scale;
      const t_c_stop_px = t_c_stop * scale;
      const c_ext_f_px = c_ext_f * scale;
      const c_int_f_px = c_int_f * scale;
      const s_ext_f_px = s_ext_f * scale;
      const s_int_f_px = s_int_f * scale;

      snapX.push(base_cx - t_c_cont_px / 2, base_cx + t_c_cont_px / 2);
      if (c_ext_f_px > 0) snapX.push(base_cx - t_c_cont_px / 2 - c_ext_f_px);
      if (c_int_f_px > 0) snapX.push(base_cx + t_c_cont_px / 2 + c_int_f_px);

      snapY.push(base_cy - t_c_stop_px / 2, base_cy + t_c_stop_px / 2);
      if (s_ext_f_px > 0) snapY.push(base_cy - t_c_stop_px / 2 - s_ext_f_px);
      if (s_int_f_px > 0) snapY.push(base_cy + t_c_stop_px / 2 + s_int_f_px);

      const stop_end_px = base_cx - t_c_cont_px / 2;
      snapX.push(stop_end_px);
    }

    currentAssemblyMembers.forEach((other, idx) => {
      if (idx === draggingAssemblyMemberIdx || !other._render) return;
      const r = other._render;
      snapX.push(r.cx); snapY.push(r.cy);
      snapX.push(r.cx - r.w / 2, r.cx + r.w / 2);
      snapY.push(r.cy - r.h / 2, r.cy + r.h / 2);
    });

    const SNAP_DIST = 10;
    let bestDx = SNAP_DIST, bestDy = SNAP_DIST;
    let snapTargetX = null, snapTargetY = null;

    [cx, m_left, m_right].forEach(mx => {
      snapX.forEach(sx => {
        if (Math.abs(mx - sx) < Math.abs(bestDx)) { bestDx = mx - sx; snapTargetX = sx; }
      });
    });

    [cy, m_top, m_bottom].forEach(my => {
      snapY.forEach(sy => {
        if (Math.abs(my - sy) < Math.abs(bestDy)) { bestDy = my - sy; snapTargetY = sy; }
      });
    });

    if (snapTargetX !== null) cx -= bestDx;
    if (snapTargetY !== null) cy -= bestDy;

    let new_ox, new_oy;
    if (assemblyContext === 'header') {
      new_ox = (cx - base_cx) / scale;
      new_oy = (base_cy - cy - (m_h / 2)) / scale;
    } else if (assemblyContext === 'king') {
      new_ox = (base_cx - cx - (m_w / 2)) / scale;
      new_oy = (base_cy - cy) / scale;
    } else {
      const isStopped = m.wall !== 'continue';
      if (isStopped) {
        const t_c = 92.08;
        const stop_end_px = base_cx - (t_c * scale) / 2;
        new_ox = (stop_end_px - cx) / scale;
        new_oy = (base_cy - cy) / scale;
      } else {
        new_ox = (assemblyContext === 'l_join' ? (cy - base_cy) : (base_cy - cy)) / scale;
        new_oy = (cx - base_cx) / scale;
      }
    }

    m.offset_x = parseFloat(new_ox.toFixed(2));
    m.offset_y = parseFloat(new_oy.toFixed(2));

    if (assemblyContext === 'l_join' || assemblyContext === 't_join') {
      delete m.align_x_target;
      delete m.align_y_target;
      initializeMemberAlignments(m, m.wall);
      computeMemberOffsetsFromAlignments(m, m.wall);
    }

    window.snapGuides = [];
    if (snapTargetX !== null) window.snapGuides.push({ type: 'v', pos: snapTargetX });
    if (snapTargetY !== null) window.snapGuides.push({ type: 'h', pos: snapTargetY });

    renderAssemblyCanvas();
    return;
  }

  // Hover detection
  let hit = -1;
  for (let i = currentAssemblyMembers.length - 1; i >= 0; i--) {
    const r = safeGet(currentAssemblyMembers, i)._render;
    if (!r) continue;
    const radius = Math.max(r.w, r.h) / 2;
    const dist = Math.hypot(pos.x - r.cx, pos.y - r.cy);
    if (dist <= radius + 5) { hit = i; break; }
  }

  if (hit !== hoveredAssemblyMemberIdx) {
    hoveredAssemblyMemberIdx = hit;
    getEl('assemblyCanvas').style.cursor = hit !== -1 ? 'grab' : 'default';
    renderAssemblyCanvas();
  }
});

getEl('assemblyCanvas').addEventListener('mousedown', (evt) => {
  if (hoveredAssemblyMemberIdx !== -1) {
    draggingAssemblyMemberIdx = hoveredAssemblyMemberIdx;
    const pos = getAssmMousePos(evt);
    assmDragStartX = pos.x;
    assmDragStartY = pos.y;

    const m = safeGet(currentAssemblyMembers, draggingAssemblyMemberIdx);
    m._rawOx = parseFloat(m.offset_x) || 0;
    m._rawOy = parseFloat(m.offset_y) || 0;

    getEl('assemblyCanvas').style.cursor = 'grabbing';
    renderAssemblyCanvas();
  }
});

getEl('assemblyCanvas').addEventListener('mouseup', () => {
  let wasDragging = false;
  if (draggingAssemblyMemberIdx !== -1) {
    const m = safeGet(currentAssemblyMembers, draggingAssemblyMemberIdx);
    delete m._rawOx; delete m._rawOy;
    wasDragging = true;
  }
  draggingAssemblyMemberIdx = -1;
  window.snapGuides = [];
  getEl('assemblyCanvas').style.cursor = hoveredAssemblyMemberIdx !== -1 ? 'grab' : 'default';

  if (wasDragging) {
    renderAssemblyMembers(); // Update DOM inputs with final offset values
  } else {
    renderAssemblyCanvas();
  }
});

getEl('assemblyCanvas').addEventListener('mouseleave', () => {
  let wasDragging = false;
  if (draggingAssemblyMemberIdx !== -1) {
    const m = safeGet(currentAssemblyMembers, draggingAssemblyMemberIdx);
    delete m._rawOx; delete m._rawOy;
    wasDragging = true;
  }
  draggingAssemblyMemberIdx = -1;
  hoveredAssemblyMemberIdx = -1;
  window.snapGuides = [];

  if (wasDragging) {
    renderAssemblyMembers(); // Update DOM
  } else {
    renderAssemblyCanvas();
  }
});

// Join Manager Metadata
const STANDARD_JOINS_META = {
  // L-Joins
  'L10': {
    type: 'L',
    title: 'L10 (Stop at Core Face)',
    desc: 'Stopped wall centerline terminates flush with the continuing wall\'s core interior face.',
  },
  'L11': {
    type: 'L',
    title: 'L11 (Stop at Finish Face)',
    desc: 'Stopped wall centerline terminates flush with the continuing wall\'s outermost finish layer (drywall).',
  },
  'L12': {
    type: 'L',
    title: 'L12 (Core Face + Extra Stud)',
    desc: 'Stopped wall ends at core face, and a single backing stud is placed inside the continuing wall aligned to the stopped wall\'s interior core boundary.',
  },
  'L13': {
    type: 'L',
    title: 'L13 (Finish Face + Extra Stud)',
    desc: 'Stopped wall ends at core face, and a single backing stud is placed inside the continuing wall aligned to the stopped wall\'s finish boundary.',
  },
  'L14': {
    type: 'L',
    title: 'L14 (Core Face + Back-to-Back Studs)',
    desc: 'Stopped wall ends at core face, and two back-to-back backing studs are placed inside the continuing wall with webs touching.',
  },
  'L15': {
    type: 'L',
    title: 'L15 (Rotated Backing Stud)',
    desc: 'Stopped wall ends at core face, and a rotated backing stud is placed inside the continuing wall with flanges pointing inward.',
  },

  // T-Joins
  'T10': {
    type: 'T',
    title: 'T10 (Standard)',
    desc: 'Stopped wall core terminates at continuing wall core face. No extra backing studs.',
  },
  'T11': {
    type: 'T',
    title: 'T11 (Double Backing Studs)',
    desc: 'Adds two backing studs flanking the stopped wall centerline in the continuing wall.',
  },
  'T12': {
    type: 'T',
    title: 'T12 (Double Backing + Mirrored Stud)',
    desc: 'Adds T11 backing studs plus a third mirrored stud in the continuing wall oriented back-to-back with the stopped wall end stud.',
  }
};

function getJoinPreviewSvg(styleName) {
  let name = styleName;
  if (name === 'standard_l') name = 'L10';
  if (name === 'standard_t') name = 'T10';

  const staticImages = ['L10', 'L11', 'L12', 'L13', 'L14', 'L15', 'T10', 'T11', 'T12'];
  if (staticImages.includes(name)) {
    return '<img src="/join-previews/' + escapeHtml(name) + '.svg" style="width:100%; height:100%; object-fit:contain; background:var(--bg-input); border-radius:4px; display:block;" />';
  }

  if (name.startsWith('L')) {
    const baseSvg = `<svg width="100%" height="100%" viewBox="0 0 70 70" style="background: var(--bg-input); border-radius: 4px; display: block;">`;
    const endSvg = `</svg>`;
    let stoppedWallYStart = 46;
    if (name === 'L11') {
      stoppedWallYStart = 51;
    }

    let contBottomFinishXStart = (name === 'L11') ? 51 : 46;

    let svgContent = `
      <!-- Wall Core Intersection Areas -->
      <!-- Continuing Wall Core -->
      <rect x="10" y="10" width="120" height="36" fill="var(--bg-panel)" stroke="var(--border-color)" stroke-width="2" rx="2"/>
      <!-- Stopped Wall Core -->
      <rect x="10" y="${stoppedWallYStart}" width="36" height="${110 - stoppedWallYStart}" fill="var(--bg-panel)" stroke="var(--border-color)" stroke-width="2" rx="2"/>
      
      <!-- Finish Layers (Gyp) -->
      <!-- Continuing Wall Top Finish -->
      <rect x="5" y="5" width="125" height="5" fill="var(--text-secondary)" opacity="0.25"/>
      <!-- Continuing Wall Bottom Finish -->
      <rect x="${contBottomFinishXStart}" y="46" width="${130 - contBottomFinishXStart}" height="5" fill="var(--text-secondary)" opacity="0.25"/>
      <!-- Stopped Wall Left Finish -->
      <rect x="5" y="${stoppedWallYStart}" width="5" height="${110 - stoppedWallYStart}" fill="var(--text-secondary)" opacity="0.25"/>
      <!-- Stopped Wall Right Finish -->
      <rect x="46" y="51" width="5" height="59" fill="var(--text-secondary)" opacity="0.25"/>
      
      <!-- Alignment Guides -->
      <line x1="10" y1="46" x2="46" y2="46" stroke="var(--text-muted)" stroke-dasharray="3,3" stroke-width="1"/>
      <line x1="46" y1="10" x2="46" y2="46" stroke="var(--text-muted)" stroke-dasharray="3,3" stroke-width="1"/>

      <!-- Regular Studs -->
      <!-- Continuing wall end stud -->
      <path d="M 24 14 H 14 V 42 H 24 V 39" fill="none" stroke="var(--text-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- Stopped wall end stud -->
      <path d="M 14 62 V 52 H 42 V 62 H 39" fill="none" stroke="var(--text-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    `;

    if (name === 'L12') {
      svgContent += `
        <!-- Extra Stud (L12) - Rotated and Pushed Flush to Core -->
        <path d="M 46 21 V 18 H 36 V 46 H 46 V 43" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    } else if (name === 'L13') {
      svgContent += `
        <!-- Extra Stud (L13) - Rotated and Pushed Flush to Core -->
        <path d="M 51 21 V 18 H 41 V 46 H 51 V 43" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    } else if (name === 'L14') {
      svgContent += `
        <!-- Left Extra Stud (L14) - Pushed Flush to Core -->
        <path d="M 36 21 V 18 H 46 V 46 H 36 V 43" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <!-- Right Extra Stud (L14) - Pushed Flush to Core -->
        <path d="M 56 21 V 18 H 46 V 46 H 56 V 43" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    } else if (name === 'L15') {
      svgContent += `
        <!-- Rotated Backing Stud (L15) - Pushed Flush to Core -->
        <path d="M 36 21 V 18 H 46 V 46 H 36 V 43" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    }

    return baseSvg + svgContent + endSvg;

  } else if (name.startsWith('T')) {
    const baseSvg = `<svg width="100%" height="100%" viewBox="25 0 80 80" style="background: var(--bg-input); border-radius: 4px; display: block;">`;
    const endSvg = `</svg>`;

    let svgContent = `
      <!-- Wall Core Intersection Areas -->
      <!-- Continuing Wall Core -->
      <rect x="5" y="10" width="120" height="36" fill="var(--bg-panel)" stroke="var(--border-color)" stroke-width="2" rx="2"/>
      <!-- Stopped Wall Core -->
      <rect x="47" y="46" width="36" height="64" fill="var(--bg-panel)" stroke="var(--border-color)" stroke-width="2" rx="2"/>
      
      <!-- Finish Layers (Gyp) -->
      <!-- Continuing Wall Top Finish -->
      <rect x="5" y="5" width="120" height="5" fill="var(--text-secondary)" opacity="0.25"/>
      <!-- Continuing Wall Bottom Finish Left -->
      <rect x="5" y="46" width="42" height="5" fill="var(--text-secondary)" opacity="0.25"/>
      <!-- Continuing Wall Bottom Finish Right -->
      <rect x="83" y="46" width="42" height="5" fill="var(--text-secondary)" opacity="0.25"/>
      <!-- Stopped Wall Left Finish -->
      <rect x="42" y="46" width="5" height="64" fill="var(--text-secondary)" opacity="0.25"/>
      <!-- Stopped Wall Right Finish -->
      <rect x="83" y="46" width="5" height="64" fill="var(--text-secondary)" opacity="0.25"/>
      
      <!-- Alignment Guides -->
      <line x1="47" y1="46" x2="83" y2="46" stroke="var(--text-muted)" stroke-dasharray="3,3" stroke-width="1"/>

      <!-- Regular Studs -->
      <!-- Stopped wall end stud -->
      <path d="M 50 62 V 52 H 80 V 62 H 77" fill="none" stroke="var(--text-secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    `;

    if (name === 'T11') {
      svgContent += `
        <!-- Left Flanking Backing Stud - Pushed Flush to Core -->
        <path d="M 37 21 V 18 H 47 V 46 H 37 V 43" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <!-- Right Flanking Backing Stud - Pushed Flush to Core -->
        <path d="M 93 21 V 18 H 83 V 46 H 93 V 43" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    } else if (name === 'T12') {
      svgContent += `
        <!-- Left Flanking Backing Stud - Pushed Flush to Core -->
        <path d="M 37 21 V 18 H 47 V 46 H 37 V 43" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <!-- Right Flanking Backing Stud - Pushed Flush to Core -->
        <path d="M 93 21 V 18 H 83 V 46 H 93 V 43" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <!-- Mirrored Backing Stud - Back-to-Back Pushed Flush to Core -->
        <path d="M 53 36 H 50 V 46 H 80 V 36 H 77" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      `;
    }

    return baseSvg + svgContent + endSvg;
  }

  const defaultSvg = `<svg width="100%" height="100%" viewBox="0 0 130 110" style="background: var(--bg-input); border-radius: 4px; display: block;">`;
  const defaultEndSvg = `</svg>`;
  return defaultSvg + `
    <text x="65" y="55" dominant-baseline="middle" text-anchor="middle" fill="var(--text-secondary)" font-size="12" font-family="sans-serif">Custom Layout</text>
    <rect x="15" y="15" width="100" height="80" fill="none" stroke="var(--border-color)" stroke-dasharray="4" stroke-width="1.5" rx="4"/>
  ` + defaultEndSvg;
}

function openJoinManager(joinType, currentValue, onSelectCallback) {
  const modal = getEl('joinManagerModal');
  const grid = getEl('joinManagerGrid');
  if (!modal || !grid) return;

  grid.innerHTML = '';

  let normalizedCurrentVal = currentValue;
  if (normalizedCurrentVal === 'standard_l') normalizedCurrentVal = 'L10';
  if (normalizedCurrentVal === 'standard_t') normalizedCurrentVal = 'T10';

  const renderSection = (title, typeKey) => {
    const sectionWrapper = document.createElement('div');
    sectionWrapper.className = 'join-manager-section-group';
    sectionWrapper.style.display = 'flex';
    sectionWrapper.style.flexDirection = 'column';
    sectionWrapper.style.gap = '8px';

    const header = document.createElement('div');
    header.style.fontSize = '12px';
    header.style.fontWeight = '700';
    header.style.color = 'var(--accent)';
    header.style.borderBottom = '1px solid var(--border-color)';
    header.style.paddingBottom = '4px';
    header.style.textTransform = 'uppercase';
    header.style.letterSpacing = '0.5px';
    header.style.textAlign = 'left';
    header.innerText = title;
    sectionWrapper.appendChild(header);

    const subGrid = document.createElement('div');
    subGrid.className = 'join-manager-grid';

    const entries = Object.entries(STANDARD_JOINS_META).filter(([key, meta]) => meta.type === typeKey);

    entries.forEach(([styleKey, meta]) => {
      const isActive = (styleKey === normalizedCurrentVal);
      const card = document.createElement('div');
      card.className = `join-card ${isActive ? 'active' : ''}`;

      card.addEventListener('click', () => {
        grid.querySelectorAll('.join-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');

        let valToSet = styleKey;
        if (styleKey === 'L10') valToSet = 'standard_l';
        if (styleKey === 'T10') valToSet = 'T10';

        onSelectCallback(valToSet);
        modal.classList.add('hidden');
      });

      card.addEventListener('dblclick', () => {
        let valToSet = styleKey;
        if (styleKey === 'L10') valToSet = 'standard_l';
        if (styleKey === 'T10') valToSet = 'T10';
        onSelectCallback(valToSet);
        modal.classList.add('hidden');
      });

      const previewSvg = getJoinPreviewSvg(styleKey);

      card.innerHTML = 
        '<div class="join-card-title">' + escapeHtml(meta.title) + '</div>' +
        '<div class="join-card-preview">' + previewSvg + '</div>' +
        '<div class="join-card-desc">' + escapeHtml(meta.desc) + '</div>';

      subGrid.appendChild(card);
    });

    sectionWrapper.appendChild(subGrid);
    grid.appendChild(sectionWrapper);
  };

  if (joinType === 'L') {
    renderSection('L-Join Corner Styles', 'L');
  } else if (joinType === 'T') {
    renderSection('T-Join Tee Styles', 'T');
  } else {
    renderSection('L-Join Corner Styles', 'L');
    renderSection('T-Join Tee Styles', 'T');
  }

  modal.classList.remove('hidden');
}

function triggerSelectedJoinManager() {
  const selectEl = getEl('join_style_override');
  if (!selectEl) return;
  const currentVal = selectEl.value;

  let joinType = 'both';
  if (state.selectedJoins && state.selectedJoins.length > 0) {
    const allL = state.selectedJoins.every(j => j.join_type === 'L');
    const allT = state.selectedJoins.every(j => j.join_type === 'T');
    if (allL) joinType = 'L';
    else if (allT) joinType = 'T';
  }

  openJoinManager(joinType, currentVal, (selectedStyle) => {
    selectEl.value = selectedStyle;
    selectEl.dispatchEvent(new Event('change'));
  });
}

function triggerProjectJoinManager() {
  openJoinManager('both', '', (selectedStyle) => {
    // Pure reference mode - no-op click callback
    console.log("Selected reference style:", selectedStyle);
  });
}

// Make these available globally for onclick handlers
window.openAssemblyBuilder = openAssemblyBuilder;
window.openJoinManager = openJoinManager;
window.triggerSelectedJoinManager = triggerSelectedJoinManager;
window.triggerProjectJoinManager = triggerProjectJoinManager;
window.removeAssemblyMember = function (idx) {
  currentAssemblyMembers.splice(idx, 1);
  renderAssemblyMembers();
};
window.updateAssemblyMember = function (idx, key, val) {
  safeSet(safeGet(currentAssemblyMembers, idx), key, val);
  if (assemblyContext === 'l_join' || assemblyContext === 't_join') {
    if (key === 'wall' || key === 'rotation' || key === 'source' || key === 'type' || key === 'depth_mm' || key === 'flange_mm') {
      Reflect.deleteProperty(safeGet(currentAssemblyMembers, idx), 'align_x_target');
      Reflect.deleteProperty(safeGet(currentAssemblyMembers, idx), 'align_y_target');
    }
  }
  if (key === 'source' && val === 'revit') {
    showRevitProfileSelector('any', (profile) => {
      safeSet(safeGet(currentAssemblyMembers, idx), 'depth_mm', profile.depth_mm);
      safeSet(safeGet(currentAssemblyMembers, idx), 'flange_mm', profile.flange_mm);
      safeSet(safeGet(currentAssemblyMembers, idx), 'gauge_mm', profile.gauge_mm);
      safeSet(safeGet(currentAssemblyMembers, idx), 'type', profile.type);
      safeSet(safeGet(currentAssemblyMembers, idx), 'designation', profile.designation);
      safeSet(safeGet(currentAssemblyMembers, idx), 'familyName', profile.familyName);
      if (assemblyContext === 'l_join' || assemblyContext === 't_join') {
        Reflect.deleteProperty(safeGet(currentAssemblyMembers, idx), 'align_x_target');
        Reflect.deleteProperty(safeGet(currentAssemblyMembers, idx), 'align_y_target');
      }
      renderAssemblyMembers();
    });
  } else {
    renderAssemblyMembers(); // Re-render to update canvas
  }
};

window.selectAssemblyMemberRevitProfile = function (idx) {
  showRevitProfileSelector('any', (profile) => {
    safeSet(safeGet(currentAssemblyMembers, idx), 'depth_mm', profile.depth_mm);
    safeSet(safeGet(currentAssemblyMembers, idx), 'flange_mm', profile.flange_mm);
    safeSet(safeGet(currentAssemblyMembers, idx), 'gauge_mm', profile.gauge_mm);
    safeSet(safeGet(currentAssemblyMembers, idx), 'type', profile.type);
    safeSet(safeGet(currentAssemblyMembers, idx), 'designation', profile.designation);
    safeSet(safeGet(currentAssemblyMembers, idx), 'familyName', profile.familyName);
    renderAssemblyMembers();
  });
};

getEl('btnSaveAssembly').addEventListener('click', () => {
  const name = getEl('assemblyName').value.trim();
  if (!name) { showToast("Please provide an assembly name."); return; }
  if (currentAssemblyMembers.length === 0) { showToast("Please add at least one member."); return; }

  if (!state.configRaw) state.configRaw = {};

  let dictKey;
  if (assemblyContext === 'header') dictKey = 'custom_headers';
  else if (assemblyContext === 'king') dictKey = 'custom_kings';
  else if (assemblyContext === 'l_join') dictKey = 'custom_l_joins';
  else if (assemblyContext === 't_join') dictKey = 'custom_t_joins';

  if (!safeGet(state.configRaw, dictKey)) safeSet(state.configRaw, dictKey, {});

  // Ensure we set offset_z appropriately based on context (x visual maps to z depth for headers)
  currentAssemblyMembers.forEach(m => {
    if (assemblyContext === 'header') {
      m.offset_z = m.offset_x || 0;
    } else {
      m.offset_z = m.offset_y || 0;
    }
  });

  const targetCid = state.currentProjectCompanyId || window.currentCompanyId;
  const assemblyData = (assemblyContext === 'l_join' || assemblyContext === 't_join') ? {
    members: currentAssemblyMembers,
    vis_thickness: 92.08,
    vis_ext_finish: 15.0,
    vis_int_finish: 15.0
  } : currentAssemblyMembers;

  if (assemblyContext === 'l_join' || assemblyContext === 't_join') {
    safeSet(safeGet(state.configRaw, dictKey), name, assemblyData);
  } else {
    safeSet(safeGet(state.configRaw, dictKey), name, currentAssemblyMembers);
  }

  // Save to Firestore globally for the company
  projectsDB.saveCustomAssembly(assemblyContext, name, assemblyData, targetCid)
    .then(() => {
      console.log(`Successfully saved custom assembly ${assemblyContext}_${name} to Firestore`);
    })
    .catch(err => {
      console.error("Failed to save custom assembly to Firestore:", err);
    });

  // If saving custom join style, update active join style select
  if (assemblyContext === 'l_join') {
    // Do not set default style, do not mark wall custom
  } else if (assemblyContext === 't_join') {
    // Do not set default style, do not mark wall custom
  } else {
    markWallCustom();
  }

  populateRules(state.configRaw); // Re-render rules dropdowns and library to include it
  closeAssemblyBuilder();

  let contextLabel = "Header";
  if (assemblyContext === 'king') contextLabel = "King Stud";
  else if (assemblyContext === 'l_join') contextLabel = "L-Join Style";
  else if (assemblyContext === 't_join') contextLabel = "T-Join Style";

  showToast(`Custom ${contextLabel} '${name}' saved! You can now select it from the sidebar config.`);
});

document.addEventListener('DOMContentLoaded', init);

// Called by auth.js after a successful sign-in (and on page reload if session is active).
// All auth-gated startup work lives here so it never runs before a token exists.
window.onAppUserReady = async function () {
  try {
    await loadConfig();
  } catch (e) {
    console.warn('[app] loadConfig failed after auth:', e.message);
  }

  try {
    await projectsDB.init();
    await seedInitialDatabase();
    initDashboard();
    updateSidebarLayout();

    // Check if we can restore navigation state
    let restored = false;
    try {
      const saved = localStorage.getItem('lgsf_navigation_state');
      if (saved) {
        const navState = JSON.parse(saved);
        if (navState && navState.viewType) {
          if (navState.viewType === 'hide' && navState.currentExchangeId) {
            // Restore IDs to state
            state.currentProjectId = navState.currentProjectId;
            state.currentProjectCompanyId = navState.currentProjectCompanyId;
            state.activeExchangeName = navState.activeExchangeName;
            state.activeProjectName = navState.activeProjectName;
            
            // Set breadcrumb title so it displays correctly in UI
            const breadcrumbProjectName = getEl('breadcrumb-project-name');
            if (breadcrumbProjectName && navState.activeProjectName) {
              breadcrumbProjectName.innerText = navState.activeProjectName;
            }

            // Load the exchange option
            try {
              await loadExchangeOption(navState.currentExchangeId);
              restored = true;
            } catch (loadErr) {
              console.warn('[app] Failed to load restored exchange option:', loadErr);
            }
          } else if (navState.viewType === 'exchanges' && navState.currentProjectId) {
            // Restore IDs to state
            state.currentProjectId = navState.currentProjectId;
            state.currentProjectCompanyId = navState.currentProjectCompanyId;
            state.activeProjectName = navState.activeProjectName;

            // Set breadcrumb title so it displays correctly in UI
            const breadcrumbProjectName = getEl('breadcrumb-project-name');
            if (breadcrumbProjectName && navState.activeProjectName) {
              breadcrumbProjectName.innerText = navState.activeProjectName;
            }

            await showDashboard('exchanges');
            restored = true;
          }
        }
      }
    } catch (restoreErr) {
      console.warn('[app] Failed to restore navigation state:', restoreErr);
    }

    if (!restored) {
      await showDashboard('projects');
    }

    // Initialize/Replace the initial history entry to match the active view state
    let initView = 'projects';
    let initParams = {};
    const saved = localStorage.getItem('lgsf_navigation_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.viewType) {
          initView = parsed.viewType;
          initParams = parsed;
        }
      } catch (e) {}
    }
    let initHash = '#projects';
    if (initView === 'exchanges') {
      initHash = `#exchanges-${initParams.currentProjectId}`;
    } else if (initView === 'hide') {
      initHash = `#workspace-${initParams.currentExchangeId}`;
    }
    history.replaceState({
      viewType: initView,
      currentProjectId: state.currentProjectId || null,
      currentProjectCompanyId: state.currentProjectCompanyId || null,
      currentExchangeId: state.currentExchangeId || null,
      activeExchangeName: state.activeExchangeName || null,
      activeProjectName: state.activeProjectName || null
    }, '', initHash);
  } catch (dbErr) {
    console.error('[app] Projects database initialization failed', dbErr);
    const wf = state.wallFiles || [];
    if (wf.length > 0) await loadWalls(wf[0].name);
  }
};


// %%% 3D Viewer Logic %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
let scene3D, camera3D, renderer3D, controls3D;
let raycaster3D, mouse3D;
let is3DInitialized = false;
let camera3DFramed = false; // only auto-frame once per wall load, not on hover/selection re-renders
let drag3DDistance = 0, drag3DStartX = 0, drag3DStartY = 0;
let hovered3DWallIdx = null, hovered3DMember = null;
let sectionBoxHelper = null;

function init3D() {
  if (is3DInitialized) return;

  const container = getEl("view3DContainer");
  const canvas3D = getEl("framingCanvas3D");

  // Fallback to the parent canvas-container if the 3D container hasn't laid out yet
  const w = container.clientWidth || getEl('canvas-container').clientWidth || 800;
  const h = container.clientHeight || getEl('canvas-container').clientHeight || 600;

  scene3D = new THREE.Scene();
  const csInit = getComputedStyle(document.documentElement);
  const bgCanvasInit = (csInit.getPropertyValue('--bg-canvas') || '#0b0e14').trim();
  scene3D.background = new THREE.Color(bgCanvasInit);

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene3D.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(5000, 10000, 5000);
  scene3D.add(dirLight);
  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dirLight2.position.set(-5000, 3000, -5000);
  scene3D.add(dirLight2);

  camera3D = new THREE.PerspectiveCamera(45, w / h, 1, 500000);
  camera3D.position.set(5000, 5000, 5000);

  renderer3D = new THREE.WebGLRenderer({ canvas: canvas3D, antialias: true });
  renderer3D.setSize(w, h);
  renderer3D.setPixelRatio(window.devicePixelRatio);

  controls3D = new THREE.OrbitControls(camera3D, renderer3D.domElement);
  controls3D.enableDamping = true;
  controls3D.dampingFactor = 0.05;
  controls3D.screenSpacePanning = true;
  // Middle mouse button pans (like Revit)
  controls3D.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN
  };

  // Grid Helper
  const gridHelper = new THREE.GridHelper(200000, 200, 0x555555, 0x333333);
  gridHelper.position.y = -1;
  scene3D.add(gridHelper);

  // Axes Helper (X=Red, Y=Green, Z=Blue)
  const axesHelper = new THREE.AxesHelper(3000);
  scene3D.add(axesHelper);

  // Zoom to Fit 3D button click listener
  const btnZoomToFit3D = getEl('btnZoomToFit3D');
  if (btnZoomToFit3D) {
    btnZoomToFit3D.addEventListener('click', (e) => {
      e.stopPropagation();
      zoomToFit3D();
    });
  }

  window.addEventListener("resize", () => {
    if (state.currentView === "3D") {
      resize3D();
    }
  });

  // ── 3D Raycaster for selection ──
  raycaster3D = new THREE.Raycaster();
  mouse3D = new THREE.Vector2();
  let isMouseDown3D = false;

  canvas3D.addEventListener('mousedown', (e) => {
    if (e.button === 0 && e.shiftKey) {
      e.stopImmediatePropagation();
      e.stopPropagation();
      drag3DDistance = 0;
      drag3DStartX = e.clientX;
      drag3DStartY = e.clientY;
      isMouseDown3D = true;
      state.isDrawing3DBox = true;
      state.selection3DStart = { x: e.clientX, y: e.clientY };
      state.selection3DCurrent = { x: e.clientX, y: e.clientY };
      controls3D.enabled = false;
    } else {
      drag3DDistance = 0;
      drag3DStartX = e.clientX;
      drag3DStartY = e.clientY;
      isMouseDown3D = true;
    }
  }, true);

  canvas3D.addEventListener('mouseup', async (e) => {
    isMouseDown3D = false;

    if (state.isDrawing3DBox) {
      e.stopImmediatePropagation();
      e.stopPropagation();
      state.isDrawing3DBox = false;
      controls3D.enabled = true;
      const overlay = getEl('selectionBoxOverlay');
      if (overlay) overlay.style.display = 'none';

      if (drag3DDistance > 5) {
        const canvasRect = canvas3D.getBoundingClientRect();
        const cx1 = state.selection3DStart.x - canvasRect.left;
        const cy1 = state.selection3DStart.y - canvasRect.top;
        const cx2 = e.clientX - canvasRect.left;
        const cy2 = e.clientY - canvasRect.top;

        const selMinX = Math.min(cx1, cx2);
        const selMaxX = Math.max(cx1, cx2);
        const selMinY = Math.min(cy1, cy2);
        const selMaxY = Math.max(cy1, cy2);

        const isCrossing = cx2 < cx1;
        const isMulti = e.ctrlKey;

        await perform3DBoxSelection(selMinX, selMaxX, selMinY, selMaxY, isCrossing, isMulti);
      }
    }
  });

  canvas3D.addEventListener('mousemove', (e) => {
    // Only accumulate drag distance while a button is pressed (dragging/rotating/panning)
    if (isMouseDown3D) {
      const dx = e.clientX - drag3DStartX;
      const dy = e.clientY - drag3DStartY;
      drag3DDistance += Math.sqrt(dx * dx + dy * dy);
      drag3DStartX = e.clientX;
      drag3DStartY = e.clientY;
    }

    if (state.isDrawing3DBox) {
      e.stopImmediatePropagation();
      e.stopPropagation();
      state.selection3DCurrent = { x: e.clientX, y: e.clientY };
      const container = getEl('canvas-container');
      if (container) {
        const containerRect = container.getBoundingClientRect();
        const x1 = state.selection3DStart.x - containerRect.left;
        const y1 = state.selection3DStart.y - containerRect.top;
        const x2 = state.selection3DCurrent.x - containerRect.left;
        const y2 = state.selection3DCurrent.y - containerRect.top;

        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);

        const overlay = getEl('selectionBoxOverlay');
        if (overlay) {
          overlay.style.left = left + 'px';
          overlay.style.top = top + 'px';
          overlay.style.width = width + 'px';
          overlay.style.height = height + 'px';
          overlay.style.display = 'block';
          if (x2 >= x1) {
            overlay.className = 'selection-box-overlay window';
          } else {
            overlay.className = 'selection-box-overlay crossing';
          }
        }
      }
      return;
    }

    on3DMouseMove(e);
  });

  canvas3D.addEventListener('mouseleave', () => {
    isMouseDown3D = false;
    if (state.isDrawing3DBox) {
      state.isDrawing3DBox = false;
      controls3D.enabled = true;
      const overlay = getEl('selectionBoxOverlay');
      if (overlay) overlay.style.display = 'none';
    }
    if (hovered3DMember !== null || hovered3DWallIdx !== null) {
      hovered3DMember = null;
      hovered3DWallIdx = null;
      update3DVisualStates();
    }
  });

  canvas3D.addEventListener('click', async (e) => {
    if (drag3DDistance > 5) return;
    await on3DClick(e);
  });

  // Smooth zoom to mouse cursor
  canvas3D.addEventListener('wheel', (e) => {
    e.stopImmediatePropagation();
    e.preventDefault();

    const rect = canvas3D.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const zoomRaycaster = new THREE.Raycaster();
    zoomRaycaster.setFromCamera(mouse, camera3D);
    const intersects = zoomRaycaster.intersectObjects(scene3D.children, true);

    let targetPoint = null;
    for (const hit of intersects) {
      const ud = hit.object.userData;
      if (ud.isMemberMesh || ud.isOpeningMesh || ud.isWallVolume || ud.isPanelLabel) {
        targetPoint = hit.point;
        break;
      }
    }

    const factor = Math.min(2.0, Math.max(0.5, Math.exp(e.deltaY * 0.0012)));

    if (targetPoint) {
      camera3D.position.lerpVectors(targetPoint, camera3D.position, factor);
      controls3D.target.lerpVectors(targetPoint, controls3D.target, factor);
    } else {
      camera3D.position.lerpVectors(controls3D.target, camera3D.position, factor);
    }
    controls3D.update();
  }, { capture: true, passive: false });

  is3DInitialized = true;
  animate3D();
  initViewCubeEvents();
}

function resize3D() {
  if (!renderer3D) return;
  const container = getEl("view3DContainer");
  const w = container.clientWidth || 800;
  const h = container.clientHeight || 600;
  camera3D.aspect = w / h;
  camera3D.updateProjectionMatrix();
  renderer3D.setSize(w, h);
}

function animate3D() {
  requestAnimationFrame(animate3D);
  if (state.currentView === "3D") {
    // Step ViewCube camera animation if running
    stepVcAnimation();
    controls3D.update();

    // Infinite grid behavior: follow camera target aligned to 1000 unit intervals
    const grid = scene3D.children.find(c => c instanceof THREE.GridHelper);
    if (grid && controls3D) {
      const spacing = 1000;
      grid.position.x = Math.round(controls3D.target.x / spacing) * spacing;
      grid.position.z = Math.round(controls3D.target.z / spacing) * spacing;
    }

    renderer3D.render(scene3D, camera3D);
    updateViewCube();
  }
}

// ─── ViewCube Logic ──────────────────────────────────────────────────
let vcAnim = null; // { fromPos, toPos, fromQuat, toQuat, t, duration }

function updateViewCube() {
  const cube = document.getElementById('viewCube');
  if (!cube || !camera3D) return;

  // Extract the camera's world orientation (rotation-only, no translation).
  // We want the cube to show the same orientation as the scene, so we apply
  // the camera's world matrix rotation (the cube rotates WITH the scene view).
  camera3D.updateMatrixWorld();
  const me = camera3D.matrixWorldInverse.elements;

  // CSS matrix3d is column-major; Three.js matrixWorldInverse is also column-major.
  // Negate the Y-axis rows/columns to flip from Three.js (Y-up) to CSS (Y-down).
  cube.style.transform = `matrix3d(
     ${me[0]},  ${-me[1]},  ${me[2]},  0,
     ${-me[4]}, ${me[5]},   ${-me[6]}, 0,
     ${me[8]},  ${-me[9]},  ${me[10]}, 0,
     0,          0,           0,         1
  )`;
}

function stepVcAnimation() {
  if (!vcAnim) return;
  vcAnim.t += 1 / vcAnim.duration;
  if (vcAnim.t >= 1) {
    vcAnim.t = 1;
    camera3D.position.copy(vcAnim.toPos);
    controls3D.target.copy(vcAnim.target);
    camera3D.up.copy(vcAnim.toUp);
    controls3D.update();
    vcAnim = null;
    return;
  }
  // Smooth ease in-out
  const t = vcAnim.t < 0.5
    ? 2 * vcAnim.t * vcAnim.t
    : 1 - Math.pow(-2 * vcAnim.t + 2, 2) / 2;

  camera3D.position.lerpVectors(vcAnim.fromPos, vcAnim.toPos, t);
  camera3D.up.lerpVectors(vcAnim.fromUp, vcAnim.toUp, t).normalize();
  controls3D.target.copy(vcAnim.target);
  controls3D.update();
}

// Preset view directions — unit vectors in Three.js world space (Y-up, Z toward viewer)
const VC_VIEWS = {
  'top': { dir: new THREE.Vector3(0, 1, 0.001), up: new THREE.Vector3(0, 0, -1) },
  'bottom': { dir: new THREE.Vector3(0, -1, 0.001), up: new THREE.Vector3(0, 0, 1) },
  'front': { dir: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
  'back': { dir: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
  'right': { dir: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  'left': { dir: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
  'front-top-left': { dir: new THREE.Vector3(-1, 1, 1).normalize(), up: new THREE.Vector3(0, 1, 0) },
  'front-top-right': { dir: new THREE.Vector3(1, 1, 1).normalize(), up: new THREE.Vector3(0, 1, 0) },
  'front-bottom-left': { dir: new THREE.Vector3(-1, -1, 1).normalize(), up: new THREE.Vector3(0, 1, 0) },
  'front-bottom-right': { dir: new THREE.Vector3(1, -1, 1).normalize(), up: new THREE.Vector3(0, 1, 0) },
  'back-top-left': { dir: new THREE.Vector3(1, 1, -1).normalize(), up: new THREE.Vector3(0, 1, 0) },
  'back-top-right': { dir: new THREE.Vector3(-1, 1, -1).normalize(), up: new THREE.Vector3(0, 1, 0) },
  'back-bottom-left': { dir: new THREE.Vector3(1, -1, -1).normalize(), up: new THREE.Vector3(0, 1, 0) },
  'back-bottom-right': { dir: new THREE.Vector3(-1, -1, -1).normalize(), up: new THREE.Vector3(0, 1, 0) },
};

function setViewCubeView(viewName) {
  if (!camera3D || !controls3D) return;
  const preset = safeGet(VC_VIEWS, viewName);
  if (!preset) return;

  const target = controls3D.target.clone();
  const dist = camera3D.position.distanceTo(target);

  const toPos = target.clone().add(preset.dir.clone().multiplyScalar(dist));

  vcAnim = {
    fromPos: camera3D.position.clone(),
    toPos,
    fromUp: camera3D.up.clone(),
    toUp: preset.up.clone(),
    target,
    t: 0,
    duration: 30  // frames (~0.5s at 60fps)
  };
}

function initViewCubeEvents() {
  const wrap = document.getElementById('viewCubeScene');
  if (!wrap) return;
  wrap.addEventListener('click', (e) => {
    const el = e.target.closest('[data-view]');
    if (!el) return;
    e.stopPropagation();
    setViewCubeView(el.dataset.view);
  });
}



// ─── 3D Raycasting helpers ────────────────────────────────────────────
function get3DIntersects(e) {
  if (!raycaster3D || !camera3D || !renderer3D) return [];
  const rect = renderer3D.domElement.getBoundingClientRect();
  mouse3D.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse3D.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster3D.setFromCamera(mouse3D, camera3D);

  // Collect all pickable meshes (members + wall volumes + labels + openings)
  const memberMeshes = [];
  const wallMeshes = [];
  const labelMeshes = [];
  const openingMeshes = [];
  scene3D.traverse(obj => {
    if (!obj.isMesh) return;
    if (obj.userData.isMemberMesh) memberMeshes.push(obj);
    else if (obj.userData.isWallVolume) wallMeshes.push(obj);
    else if (obj.userData.isPanelLabel) labelMeshes.push(obj);
    else if (obj.userData.isOpeningMesh) openingMeshes.push(obj);
  });

  // Cast against labels first, then members, then openings, then walls
  const labelHits = raycaster3D.intersectObjects(labelMeshes, false);
  const memberHits = raycaster3D.intersectObjects(memberMeshes, false);
  const openingHits = raycaster3D.intersectObjects(openingMeshes, false);
  const wallHits = raycaster3D.intersectObjects(wallMeshes, false);

  return [...labelHits, ...memberHits, ...openingHits, ...wallHits];
}

function update3DVisualStates() {
  if (!is3DInitialized || !scene3D) return;

  const cs = getComputedStyle(document.documentElement);
  const accent = (cs.getPropertyValue('--accent') || '#007fff').trim();
  const accentColorHex = parseInt(accent.slice(1), 16);

  scene3D.traverse(obj => {
    if (!obj.isMesh) return;

    if (obj.userData.isMemberMesh && obj.userData.memberRef) {
      const m = obj.userData.memberRef;
      const isSelected = (m === state.selectedMember) || (state.selectedMembers && state.selectedMembers.includes(m));
      const isHovered = (m === state.hoveredMember) || (m === state.hoveredPlanMember) || (m === hovered3DMember);

      let targetMat = obj.userData.normalMaterial;
      if (isSelected) {
        targetMat = obj.userData.selectedMaterial || targetMat;
      } else if (isHovered) {
        targetMat = obj.userData.hoverMaterial || targetMat;
      }

      if (obj.material !== targetMat) {
        obj.material = targetMat;
      }

      // Update line color
      const strokeColor = isSelected ? 0xffffff : (isHovered ? 0xdddddd : 0x000000);
      obj.children.forEach(child => {
        if (child.isLineSegments && child.material) {
          if (child.material.color.getHex() !== strokeColor) {
            child.material.color.setHex(strokeColor);
            child.material.needsUpdate = true;
          }
        }
      });
    }

    if (obj.userData.isOpeningMesh && obj.userData.openingRef) {
      const op = obj.userData.openingRef;
      const isSelected = state.selectedOpening && (state.selectedOpening.label === op.label) && (state.currentWallIdx === obj.userData.wallIdx);
      const isHovered = (state.hoveredOpening && state.hoveredOpening.label === op.label && state.currentWallIdx === obj.userData.wallIdx) ||
        (state.hoveredPlanOpening && state.hoveredPlanOpening.label === op.label && state.hoveredPlanOpeningWallIdx === obj.userData.wallIdx);

      let targetOpacity = 0.06;
      if (isSelected) targetOpacity = 0.3;
      else if (isHovered) targetOpacity = 0.18;

      if (obj.material && obj.material.opacity !== targetOpacity) {
        obj.material.opacity = targetOpacity;
        obj.material.needsUpdate = true;
      }

      const lineOp = isSelected ? 0.9 : (isHovered ? 0.6 : 0.25);
      const lineW = isSelected ? 2 : (isHovered ? 1.5 : 1);
      obj.children.forEach(child => {
        if (child.isLineSegments && child.material) {
          if (child.material.opacity !== lineOp || child.material.linewidth !== lineW) {
            child.material.opacity = lineOp;
            child.material.linewidth = lineW;
            child.material.needsUpdate = true;
          }
        }
      });
    }

    if (obj.userData.isWallVolume) {
      const isWallHovered3D = (hovered3DWallIdx === obj.userData.wallIdx);
      const targetEdgeColor = isWallHovered3D ? accentColorHex : 0x475569;
      obj.children.forEach(child => {
        if (child.isLineSegments && child.material) {
          if (child.material.color.getHex() !== targetEdgeColor) {
            child.material.color.setHex(targetEdgeColor);
            child.material.needsUpdate = true;
          }
        }
      });
    }

    if (obj.userData.isPanelLabel) {
      const wallIdx = obj.userData.wallIdx;
      const isSelected = state.selectedWallIndices && state.selectedWallIndices.includes(wallIdx);
      const isHovered = (hovered3DWallIdx === wallIdx);

      const style = getPanelBadgeStyle(isSelected, isHovered);
      const newColor = style.bg;
      if (obj.userData.currentColor !== newColor || obj.userData.currentTheme !== state.theme) {
        obj.userData.currentColor = newColor;
        obj.userData.currentTheme = state.theme;
        const wall = state.wallsData[wallIdx];
        if (wall) {
          const labelText = `Panel ${wall.label || wall.wall_id}`;
          if (obj.material.map) {
            obj.material.map.dispose();
          }
          obj.material.map = createPanelNameTexture(labelText, isSelected, isHovered);
          obj.material.needsUpdate = true;
        }
      }
    }
  });
}

function updateOrbitTarget() {
  // Disabled as per user request to keep view/camera location stable when selecting elements.
  return;
}

function triggerSelectionBoxShortcut() {
  const hasSelection = (state.selectedMember || (state.selectedMembers && state.selectedMembers.length > 0) || (state.selectedWallIndices && state.selectedWallIndices.length > 0));
  if (hasSelection) {
    enableSelectionBoxForCurrentSelection();
  } else {
    if (state.sectionBoxActive) {
      disableSelectionBox();
    } else {
      enableSectionBoxForEntireModel();
    }
  }
}

function enableSelectionBoxForCurrentSelection() {
  if (!is3DInitialized || !scene3D) {
    switchView('3D');
    setTimeout(enableSelectionBoxForCurrentSelection, 100);
    return;
  }

  const selectedObjects = [];
  scene3D.traverse(obj => {
    if (!obj.isMesh) return;

    // Check specific member selection
    if (obj.userData.isMemberMesh && obj.userData.memberRef) {
      const m = obj.userData.memberRef;
      const isSelected = (m === state.selectedMember) || (state.selectedMembers && state.selectedMembers.includes(m));
      if (isSelected) {
        selectedObjects.push(obj);
        return;
      }
    }

    // Check wall selection
    if (obj.userData.wallIdx !== undefined && state.selectedWallIndices && state.selectedWallIndices.includes(obj.userData.wallIdx)) {
      selectedObjects.push(obj);
    }
  });

  if (selectedObjects.length > 0) {
    const box = new THREE.Box3();
    selectedObjects.forEach((obj, idx) => {
      const objBox = new THREE.Box3().setFromObject(obj);
      if (idx === 0) {
        box.copy(objBox);
      } else {
        box.union(objBox);
      }
    });

    // Expand by 150mm buffer
    const expandedBox = box.clone().expandByScalar(150);

    // Apply clipping planes
    applySectionBoxPlanes(expandedBox);

    // Frame camera to selection box
    frameCameraToBox(expandedBox);

    // Make sure we are in 3D view
    if (state.currentView !== '3D') {
      switchView('3D');
    }
  }
}

function enableSectionBoxForEntireModel() {
  if (!is3DInitialized || !scene3D) {
    switchView('3D');
    setTimeout(enableSectionBoxForEntireModel, 100);
    return;
  }

  const box = new THREE.Box3();
  let hasMeshes = false;
  scene3D.traverse(obj => {
    if (!obj.isMesh) return;
    if (obj.userData.isMemberMesh || obj.userData.isWallVolume) {
      const objBox = new THREE.Box3().setFromObject(obj);
      if (!hasMeshes) {
        box.copy(objBox);
        hasMeshes = true;
      } else {
        box.union(objBox);
      }
    }
  });

  if (hasMeshes) {
    const expandedBox = box.clone().expandByScalar(300); // 300mm buffer for full model
    applySectionBoxPlanes(expandedBox);
    frameCameraToBox(expandedBox);
  }
}

function disableSelectionBox() {
  state.sectionBoxActive = false;
  state.sectionBoxPlanes = [];
  if (renderer3D) {
    renderer3D.clippingPlanes = [];
  }

  if (sectionBoxHelper) {
    scene3D.remove(sectionBoxHelper);
    sectionBoxHelper = null;
  }

  const chk = getEl('chkSectionBox');
  if (chk) chk.checked = false;

  camera3DFramed = false;
  render3DScene();
}

function applySectionBoxPlanes(box) {
  state.sectionBoxActive = true;

  const min = box.min;
  const max = box.max;

  // Create 6 clipping planes
  const minXPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -min.x);
  const maxXPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), max.x);
  const minYPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -min.y);
  const maxYPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), max.y);
  const minZPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -min.z);
  const maxZPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), max.z);

  state.sectionBoxPlanes = [minXPlane, maxXPlane, minYPlane, maxYPlane, minZPlane, maxZPlane];

  if (renderer3D) {
    renderer3D.clippingPlanes = state.sectionBoxPlanes;
  }

  const chk = getEl('chkSectionBox');
  if (chk) chk.checked = true;

  // Create outlines (2mm larger to avoid self-clipping)
  updateSectionBoxHelper(box.clone().expandByScalar(2));
}

function frameCameraToBox(box) {
  if (!controls3D || !camera3D) return;

  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);

  const maxDim = Math.max(size.x, size.y, size.z);
  const fov = camera3D.fov * (Math.PI / 180);
  let cameraZ = maxDim / (2 * Math.tan(fov / 2));
  cameraZ *= 1.25;

  camera3D.position.set(center.x + cameraZ * 0.5, center.y + cameraZ * 0.5, center.z + cameraZ);
  controls3D.target.copy(center);
  controls3D.update();
}

function zoomToFit3D() {
  if (!scene3D || !camera3D || !controls3D) return;

  const box = new THREE.Box3();
  let hasGeometry = false;

  scene3D.traverse((child) => {
    if (child.isMesh &&
      !(child instanceof THREE.GridHelper) &&
      !(child instanceof THREE.AxesHelper) &&
      child.visible &&
      child.name !== "sectionBoxHelper") {
      child.geometry.computeBoundingBox();
      const childBox = new THREE.Box3().copy(child.geometry.boundingBox).applyMatrix4(child.matrixWorld);
      if (!hasGeometry) {
        box.copy(childBox);
        hasGeometry = true;
      } else {
        box.union(childBox);
      }
    }
  });

  if (hasGeometry) {
    frameCameraToBox(box);
  } else {
    controls3D.target.set(0, 0, 0);
    camera3D.position.set(5000, 5000, 5000);
    controls3D.update();
  }
}

function resetSectionBoxState() {
  state.sectionBoxActive = false;
  state.sectionBoxPlanes = [];
  if (renderer3D) {
    renderer3D.clippingPlanes = [];
  }
  if (sectionBoxHelper) {
    scene3D.remove(sectionBoxHelper);
    sectionBoxHelper = null;
  }
  const chk = getEl('chkSectionBox');
  if (chk) chk.checked = false;
}

function updateSectionBoxHelper(box) {
  if (sectionBoxHelper) {
    scene3D.remove(sectionBoxHelper);
    sectionBoxHelper = null;
  }

  if (!state.sectionBoxActive || !box) return;

  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  const geom = new THREE.BoxGeometry(size.x, size.y, size.z);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x3182ce,
    transparent: true,
    opacity: 0.05,
    depthWrite: false
  });

  sectionBoxHelper = new THREE.Mesh(geom, mat);
  sectionBoxHelper.position.copy(center);

  const edges = new THREE.EdgesGeometry(geom);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x3182ce,
    linewidth: 2
  });
  const line = new THREE.LineSegments(edges, lineMat);
  sectionBoxHelper.add(line);

  scene3D.add(sectionBoxHelper);
}

function on3DMouseMove(e) {
  if (!is3DInitialized) return;
  const intersects = get3DIntersects(e);

  let newHoveredMember = null;
  let newHoveredWallIdx = null;
  let newHoveredOpening = null;
  let newHoveredJoin = null;

  for (const hit of intersects) {
    const ud = hit.object.userData;
    if (ud.isJoinMarker && ud.joinRef) {
      newHoveredJoin = ud.joinRef;
      break;
    }
    if (ud.isPanelLabel) {
      newHoveredWallIdx = ud.wallIdx;
      break;
    }
    if (ud.isMemberMesh && ud.memberRef) {
      newHoveredMember = ud.memberRef;
      newHoveredWallIdx = ud.wallIdx;
      break;
    }
    if (ud.isOpeningMesh && ud.openingRef) {
      newHoveredOpening = ud.openingRef;
      newHoveredWallIdx = ud.wallIdx;
      break;
    }
    if (ud.isWallVolume && getActiveVisibilitySettings().showWallVolume) {
      newHoveredWallIdx = ud.wallIdx;
      break;
    }
  }

  let openingHoverChanged = false;
  if (newHoveredOpening !== state.hoveredOpening) {
    state.hoveredOpening = newHoveredOpening;
    openingHoverChanged = true;
  }

  let joinHoverChanged = false;
  if (newHoveredJoin !== state.hoveredJoin) {
    state.hoveredJoin = newHoveredJoin;
    joinHoverChanged = true;
  }

  if (newHoveredMember !== hovered3DMember || newHoveredWallIdx !== hovered3DWallIdx || openingHoverChanged || joinHoverChanged) {
    hovered3DMember = newHoveredMember;
    hovered3DWallIdx = newHoveredWallIdx;
    update3DVisualStates();
    render();
    if (planCanvas) renderPlan();
  }

  // Update cursor
  const canvas3D = getEl('framingCanvas3D');
  if (!canvas3D) return;
  if (newHoveredMember || newHoveredWallIdx !== null || newHoveredOpening || newHoveredJoin) {
    canvas3D.style.cursor = 'pointer';
  } else {
    canvas3D.style.cursor = '';
  }
}

async function on3DClick(e) {
  if (!is3DInitialized) return;
  const isMulti = e.ctrlKey || e.shiftKey;
  const isDeselect = e.shiftKey;
  const intersects = get3DIntersects(e);

  let hitMember = null;
  let hitWallIdx = null;
  let hitOpening = null;
  let hitJoin = null;

  for (const hit of intersects) {
    const ud = hit.object.userData;
    if (ud.isJoinMarker && ud.joinRef) {
      hitJoin = ud.joinRef;
      break;
    }
    if (ud.isPanelLabel) {
      hitWallIdx = ud.wallIdx;
      break;
    }
    if (ud.isMemberMesh && ud.memberRef) {
      // Visibility check
      const m = ud.memberRef;
      const isVisible = getActiveVisibilitySettings().showFramingGlobal && safeGet(getActiveVisibilitySettings(), m.type);
      if (!isVisible) continue;
      hitMember = m;
      hitWallIdx = ud.wallIdx;
      break;
    }
    if (ud.isOpeningMesh && ud.openingRef) {
      hitOpening = ud.openingRef;
      hitWallIdx = ud.wallIdx;
      break;
    }
    if (ud.isWallVolume && getActiveVisibilitySettings().showWallVolume) {
      hitWallIdx = ud.wallIdx;
      break;
    }
  }

  if (hitJoin) {
    if (!isMulti) {
      state.selectedMembers = [];
      state.selectedMember = null;
      state.selectedWallIndices = [];
      state.selectedOpening = null;
      state.selectedJoin = hitJoin;
      state.selectedJoins = [hitJoin];
    } else {
      if (!state.selectedJoins) state.selectedJoins = [];
      const keyHovered = [hitJoin.stopped_wall_id, hitJoin.continuing_wall_id].sort().join(':');
      const idx = state.selectedJoins.findIndex(sj => [sj.stopped_wall_id, sj.continuing_wall_id].sort().join(':') === keyHovered);
      if (idx !== -1) {
        state.selectedJoins.splice(idx, 1);
      } else {
        state.selectedJoins.push(hitJoin);
      }
      state.selectedJoin = safeGet(state.selectedJoins, state.selectedJoins.length - 1) || null;
    }
  } else if (hitOpening) {
    state.selectedJoin = null;
    state.selectedJoins = [];
    if (!isMulti) {
      state.selectedMembers = [];
      state.selectedMember = null;
      state.selectedWallIndices = [];
      state.selectedOpening = hitOpening;
      state.currentWallIdx = hitWallIdx;
      getEl('wallSelect').value = hitWallIdx;
      await restoreWallConfig(hitWallIdx);
    }
  } else if (hitMember) {
    state.selectedJoin = null;
    state.selectedJoins = [];
    state.selectedOpening = null;
    if (isMulti) {
      state.selectedWallIndices = [];
      if (!state.selectedMembers) state.selectedMembers = [];
      const idx = state.selectedMembers.indexOf(hitMember);
      if (idx !== -1) {
        state.selectedMembers.splice(idx, 1);
      } else if (!isDeselect) {
        state.selectedMembers.push(hitMember);
      }
      state.selectedMember = safeGet(state.selectedMembers, state.selectedMembers.length - 1) || null;
      if (hitWallIdx !== null) {
        state.currentWallIdx = hitWallIdx;
        getEl('wallSelect').value = hitWallIdx;
        await restoreWallConfig(hitWallIdx);
      }
    } else {
      state.selectedWallIndices = [];
      state.selectedMembers = [hitMember];
      state.selectedMember = hitMember;
      state.currentWallIdx = hitWallIdx;
      getEl('wallSelect').value = hitWallIdx;
      await restoreWallConfig(hitWallIdx);
    }
  } else if (hitWallIdx !== null) {
    state.selectedJoin = null;
    state.selectedJoins = [];
    state.selectedOpening = null;
    if (isMulti) {
      state.selectedMembers = [];
      state.selectedMember = null;
      if (!state.selectedWallIndices) state.selectedWallIndices = [];
      const idx = state.selectedWallIndices.indexOf(hitWallIdx);
      if (idx !== -1) {
        state.selectedWallIndices.splice(idx, 1);
      } else if (!isDeselect) {
        state.selectedWallIndices.push(hitWallIdx);
      }
      state.currentWallIdx = safeGet(state.selectedWallIndices, state.selectedWallIndices.length - 1) ?? hitWallIdx;
      getEl('wallSelect').value = state.currentWallIdx;
      await restoreWallConfig(state.currentWallIdx);
    } else {
      state.selectedMembers = [];
      state.selectedMember = null;
      state.selectedWallIndices = [hitWallIdx];
      state.currentWallIdx = hitWallIdx;
      getEl('wallSelect').value = hitWallIdx;
      await restoreWallConfig(hitWallIdx);
    }
  } else {
    // Click on empty space — clear selection if not multi
    if (!isMulti) {
      state.selectedMembers = [];
      state.selectedMember = null;
      state.selectedWallIndices = [];
      state.selectedJoin = null;
      state.selectedJoins = [];
    }
  }

  updateMemberSummary();
  updateWallInfo();
  updateSelectedElementInfo();
  render3DScene();
  render();
  if (planCanvas) renderPlan();
}


function createPanelNameTexture(text, isSelected, isHovered) {
  // Measure text width to size the canvas dynamically
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = 'bold 48px Inter, sans-serif';
  const textWidth = tempCtx.measureText(text).width;

  const canvas = document.createElement('canvas');
  canvas.height = 128;
  canvas.width = Math.max(512, Math.ceil(textWidth + 96)); // 48px padding on each side
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const style = getPanelBadgeStyle(isSelected, isHovered);

  ctx.fillStyle = style.bg;
  ctx.strokeStyle = style.border;
  ctx.lineWidth = 8;

  drawRoundedRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 32);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = style.text;
  ctx.font = 'bold 48px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.sourceWidth = canvas.width;
  texture.sourceHeight = canvas.height;
  return texture;
}


function render3DScene() {
  if (!is3DInitialized || !state.framingResult) return;

  function getCStudShape(D, F, L, G) {
    const shape = new THREE.Shape();
    shape.moveTo(D / 2 - L, -F / 2);
    shape.lineTo(D / 2, -F / 2);
    shape.lineTo(D / 2, F / 2);
    shape.lineTo(-D / 2, F / 2);
    shape.lineTo(-D / 2, -F / 2);
    shape.lineTo(-D / 2 + L, -F / 2);
    shape.lineTo(-D / 2 + L, -F / 2 + G);
    shape.lineTo(-D / 2 + G, -F / 2 + G);
    shape.lineTo(-D / 2 + G, F / 2 - G);
    shape.lineTo(D / 2 - G, F / 2 - G);
    shape.lineTo(D / 2 - G, -F / 2 + G);
    shape.lineTo(D / 2 - L, -F / 2 + G);
    shape.closePath();
    return shape;
  }

  function getCHStudShape(D, F, L, G) {
    const shape = new THREE.Shape();
    shape.moveTo(D / 2 - L, -F / 2);
    shape.lineTo(D / 2, -F / 2);
    shape.lineTo(D / 2, F / 2);
    shape.lineTo(D / 2 - L, F / 2);
    shape.lineTo(D / 2 - L, F / 2 - G);
    shape.lineTo(D / 2 - G, F / 2 - G);
    shape.lineTo(D / 2 - G, G);
    shape.lineTo(-D / 2 + 25.4 + G, G);
    shape.lineTo(-D / 2 + 25.4 + G, F / 2);
    shape.lineTo(-D / 2 + 25.4, F / 2);
    shape.lineTo(-D / 2 + 25.4, G);
    shape.lineTo(-D / 2 + G, G);
    shape.lineTo(-D / 2 + G, F / 2);
    shape.lineTo(-D / 2, F / 2);
    shape.lineTo(-D / 2, -F / 2);
    shape.lineTo(-D / 2 + G, -F / 2);
    shape.lineTo(-D / 2 + G, -G);
    shape.lineTo(-D / 2 + 25.4, -G);
    shape.lineTo(-D / 2 + 25.4, -F / 2);
    shape.lineTo(-D / 2 + 25.4 + G, -F / 2);
    shape.lineTo(-D / 2 + 25.4 + G, -G);
    shape.lineTo(D / 2 - G, -G);
    shape.lineTo(D / 2 - G, -F / 2 + G);
    shape.lineTo(D / 2 - L, -F / 2 + G);
    shape.closePath();
    return shape;
  }

  function getTrackShape(D, F, G) {
    const shape = new THREE.Shape();
    shape.moveTo(D / 2, F / 2);
    shape.lineTo(D / 2, -F / 2);
    shape.lineTo(-D / 2, -F / 2);
    shape.lineTo(-D / 2, F / 2);
    shape.lineTo(-D / 2 + G, F / 2);
    shape.lineTo(-D / 2 + G, -F / 2 + G);
    shape.lineTo(D / 2 - G, -F / 2 + G);
    shape.lineTo(D / 2 - G, F / 2);
    shape.closePath();
    return shape;
  }

  function getJRunnerShape(D, F, G, F2) {
    const F_long = F;
    const F_short = F2 || Math.max(25.4, F * 0.45);
    const shape = new THREE.Shape();
    shape.moveTo(D / 2, -F_long / 2 + F_short);
    shape.lineTo(D / 2, -F_long / 2);
    shape.lineTo(-D / 2, -F_long / 2);
    shape.lineTo(-D / 2, F_long / 2);
    shape.lineTo(-D / 2 + G, F_long / 2);
    shape.lineTo(-D / 2 + G, -F_long / 2 + G);
    shape.lineTo(D / 2 - G, -F_long / 2 + G);
    shape.lineTo(D / 2 - G, -F_long / 2 + F_short);
    shape.closePath();
    return shape;
  }

  function getHatChannelShape(D, F, L, G) {
    const brim = L || 12.7;
    const shape = new THREE.Shape();
    shape.moveTo(-F / 2 - brim, -D / 2);
    shape.lineTo(-F / 2, -D / 2);
    shape.lineTo(-F / 2, D / 2);
    shape.lineTo(F / 2, D / 2);
    shape.lineTo(F / 2, -D / 2);
    shape.lineTo(F / 2 + brim, -D / 2);
    shape.lineTo(F / 2 + brim, -D / 2 + G);
    shape.lineTo(F / 2 + G, -D / 2 + G);
    shape.lineTo(F / 2 + G, D / 2 - G);
    shape.lineTo(-F / 2 - G, D / 2 - G);
    shape.lineTo(-F / 2 - G, -D / 2 + G);
    shape.lineTo(-F / 2 - brim, -D / 2 + G);
    shape.closePath();
    return shape;
  }

  function getZGirtShape(D, F, L, G, F2) {
    const fTop = F;
    const fBottom = F2 || F;
    const shape = new THREE.Shape();
    shape.moveTo(fTop, D / 2);
    shape.lineTo(-G / 2, D / 2);
    shape.lineTo(-G / 2, -D / 2 + G);
    shape.lineTo(-fBottom, -D / 2 + G);
    shape.lineTo(-fBottom, -D / 2);
    shape.lineTo(G / 2, -D / 2);
    shape.lineTo(G / 2, D / 2 - G);
    shape.lineTo(fTop, D / 2 - G);
    shape.closePath();
    return shape;
  }

  function getAngleShape(D, F, G) {
    const shape = new THREE.Shape();
    shape.moveTo(-F / 2, D / 2);
    shape.lineTo(-F / 2, -D / 2);
    shape.lineTo(F / 2, -D / 2);
    shape.lineTo(F / 2, -D / 2 + G);
    shape.lineTo(-F / 2 + G, -D / 2 + G);
    shape.lineTo(-F / 2 + G, D / 2);
    shape.closePath();
    return shape;
  }

  // Update background based on theme
  const csRender = getComputedStyle(document.documentElement);
  const bgCanvasRender = (csRender.getPropertyValue('--bg-canvas') || '#0b0e14').trim();
  scene3D.background = new THREE.Color(bgCanvasRender);

  // Clear existing walls (keep lights and helpers)
  const toRemove = [];
  scene3D.children.forEach(c => {
    if (c.userData.isWall) toRemove.push(c);
  });
  toRemove.forEach(c => scene3D.remove(c));

  // Material map based on member type colors
  const materials = {};
  for (let type in MEMBER_COLORS) {
    safeSet(materials, type, new THREE.MeshStandardMaterial({ 
      color: new THREE.Color(safeGet(MEMBER_COLORS, type)),
      roughness: 0.5,
      metalness: 0.2,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1
    }));
  }
  const defaultMat = new THREE.MeshStandardMaterial({
    color: 0x888888,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });

  const boundingBox = new THREE.Box3();

  // Draw all walls in the framing result
  state.framingResult.forEach((wallResult, i) => {
    // We need the original wall input to get origin and direction
    const wallInputOriginal = safeGet(state.wallsData, i);
    if (!wallResult || !wallInputOriginal) return;
    if (state.hiddenElements && state.hiddenElements.has(wallInputOriginal)) return;

    const wallInput = {
      ...wallInputOriginal,
      origin_x: wallResult.origin_x !== undefined ? wallResult.origin_x : wallInputOriginal.origin_x,
      origin_y: wallResult.origin_y !== undefined ? wallResult.origin_y : wallInputOriginal.origin_y,
      direction_x: wallResult.direction_x !== undefined ? wallResult.direction_x : wallInputOriginal.direction_x,
      direction_y: wallResult.direction_y !== undefined ? wallResult.direction_y : wallInputOriginal.direction_y,
      length: wallResult.length_mm !== undefined ? wallResult.length_mm : wallInputOriginal.length,
      thickness: wallResult.thickness_mm !== undefined ? wallResult.thickness_mm : wallInputOriginal.thickness
    };

    const wallGroup = new THREE.Group();
    wallGroup.userData.isWall = true;

    // Position Wall Group in Revit World Coordinates
    // Note: Revit Z is Up. ThreeJS Y is Up. 
    // We will map Revit (X, Y, Z) to ThreeJS (X, -Z, Y)
    const rx = wallInput.origin_x || 0;
    const ry = wallInput.origin_y || 0;
    const rz = wallInput.origin_z || 0;

    wallGroup.position.set(rx, rz, -ry);

    // Rotate Wall Group based on direction vector
    const dx = wallInput.direction_x !== undefined ? wallInput.direction_x : 1;
    const dy = wallInput.direction_y !== undefined ? wallInput.direction_y : 0;
    // Calculate angle from X axis in XY plane
    const angle = Math.atan2(dy, dx);
    // ThreeJS rotates around Y axis.
    wallGroup.rotation.y = angle;

    // Create members
    wallResult.members.forEach(m => {
      if (state.hiddenElements && state.hiddenElements.has(m)) return;
      const isVisible = getActiveVisibilitySettings().showFramingGlobal && safeGet(getActiveVisibilitySettings(), m.type);
      if (!isVisible) return;

      const D = m.depth_mm;
      const F = m.flange_mm;
      const G = m.gauge_mm || 1.5;
      const isCProfile = m.profile === 'C_STUD' || m.type.includes('stud');
      const L = isCProfile ? (m.lip_mm || 12.7) : 0;

      const isVert = m.type === "stud" || m.type === "end_stud" || m.type === "king_stud" || m.type === "trimmer_stud" || m.type === "cripple_stud";
      const len = m.length_mm || Math.sqrt(Math.pow(m.end.x - m.start.x, 2) + Math.pow(m.end.y - m.start.y, 2));

      // Generate shape for extrusion
      const hasRevit = !!(m.revit_family_name || m.revit_symbol_name);
      const fam = m.revit_family_name || '';
      const sym = m.revit_symbol_name || '';
      const match = hasRevit ? (state.customRevitProfiles || []).find(p => p.familyName === fam && p.designation === sym) : null;

      let shape;
      if (hasRevit && match && match.vertices && match.vertices.length > 0) {
        // Rotate to map Revit local profile coordinates to our visualizer base coordinate system,
        // and center on (0, 0). Vertical members are rotated 90° counter-clockwise,
        // while horizontal members (tracks) are rotated 90° clockwise.
        const rawVertices = match.vertices.map(r => {
          return isVert ? { u: -r.v, v: r.u } : { u: r.v, v: -r.u };
        });
        let minU = Infinity, maxU = -Infinity;
        let minV = Infinity, maxV = -Infinity;
        for (const pt of rawVertices) {
          if (pt.u < minU) minU = pt.u;
          if (pt.u > maxU) maxU = pt.u;
          if (pt.v < minV) minV = pt.v;
          if (pt.v > maxV) maxV = pt.v;
        }

        const D_total = maxU - minU;
        const centerU = 0;
        const centerV = 0;

        const centered = rawVertices.map(pt => ({
          u: pt.u - centerU,
          v: pt.v - centerV
        }));

        shape = new THREE.Shape();
        shape.moveTo(centered[0].u, centered[0].v);
        for (let idx = 1; idx < centered.length; idx++) {
          shape.lineTo(safeGet(centered, idx).u, safeGet(centered, idx).v);
        }
        shape.closePath();
      } else {
        const shapeType = hasRevit ? getMemberShapeProfile(m) : (isCProfile ? 'c_stud' : 'track');
        if (shapeType === 'ch_stud') {
          shape = getCHStudShape(D, F, L, G);
        } else if (shapeType === 'j_runner') {
          const F2 = match ? match.flange_short_mm : m.flange_short_mm;
          shape = getJRunnerShape(D, F, G, F2);
        } else if (shapeType === 'hat_channel') {
          shape = getHatChannelShape(D, F, L, G);
        } else if (shapeType === 'z_girt') {
          const F2 = match ? match.flange_short_mm : m.flange_short_mm;
          shape = getZGirtShape(D, F, L, G, F2);
        } else if (shapeType === 'angle') {
          shape = getAngleShape(D, F, G);
        } else if (shapeType === 'track') {
          shape = getTrackShape(D, F, G);
        } else {
          shape = getCStudShape(D, F, L, G);
        }
      }

      const extrudeSettings = {
        depth: len,
        bevelEnabled: false
      };

      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      let posX, posY, posZ;
      const cx = (m.start.x + m.end.x) / 2;
      const cy = (m.start.y + m.end.y) / 2;
      const cz = m.z_offset || 0;

      if (isVert) {
        // Rotate geometry in-place so Z_geom becomes Y_wall, X_geom becomes Z_wall
        geom.rotateZ((m.rotation || 0) * Math.PI / 180);
        geom.rotateX(-Math.PI / 2);

        posX = cx;
        posY = m.start.y;
        posZ = -cz;
      } else {
        // Horizontal members
        // Align Z_geom to X_wall, X_geom to Z_wall, and apply rotation offset of 90 degrees
        let rot = m.rotation || 0;
        const shapeType = hasRevit ? getMemberShapeProfile(m) : (isCProfile ? 'c_stud' : 'track');
        if ((shapeType === 'c_stud' || shapeType === 'ch_stud') && m.label && m.label.startsWith('HDR-C')) {
          rot += 180.0;
        }
        geom.rotateZ((rot - 90.0) * Math.PI / 180);
        geom.rotateY(Math.PI / 2);

        const slopeAngle = Math.atan2(m.end.y - m.start.y, m.end.x - m.start.x);
        if (Math.abs(slopeAngle) > 0.0001) {
          geom.rotateZ(slopeAngle);
        }

        posX = m.start.x;
        posY = m.start.y;
        posZ = -cz;
      }

      const isSelected = (m === state.selectedMember) || (state.selectedMembers && state.selectedMembers.includes(m));
      const isHovered = (m === state.hoveredMember) || (m === state.hoveredPlanMember) || (m === hovered3DMember);

      const normalMat = safeGet(materials, m.type) || defaultMat;
      const hoverMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(safeGet(MEMBER_COLORS, m.type) || 0x888888).clone().multiplyScalar(1.25),
        roughness: 0.4,
        metalness: 0.4,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const selectedMat = new THREE.MeshStandardMaterial({
        color: 0x3182ce, // blue highlight
        roughness: 0.3,
        metalness: 0.7,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });

      let mat = normalMat;
      if (isSelected) {
        mat = selectedMat;
      } else if (isHovered) {
        mat = hoverMat;
      }

      const mesh = new THREE.Mesh(geom, mat);
      // Tag mesh so raycasting can identify it
      mesh.userData.wallIdx = i;
      mesh.userData.memberRef = m;
      mesh.userData.isMemberMesh = true;
      mesh.userData.normalMaterial = normalMat;
      mesh.userData.hoverMaterial = hoverMat;
      mesh.userData.selectedMaterial = selectedMat;

      // Add edges for better visibility
      const edges = new THREE.EdgesGeometry(geom);
      const strokeColor = isSelected ? 0xffffff : (isHovered ? 0xdddddd : 0x000000);
      const lineMat = new THREE.LineBasicMaterial({ color: strokeColor, linewidth: isSelected ? 2 : 1 });
      const line = new THREE.LineSegments(edges, lineMat);
      mesh.add(line);

      mesh.position.set(posX, posY, posZ);
      wallGroup.add(mesh);
    });

    // Create 3D Opening highlights if showWallVolume is active
    if (getActiveVisibilitySettings().showWallVolume && wallResult.openings) {
      const thick = wallResult.thickness_mm || wallInput.thickness || 92.08;
      const cs = getComputedStyle(document.documentElement);
      const accent = (cs.getPropertyValue('--accent') || '#007fff').trim();
      const accentColorHex = parseInt(accent.slice(1), 16);

      wallResult.openings.forEach(op => {
        if (state.hiddenElements && state.hiddenElements.has(op)) return;
        const isSelected = state.selectedOpening && (state.selectedOpening.label === op.label) && (state.currentWallIdx === i);
        const isHovered = (state.hoveredOpening && state.hoveredOpening.label === op.label && state.currentWallIdx === i) ||
          (state.hoveredPlanOpening && state.hoveredPlanOpening.label === op.label && state.hoveredPlanOpeningWallIdx === i);

        let opacity = 0.06;
        if (isSelected) opacity = 0.3;
        else if (isHovered) opacity = 0.18;

        const opGeom = new THREE.BoxGeometry(op.width, op.height, thick + 2.0);
        const opMat = new THREE.MeshStandardMaterial({
          color: accentColorHex,
          transparent: true,
          opacity: opacity,
          roughness: 0.6,
          metalness: 0.1,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: 2,
          polygonOffsetUnits: 2
        });

        const opMesh = new THREE.Mesh(opGeom, opMat);
        opMesh.userData.isOpeningMesh = true;
        opMesh.userData.openingRef = op;
        opMesh.userData.wallIdx = i;

        const posX = (op.x_offset || op.x_start || 0) + op.width / 2.0;
        const posY = (op.sill_height || 0) + op.height / 2.0;
        opMesh.position.set(posX, posY, 0);

        // Add outline edges
        const edges = new THREE.EdgesGeometry(opGeom);
        const lineMat = new THREE.LineBasicMaterial({
          color: accentColorHex,
          linewidth: isSelected ? 2 : (isHovered ? 1.5 : 1),
          transparent: true,
          opacity: isSelected ? 0.9 : (isHovered ? 0.6 : 0.25)
        });
        opMesh.add(new THREE.LineSegments(edges, lineMat));

        wallGroup.add(opMesh);
      });
    }

    // Render Wall Volume if style is not 'hidden'
    if (state.wallStyle !== 'hidden' && getActiveVisibilitySettings().showWallVolume) {
      const len = wallResult.length_mm || wallInput.length || 0;
      const height = wallResult.height_mm || wallInput.height || 0;
      const thick = wallResult.thickness_mm || wallInput.thickness || 92.08;
      const layers = (wallInput.layers && wallInput.layers.length > 0) ? wallInput.layers : null;

      const openings = wallResult.openings || wallInput.openings || [];

      const hasErrors = wallResult.validation_errors && wallResult.validation_errors.length > 0;

      const h_start = wallResult.height_start !== undefined ? wallResult.height_start : (wallInput.height_start !== undefined ? wallInput.height_start : height);
      const h_end = wallResult.height_end !== undefined ? wallResult.height_end : (wallInput.height_end !== undefined ? wallInput.height_end : height);
      const b_start = wallResult.base_start !== undefined ? wallResult.base_start : (wallInput.base_start !== undefined ? wallInput.base_start : 0.0);
      const b_end = wallResult.base_end !== undefined ? wallResult.base_end : (wallInput.base_end !== undefined ? wallInput.base_end : 0.0);

      const getWallHeightAt = (x) => {
        if (len <= 0) return h_start;
        const t = Math.max(0.0, Math.min(1.0, x / len));
        return h_start + t * (h_end - h_start);
      };

      const getWallBaseAt = (x) => {
        if (len <= 0) return b_start;
        const t = Math.max(0.0, Math.min(1.0, x / len));
        return b_start + t * (b_end - b_start);
      };

      // Build X-partition coordinates from openings (shared across all layers)
      let xCoords = [0, len];
      openings.forEach(op => {
        const xStart = op.x_offset || 0;
        const xEnd = xStart + op.width;
        if (xStart > 0 && xStart < len) xCoords.push(xStart);
        if (xEnd > 0 && xEnd < len) xCoords.push(xEnd);
      });
      xCoords = [...new Set(xCoords)].sort((a, b) => a - b);

      const isTranslucent = state.wallStyle === 'translucent';
      const tolerance = 1.0; // mm
      const outlineMat = new THREE.LineBasicMaterial({
        color: 0x475569,
        linewidth: 1,
        transparent: isTranslucent,
        opacity: isTranslucent ? Math.min(1.0, state.wallOpacity * 1.5) : 1.0
      });

      const isWallHovered3D = (hovered3DWallIdx === i);

      // ── Helper: add one sub-block (solid X×Y segment for a single layer) ──
      const addLayerBlock = (x0, x1, y_bot_left, y_bot_right, y_top_left, y_top_right, layerThick, zCenter, mat) => {
        if (wallResult.corners) {
          const T = wallResult.thickness_mm || wallInput.thickness || 92.08;
          const z1 = zCenter - layerThick / 2;
          const z2 = zCenter + layerThick / 2;

          const getXStart = (z) => {
            const t = (z + T / 2) / T;
            const xs = wallResult.corners.start_neg_z + t * (wallResult.corners.start_pos_z - wallResult.corners.start_neg_z);
            if (len <= 0) return xs;
            return xs + (x0 / len) * (getXEnd_full(z) - xs);
          };

          const getXEnd_full = (z) => {
            const t = (z + T / 2) / T;
            return wallResult.corners.end_neg_z + t * (wallResult.corners.end_pos_z - wallResult.corners.end_neg_z);
          };

          const getXEnd = (z) => {
            const t = (z + T / 2) / T;
            const xs = wallResult.corners.start_neg_z + t * (wallResult.corners.start_pos_z - wallResult.corners.start_neg_z);
            const xe = getXEnd_full(z);
            if (len <= 0) return xe;
            return xs + (x1 / len) * (xe - xs);
          };

          // Define mitered vertices in local coordinates
          const v = [
            new THREE.Vector3(getXStart(z1), y_bot_left, z1),
            new THREE.Vector3(getXEnd(z1), y_bot_right, z1),
            new THREE.Vector3(getXEnd(z2), y_bot_right, z2),
            new THREE.Vector3(getXStart(z2), y_bot_left, z2),
            new THREE.Vector3(getXStart(z1), y_top_left, z1),
            new THREE.Vector3(getXEnd(z1), y_top_right, z1),
            new THREE.Vector3(getXEnd(z2), y_top_right, z2),
            new THREE.Vector3(getXStart(z2), y_top_left, z2)
          ];

          // Construct BufferGeometry
          const geom = new THREE.BufferGeometry();
          const indices = [
            0, 2, 1, 0, 3, 2, // bottom
            4, 5, 6, 4, 6, 7, // top
            0, 1, 5, 0, 5, 4, // front
            1, 2, 6, 1, 6, 5, // right
            2, 3, 7, 2, 7, 6, // back
            3, 0, 4, 3, 4, 7  // left
          ];
          const positions = [];
          indices.forEach(idx => {
            positions.push(safeGet(v, idx).x, safeGet(v, idx).y, safeGet(v, idx).z);
          });
          geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          geom.computeVertexNormals();

          const mesh = new THREE.Mesh(geom, mat);
          mesh.userData.wallIdx = i;
          mesh.userData.isWallVolume = true;
          mesh.position.set(0, 0, 0);

          const edges = new THREE.EdgesGeometry(geom);
          const edgeColor = hasErrors ? 0xef4444 : (isWallHovered3D ? 0x63b3ed : 0x475569);
          const edgeMat = new THREE.LineBasicMaterial({
            color: edgeColor,
            linewidth: hasErrors ? 2 : 1,
            transparent: isTranslucent,
            opacity: isTranslucent ? Math.min(1.0, state.wallOpacity * 1.5) : 1.0
          });
          mesh.add(new THREE.LineSegments(edges, edgeMat));
          wallGroup.add(mesh);
          return;
        }

        const shape = new THREE.Shape();
        shape.moveTo(x0, y_bot_left);
        shape.lineTo(x1, y_bot_right);
        shape.lineTo(x1, y_top_right);
        shape.lineTo(x0, y_top_left);
        shape.closePath();

        const extrudeSettings = {
          depth: layerThick + 1.6,
          bevelEnabled: false
        };
        const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        const mesh = new THREE.Mesh(geom, mat);

        // Tag wall-volume meshes for raycasting
        mesh.userData.wallIdx = i;
        mesh.userData.isWallVolume = true;
        mesh.position.set(0, 0, zCenter - (layerThick + 1.6) / 2);
        const edges = new THREE.EdgesGeometry(geom);
        // Highlight edges when hovered
        const edgeColor = hasErrors ? 0xef4444 : (isWallHovered3D ? 0x63b3ed : 0x475569);
        const edgeMat = new THREE.LineBasicMaterial({
          color: edgeColor,
          linewidth: hasErrors ? 2 : 1,
          transparent: isTranslucent,
          opacity: isTranslucent ? Math.min(1.0, state.wallOpacity * 1.5) : 1.0
        });
        mesh.add(new THREE.LineSegments(edges, edgeMat));
        wallGroup.add(mesh);
      };

      // ── Build one THREE.Material per layer (or one fallback material) ──
      let layerMaterials; // array parallel to `layers`
      if (hasErrors) {
        const errorMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(0xef4444),
          transparent: true,
          opacity: 0.35,
          roughness: 0.8,
          metalness: 0.1,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: 3,
          polygonOffsetUnits: 3,
        });
        layerMaterials = [{ mat: errorMat, zCenter: 0, layerThick: thick }];
      } else if (layers) {
        // Calculate cumulative Z offsets: layers go exterior→interior
        // The structural layer is centred at Z=0 in wall-local space;
        // finish layers extend outward on both sides.
        // Strategy: centre the whole stack at Z=0.
        const totalThick = layers.reduce((s, l) => s + l.thickness_mm, 0);
        let zCursor = -totalThick / 2;  // start at exterior face

        layerMaterials = layers.map(layer => {
          const hexStr = safeGet(LAYER_FUNCTION_COLORS, layer.function) || LAYER_FUNCTION_COLORS['Other'];
          const colNum = parseInt(hexStr.replace('#', ''), 16);
          const matProps = safeGet(LAYER_FUNCTION_MATERIAL, layer.function) || { roughness: 0.8, metalness: 0.0 };
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(colNum),
            transparent: isTranslucent,
            opacity: isTranslucent ? state.wallOpacity : 1.0,
            roughness: matProps.roughness,
            metalness: matProps.metalness,
            depthWrite: !isTranslucent,
            polygonOffset: true,
            polygonOffsetFactor: 3,
            polygonOffsetUnits: 3,
          });
          const zCenter = zCursor + layer.thickness_mm / 2;
          zCursor += layer.thickness_mm;
          return { mat, zCenter, layerThick: layer.thickness_mm };
        });
      } else {
        // Fallback: single material for the whole wall
        const wallColorHex = state.theme === 'light' ? 0xe2e8f0 : 0xd1d5db;
        const singleMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(wallColorHex),
          transparent: isTranslucent,
          opacity: isTranslucent ? state.wallOpacity : 1.0,
          roughness: 0.8,
          metalness: 0.1,
          depthWrite: !isTranslucent,
          polygonOffset: true,
          polygonOffsetFactor: 3,
          polygonOffsetUnits: 3,
        });
        layerMaterials = [{ mat: singleMat, zCenter: 0, layerThick: thick }];
      }

      // ── Render each X segment for every layer ──
      for (let j = 0; j < xCoords.length - 1; j++) {
        const x0 = safeGet(xCoords, j);
        const x1 = safeGet(xCoords, j + 1);
        const segWidth = x1 - x0;
        if (segWidth < tolerance) continue;

        const segmentOpenings = openings.filter(op => {
          const xStart = op.x_offset || 0;
          const xEnd = xStart + op.width;
          return (x0 >= xStart - tolerance && x1 <= xEnd + tolerance);
        });

        if (segmentOpenings.length === 0) {
          // Solid column — render full height for each layer
          layerMaterials.forEach(({ mat, zCenter, layerThick }) => {
            const y0_bot = getWallBaseAt(x0);
            const y1_bot = getWallBaseAt(x1);
            const y0_top = getWallHeightAt(x0);
            const y1_top = getWallHeightAt(x1);
            addLayerBlock(x0, x1, y0_bot, y1_bot, y0_top, y1_top, layerThick, zCenter, mat);
          });
        } else {
          // Partition vertically around openings, then render per layer
          let yCoords = [0, height];
          segmentOpenings.forEach(op => {
            const yStart = op.sill_height || 0;
            const yEnd = yStart + op.height;
            if (yStart > 0 && yStart < height) yCoords.push(yStart);
            if (yEnd > 0 && yEnd < height) yCoords.push(yEnd);
          });
          yCoords = [...new Set(yCoords)].sort((a, b) => a - b);

          for (let k = 0; k < yCoords.length - 1; k++) {
            const y0 = safeGet(yCoords, k);
            const y1 = safeGet(yCoords, k + 1);
            const segHeight = y1 - y0;
            if (segHeight < tolerance) continue;

            const isCovered = segmentOpenings.some(op => {
              const yStart = op.sill_height || 0;
              const yEnd = yStart + op.height;
              return (y0 >= yStart - tolerance && y1 <= yEnd + tolerance);
            });

            if (!isCovered) {
              layerMaterials.forEach(({ mat, zCenter, layerThick }) => {
                const isTopSegment = Math.abs(y1 - height) < tolerance;
                const isBottomSegment = Math.abs(y0 - 0) < tolerance;
                let y0_top, y1_top;
                if (isTopSegment) {
                  y0_top = getWallHeightAt(x0);
                  y1_top = getWallHeightAt(x1);
                } else {
                  y0_top = y1;
                  y1_top = y1;
                }
                let y0_bot, y1_bot;
                if (isBottomSegment) {
                  y0_bot = getWallBaseAt(x0);
                  y1_bot = getWallBaseAt(x1);
                } else {
                  y0_bot = y0;
                  y1_bot = y0;
                }
                addLayerBlock(x0, x1, y0_bot, y1_bot, y0_top, y1_top, layerThick, zCenter, mat);
              });
            }
          }
        }
      }
    }

    // Draw wall selection highlight overlay if selected
    const isWallSelected = state.selectedWallIndices && state.selectedWallIndices.includes(i);
    if (isWallSelected) {
      const len = wallResult.length_mm || wallInput.length || 0;
      const height = wallResult.height_mm || wallInput.height || 0;
      const thick = wallResult.thickness_mm || wallInput.thickness || 92.08;
      const layers = (wallInput.layers && wallInput.layers.length > 0) ? wallInput.layers : null;
      const totalThick = layers ? layers.reduce((s, l) => s + l.thickness_mm, 0) : thick;

      const h_start = wallResult.height_start !== undefined ? wallResult.height_start : (wallInput.height_start !== undefined ? wallInput.height_start : height);
      const h_end = wallResult.height_end !== undefined ? wallResult.height_end : (wallInput.height_end !== undefined ? wallInput.height_end : height);
      const b_start = wallResult.base_start !== undefined ? wallResult.base_start : (wallInput.base_start !== undefined ? wallInput.base_start : 0.0);
      const b_end = wallResult.base_end !== undefined ? wallResult.base_end : (wallInput.base_end !== undefined ? wallInput.base_end : 0.0);

      const shape = new THREE.Shape();
      shape.moveTo(0, b_start);
      shape.lineTo(len, b_end);
      shape.lineTo(len, h_end);
      shape.lineTo(0, h_start);
      shape.closePath();

      const extrudeSettings = {
        depth: totalThick + 2.0,
        bevelEnabled: false
      };
      const selGeom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      const selMat = new THREE.MeshStandardMaterial({
        color: 0x3182ce,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1
      });
      const selMesh = new THREE.Mesh(selGeom, selMat);
      selMesh.position.set(0, 0, -(totalThick + 2.0) / 2.0);

      const selOutlineGeom = new THREE.EdgesGeometry(selGeom);
      const selOutlineMat = new THREE.LineBasicMaterial({ color: 0x3182ce, linewidth: 2 });
      selMesh.add(new THREE.LineSegments(selOutlineGeom, selOutlineMat));

      wallGroup.add(selMesh);
    }

    // Render Panel Name tag in 3D if showPanelNames is true
    if (getActiveVisibilitySettings().showPanelNames) {
      const len = wallResult.length_mm || wallInput.length || 0;
      const height = wallResult.height_mm || wallInput.height || 0;
      const thick = wallResult.thickness_mm || wallInput.thickness || 92.08;
      const layers = (wallInput.layers && wallInput.layers.length > 0) ? wallInput.layers : null;
      const labelThick = layers ? layers.reduce((s, l) => s + l.thickness_mm, 0) : thick;
      const labelText = `Panel ${wallInput.label || wallInput.wall_id}`;

      const isSelected = state.selectedWallIndices && state.selectedWallIndices.includes(i);
      const isHovered = (hovered3DWallIdx === i);

      const texture = createPanelNameTexture(labelText, isSelected, isHovered);
      const labelH = 200; // mm
      const aspect = texture.sourceWidth / texture.sourceHeight;
      const labelW = labelH * aspect;
      const labelGeom = new THREE.PlaneGeometry(labelW, labelH);

      const labelMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.5,
        side: THREE.FrontSide
      });

      const defaultBg = getPanelBadgeStyle(isSelected, isHovered).bg;

      // Front side label
      const frontLabel = new THREE.Mesh(labelGeom, labelMat);
      frontLabel.position.set(len / 2, height / 2, labelThick / 2 + 5);
      frontLabel.userData.wallIdx = i;
      frontLabel.userData.isPanelLabel = true;
      frontLabel.userData.currentColor = defaultBg;
      frontLabel.userData.currentTheme = state.theme;
      wallGroup.add(frontLabel);

      // Back side label
      const backLabelMat = new THREE.MeshBasicMaterial({
        map: createPanelNameTexture(labelText, isSelected, isHovered),
        transparent: true,
        alphaTest: 0.5,
        side: THREE.FrontSide
      });
      const backLabel = new THREE.Mesh(labelGeom, backLabelMat);
      backLabel.position.set(len / 2, height / 2, -labelThick / 2 - 5);
      backLabel.rotation.y = Math.PI;
      backLabel.userData.wallIdx = i;
      backLabel.userData.isPanelLabel = true;
      backLabel.userData.currentColor = defaultBg;
      backLabel.userData.currentTheme = state.theme;
      wallGroup.add(backLabel);
    }

    scene3D.add(wallGroup);

    // Expand bounding box to frame the camera later
    const box = new THREE.Box3().setFromObject(wallGroup);
    boundingBox.union(box);
  });

  // 3D Join Markers removed by request

  // Frame camera to fit all walls — only on first render after a wall load, not on every re-render.
  if (!boundingBox.isEmpty() && !camera3DFramed) {
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    const size = new THREE.Vector3();
    boundingBox.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera3D.fov * (Math.PI / 180);
    let cameraZ = maxDim / (2 * Math.tan(fov / 2));
    cameraZ *= 1.5; // zoom out a bit

    camera3D.position.set(center.x + cameraZ * 0.5, center.y + cameraZ * 0.5, center.z + cameraZ);
    controls3D.target.copy(center);
    controls3D.update();
    camera3DFramed = true;
  }

  if (camera3DFramed) {
    updateOrbitTarget();
  }
}

// ─── Revit Parameters Display ─────────────────────────────────────────

function toggleSection(id) {
  const el = getEl(id);
  const toggle = getEl(id.replace('Section', 'Toggle'));
  const chevron = toggle ? toggle.querySelector('.chevron-icon') : null;
  if (el.style.display === 'none') {
    el.style.display = '';
    if (chevron) chevron.classList.remove('collapsed');
  } else {
    el.style.display = 'none';
    if (chevron) chevron.classList.add('collapsed');
  }
}

function autoOpenPropertiesSection() {
  const el = getEl('propertiesSection');
  const toggle = getEl('propertiesToggle');
  const chevron = toggle ? toggle.querySelector('.chevron-icon') : null;
  if (el && el.style.display === 'none') {
    el.style.display = '';
    if (chevron) chevron.classList.remove('collapsed');
  }

  // Collapse other sections
  ['generalSettingsSection', 'memberSection', 'wallInfoSection'].forEach(id => {
    const sec = getEl(id);
    const t = getEl(id.replace('Section', 'Toggle'));
    const chev = t ? t.querySelector('.chevron-icon') : null;
    if (sec) {
      sec.style.display = 'none';
      if (chev) chev.classList.add('collapsed');
    }
  });

  // Reset scroll
  if (el) el.scrollTop = 0;
}

function getRevitParamsHtml(input) {
  const params = input?.revit_parameters;
  if (!params || Object.keys(params).length === 0) return '';

  // Group params: built-in first, then instance, then type
  const builtIn = [], instance = [], type = [];
  for (const [k, v] of Object.entries(params)) {
    if (['Element ID', 'Category', 'Family Name', 'Type Name', 'Wall Kind', 'Base Level'].includes(k)) {
      builtIn.push([k, v]);
    } else if (k.startsWith('[Type] ')) {
      type.push([k.replace('[Type] ', ''), v]);
    } else {
      instance.push([k, v]);
    }
  }

  let html = `<div style="margin-top:12px;padding-top:8px;border-top:1px solid var(--border-color);">`;
  const renderGroup = (label, items) => {
    if (items.length === 0) return;
    html += '<div style="margin-top:8px;margin-bottom:4px"><span style="font-size:10px;color:var(--accent);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">' + escapeHtml(label) + '</span></div>';
    items.forEach(([k, v]) => {
      const displayVal = v || '—';
      html += '<div class="wall-stat" style="font-size:11px">' +
        '<span class="label" style="max-width:110px;overflow:hidden;text-overflow:ellipsis" title="' + escapeHtml(k) + '">' + escapeHtml(k) + '</span>' +
        '<span class="value" style="max-width:110px;overflow:hidden;text-overflow:ellipsis;word-break:break-all" title="' + escapeHtml(displayVal) + '">' + escapeHtml(displayVal) + '</span>' +
      '</div>';
    });
  };

  renderGroup('Identity', builtIn);
  renderGroup('Instance Parameters', instance);
  renderGroup('Type Parameters', type);
  html += `</div>`;
  return html;
}

// ─── Filter System ────────────────────────────────────────────────────

const FILTER_CONDITIONS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Not Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'starts_with', label: 'Starts With' },
  { value: 'ends_with', label: 'Ends With' },
  { value: 'has_value', label: 'Has Value' },
  { value: 'has_no_value', label: 'Has No Value' },
];

function getAvailableParams() {
  if (!state.wallsData) return [];
  const keys = new Set();
  // Add geometry keys
  ['wall_id', 'label', 'length', 'height', 'thickness'].forEach(k => keys.add(k));
  // Add all revit_parameters keys across all walls
  state.wallsData.forEach(w => {
    if (w.revit_parameters) {
      Object.keys(w.revit_parameters).forEach(k => keys.add(k));
    }
  });
  return Array.from(keys).sort();
}

function addFilterRow() {
  const container = getEl('filterRows');
  const row = document.createElement('div');
  row.className = 'filter-row filter-row-card';
  row.style.cssText = 'position: relative; border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 16px; background: rgba(0,0,0,0.15); margin-bottom: 12px; display: flex; flex-direction: column; gap: 10px;';

  const params = getAvailableParams();
  const paramOptions = params.map(p => '<option value="' + escapeHtml(p) + '">' + escapeHtml(p) + '</option>').join('');
  const condOptions = FILTER_CONDITIONS.map(c => '<option value="' + escapeHtml(c.value) + '">' + escapeHtml(c.label) + '</option>').join('');

  row.innerHTML = `
    <!-- Close button top right -->
    <button class="btn-close-large" style="position: absolute; top: 8px; right: 8px;" onclick="this.parentElement.remove(); applyFilters();">&times;</button>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
      <!-- Parameter Field -->
      <div class="field-container">
        <label class="field-label">Parameter Name</label>
        <select class="filter-param md-select-large">
          ${paramOptions}
        </select>
        <span class="field-note filter-param-note">Select property or dimension to check</span>
      </div>
      
      <!-- Condition Field -->
      <div class="field-container">
        <label class="field-label">Condition Rule</label>
        <select class="filter-cond md-select-large" onchange="toggleFilterValue(this)">
          ${condOptions}
        </select>
        <span class="field-note">Select how to compare the values</span>
      </div>
    </div>
    
    <!-- Value Field -->
    <div class="field-container filter-val-container">
      <label class="field-label">Comparison Value</label>
      <input class="filter-val md-textfield-large" type="text" placeholder="e.g. W-1 or 3000">
      <span class="field-note filter-val-note">Type matching text or number</span>
    </div>
  `;

  const paramSel = row.querySelector('.filter-param');
  const paramNote = row.querySelector('.filter-param-note');
  const valNote = row.querySelector('.filter-val-note');

  const updateNotes = () => {
    const val = paramSel.value;
    if (val === 'wall_id') {
      paramNote.textContent = 'Unique Revit Element ID';
      valNote.textContent = 'Enter exact ID or substring';
    } else if (val === 'length' || val === 'height' || val === 'thickness') {
      paramNote.textContent = `Wall dimension: ${val}`;
      valNote.textContent = 'Enter numeric value (mm or ft-in)';
    } else if (val === 'label') {
      paramNote.textContent = 'Text Label of the wall';
      valNote.textContent = 'Enter wall label text';
    } else {
      paramNote.textContent = 'Revit custom parameter';
      valNote.textContent = 'Enter target value';
    }
  };

  paramSel.addEventListener('change', updateNotes);
  updateNotes(); // Init once

  container.appendChild(row);
}

function toggleFilterValue(condSelect) {
  const row = condSelect.closest('.filter-row');
  const valContainer = row.querySelector('.filter-val-container');
  const needsVal = !['has_value', 'has_no_value'].includes(condSelect.value);
  valContainer.style.display = needsVal ? 'flex' : 'none';
}

function getWallParamValue(wallIdx, paramName) {
  const w = safeGet(state.wallsData, wallIdx);
  if (!w) return '';
  if (paramName === 'wall_id') return w.wall_id || '';
  if (paramName === 'label') return w.label || '';
  if (paramName === 'length') return String(w.length || '');
  if (paramName === 'height') return String(w.height || '');
  if (paramName === 'thickness') return String(w.thickness || '');
  return (w.revit_parameters && safeGet(w.revit_parameters, paramName)) || '';
}

function evaluateFilter(wallIdx, param, condition, value) {
  const val = getWallParamValue(wallIdx, param).toLowerCase();
  const target = (value || '').toLowerCase();

  switch (condition) {
    case 'equals': return val === target;
    case 'not_equals': return val !== target;
    case 'contains': return val.includes(target);
    case 'starts_with': return val.startsWith(target);
    case 'ends_with': return val.endsWith(target);
    case 'has_value': return val.length > 0;
    case 'has_no_value': return val.length === 0;
    default: return true;
  }
}

function applyFilters() {
  const rows = document.querySelectorAll('#filterRows .filter-row');
  if (rows.length === 0) {
    state.filteredIndices = state.wallsData ? state.wallsData.map((_, i) => i) : [];
    getEl('filterCount').textContent = state.filteredIndices.length;
    const modalStatus = getEl('modalFilterStatus');
    const modalSave = getEl('modalSaveSection');
    if (modalStatus && modalSave) {
      modalStatus.innerHTML = '';
      modalSave.style.display = 'none';
    }
    return;
  }

  const filters = [];
  rows.forEach(row => {
    filters.push({
      param: row.querySelector('.filter-param').value,
      condition: row.querySelector('.filter-cond').value,
      value: row.querySelector('.filter-val').value,
    });
  });

  const logic = getEl('filterLogic').value;
  const indices = [];

  state.wallsData.forEach((_, i) => {
    const results = filters.map(f => evaluateFilter(i, f.param, f.condition, f.value));
    const pass = logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
    if (pass) indices.push(i);
  });

  state.filteredIndices = indices;
  getEl('filterCount').textContent = `${indices.length}/${state.wallsData.length}`;

  const sel = getEl('wallSelect');
  for (let i = 0; i < sel.options.length; i++) {
    const opt = safeGet(sel.options, i);
    const isMatch = indices.includes(parseInt(opt.value));
    opt.style.fontWeight = isMatch ? '600' : '';
  }
  updateWallDropdownOptions();

  // Update status in modal
  const modalStatus = getEl('modalFilterStatus');
  const modalSave = getEl('modalSaveSection');
  if (modalStatus && modalSave) {
    modalStatus.innerHTML = 'Found: <strong>' + indices.length + ' matched</strong>';
    modalSave.style.display = 'flex';
  }
}

function clearFilters() {
  getEl('filterRows').innerHTML = '';
  getEl('filterCount').textContent = '—';
  state.filteredIndices = [];
  if (state.wallsData) {
    const sel = getEl('wallSelect');
    for (let i = 0; i < sel.options.length; i++) {
      safeGet(sel.options, i).style.fontWeight = '';
    }
    updateWallDropdownOptions();
  }
  const activeFilterStatus = getEl('activeFilterStatus');
  if (activeFilterStatus) activeFilterStatus.style.display = 'none';
  const saveForm = getEl('saveGroupForm');
  if (saveForm) saveForm.style.display = 'none';

  // Hide modal status & save section
  const modalStatus = getEl('modalFilterStatus');
  const modalSave = getEl('modalSaveSection');
  if (modalStatus && modalSave) {
    modalStatus.innerHTML = '';
    modalSave.style.display = 'none';
  }
}

// ─── Wall Groups ──────────────────────────────────────────────────────

// Groups are temporary (session-only)
function loadGroups() {
  // No loading from localStorage
}

function saveGroups() {
  // No saving to localStorage
}

function createGroup() {
  const name = getEl('groupNameInput').value.trim();
  if (!name) { showToast('Enter a group name'); return; }

  const indices = state.filteredIndices.length > 0
    ? [...state.filteredIndices]
    : (state.wallsData ? state.wallsData.map((_, i) => i) : []);

  if (indices.length === 0) { showToast('No walls to group'); return; }

  state.wallGroups[name] = {
    wallIndices: indices,
    config: null,
    configName: null,
  };

  renderGroups();
  getEl('groupNameInput').value = '';

  const saveForm = getEl('saveGroupForm');
  if (saveForm) saveForm.style.display = 'none';
  const activeFilterStatus = getEl('activeFilterStatus');
  if (activeFilterStatus) activeFilterStatus.style.display = 'none';
  clearFilters();

  // Close the modal with animation
  const modal = getEl('filterModal');
  if (modal && !modal.classList.contains('hidden')) {
    const closeBtn = getEl('btnCloseFilterModal');
    if (closeBtn) {
      closeBtn.click();
    } else {
      modal.classList.add('hidden');
    }
  }
}

function deleteGroup(name) {
  if (safeGet(state.wallGroups, name)) {
    safeDelete(state.wallGroups, name);
    renderGroups();
  }
}

async function applyConfigToGroup(groupName) {
  const group = safeGet(state.wallGroups, groupName);
  if (!group) return;

  const selectEl = document.getElementById('groupConfig_' + encodeURIComponent(groupName));
  const selectedConfig = selectEl ? selectEl.value : '__current__';

  let config;
  let configName;

  if (selectedConfig === '__current__') {
    syncAllInputs();
    config = collectOverrides();
    configName = 'Current Panel';
  } else {
    try {
      const savedConfig = await api.get(`/api/configs?name=${encodeURIComponent(selectedConfig)}`);
      const add = savedConfig.additional_settings || {};
      config = {
        stud_spacing: savedConfig.stud?.default_spacing_mm || 609.6,
        stud_depth: savedConfig.stud?.default_depth_mm,
        stud_flange: savedConfig.stud?.default_flange_mm || 31.75,
        stud_gauge: savedConfig.stud?.default_gauge_mm || 0.893,
        track_depth: savedConfig.track?.default_depth_mm,
        track_flange: savedConfig.track?.default_flange_mm || 31.75,
        track_gauge: savedConfig.track?.default_gauge_mm || 0.893,
        use_king_studs: savedConfig.opening_rules?.king_studs ?? true,
        use_trimmer_studs: savedConfig.opening_rules?.trimmer_studs ?? true,
        use_cripple_studs: savedConfig.opening_rules?.cripple_studs ?? true,
        use_nogging: savedConfig.nogging?.enabled ?? true,
        king_stud_mode: savedConfig.opening_rules?.king_stud_mode || 'full_height',

        stud_top_offset_mm: add.stud_top_offset_mm ?? savedConfig.stud_top_offset_mm ?? 0,
        stud_bottom_offset_mm: add.stud_bottom_offset_mm ?? savedConfig.stud_bottom_offset_mm ?? 0,
        top_track_offset_mm: add.top_track_offset_mm ?? savedConfig.top_track_offset_mm ?? 0,
        bottom_track_offset_mm: add.bottom_track_offset_mm ?? savedConfig.bottom_track_offset_mm ?? 0,

        end_stud_mode: add.end_stud_mode ?? savedConfig.end_stud_mode ?? 'default',
        end_stud_ssma: add.end_stud_ssma ?? savedConfig.end_stud_ssma ?? '',
        end_stud_depth_mm: add.end_stud_depth_mm ?? savedConfig.end_stud_depth_mm ?? 0,
        end_stud_flange_mm: add.end_stud_flange_mm ?? savedConfig.end_stud_flange_mm ?? 0,
        end_stud_gauge_mm: add.end_stud_gauge_mm ?? savedConfig.end_stud_gauge_mm ?? 0,

        king_stud_profile_mode: add.king_stud_profile_mode ?? savedConfig.king_stud_profile_mode ?? 'default',
        king_stud_ssma: add.king_stud_ssma ?? savedConfig.king_stud_ssma ?? '',
        king_stud_depth_mm: add.king_stud_depth_mm ?? savedConfig.king_stud_depth_mm ?? 0,
        king_stud_flange_mm: add.king_stud_flange_mm ?? savedConfig.king_stud_flange_mm ?? 0,
        king_stud_gauge_mm: add.king_stud_gauge_mm ?? savedConfig.king_stud_gauge_mm ?? 0,

        top_track_mode: add.top_track_mode ?? savedConfig.top_track_mode ?? 'default',
        top_track_ssma: add.top_track_ssma ?? savedConfig.top_track_ssma ?? '',
        top_track_depth_mm: add.top_track_depth_mm ?? savedConfig.top_track_depth_mm ?? 0,
        top_track_flange_mm: add.top_track_flange_mm ?? savedConfig.top_track_flange_mm ?? 0,
        top_track_gauge_mm: add.top_track_gauge_mm ?? savedConfig.top_track_gauge_mm ?? 0,

        bottom_track_mode: add.bottom_track_mode ?? savedConfig.bottom_track_mode ?? 'default',
        bottom_track_ssma: add.bottom_track_ssma ?? savedConfig.bottom_track_ssma ?? '',
        bottom_track_depth_mm: add.bottom_track_depth_mm ?? savedConfig.bottom_track_depth_mm ?? 0,
        bottom_track_flange_mm: add.bottom_track_flange_mm ?? savedConfig.bottom_track_flange_mm ?? 0,
        bottom_track_gauge_mm: add.bottom_track_gauge_mm ?? savedConfig.bottom_track_gauge_mm ?? 0,
      };
      if (savedConfig.header_rules) config.header_rules = savedConfig.header_rules;
      if (savedConfig.king_stud_rules) config.king_stud_rules = savedConfig.king_stud_rules;
      if (savedConfig.custom_headers) config.custom_headers = savedConfig.custom_headers;
      if (savedConfig.custom_kings) config.custom_kings = savedConfig.custom_kings;
      configName = selectedConfig;

      // Mismatch warning check
      if (configName !== 'us_default' && config.stud_depth) {
        let hasMismatch = false;
        let mismatchedWidth = null;
        for (let idx of group.wallIndices) {
          const w = safeGet(state.wallsData, idx);
          if (w && w.thickness && Math.abs(w.thickness - config.stud_depth) > 0.01) {
            hasMismatch = true;
            mismatchedWidth = w.thickness;
            break;
          }
        }

        if (hasMismatch) {
          const proceed = await showConfirm(`Warning: The selected configuration uses a Stud Size (${config.stud_depth}mm) that does not match the Structural Width (${mismatchedWidth}mm) of some selected walls. Do you want to proceed?`);
          if (!proceed) return;
        }
      }

    } catch (err) {
      showToast(`Failed to load config '${selectedConfig}': ${err.message}`);
      return;
    }
  }

  group.config = config;
  group.configName = configName;

  // FORCE override ALL walls in the group — clears any previous manual customization
  if (!state.wallConfigNames) state.wallConfigNames = {};
  group.wallIndices.forEach(idx => {
    safeSet(state.perWallOverrides, idx, { ...config });
    safeSet(state.wallConfigNames, idx, configName);
  });

  renderGroups();
  updateWallInfo();

  if (group.wallIndices.includes(state.currentWallIdx)) {
    await restoreWallConfig(state.currentWallIdx);
  }

  await runFraming();
}

async function selectGroupWalls(groupName) {
  const group = safeGet(state.wallGroups, groupName);
  if (!group) return;

  state.filteredIndices = [...group.wallIndices];
  getEl('filterCount').textContent = `${group.wallIndices.length}/${state.wallsData?.length || 0}`;

  const sel = getEl('wallSelect');
  for (let i = 0; i < sel.options.length; i++) {
    const opt = safeGet(sel.options, i);
    const isMatch = group.wallIndices.includes(parseInt(opt.value));
    opt.style.fontWeight = isMatch ? '600' : '';
    opt.textContent = (isMatch ? '✓ ' : '') + (safeGet(state.wallsData, i)?.label || safeGet(state.wallsData, i)?.wall_id || `Wall ${i}`);
  }

  if (group.wallIndices.length > 0) {
    state.currentWallIdx = group.wallIndices[0];
    sel.value = state.currentWallIdx;
    await restoreWallConfig(state.currentWallIdx);
    fitView(); render(); updateMemberSummary(); updateWallInfo();
  }
}

function renderGroups() {
  const el = getEl('wallGroups');
  if (!el) return;

  const groups = Object.entries(state.wallGroups);
  if (groups.length === 0) {
    el.innerHTML = '<p class="muted" style="font-size:11px">No groups created</p>';
    return;
  }

  // Build config options from the configSelect dropdown
  const configOpts = [];
  const cs = getEl('configSelect');
  if (cs) {
    for (let i = 0; i < cs.options.length; i++) {
      if (safeGet(cs.options, i).value !== 'Custom *') {
        const opt = safeGet(cs.options, i);
        if (opt) {
          configOpts.push({ value: opt.value, text: opt.text });
        }
      }
    }
  }

  let html = '';
  groups.forEach(([name, g]) => {
    const encoded = encodeURIComponent(name);

    // Build options specific to this group to select the active config
    const isCurrent = g.configName === 'Current Panel' || !g.configName;
    const groupConfigOptsHtml = '<option value="__current__"' + (isCurrent ? ' selected' : '') + '>Current Panel</option>' +
      configOpts.map(c => '<option value="' + escapeHtml(c.value) + '"' + (c.value === g.configName ? ' selected' : '') + '>' + escapeHtml(c.text) + '</option>').join('');

    html +=
      '<div class="group-card" data-group="' + escapeHtml(encoded) + '" style="margin-bottom:6px;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:6px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
          '<span class="group-name-click" style="font-size:12px;font-weight:600;color:var(--text-primary);cursor:pointer" title="Click to select walls">' + escapeHtml(name) + '</span>' +
          '<div style="display:flex;gap:2px;align-items:center">' +
            '<span class="badge" style="font-size:9px">' + g.wallIndices.length + ' walls</span>' +
            '<button class="group-delete-btn btn" style="padding:1px 4px;font-size:9px;line-height:1" title="Delete group">✕</button>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:3px;align-items:center">' +
          '<select class="styled-select group-config-select" id="groupConfig_' + escapeHtml(encoded) + '" style="flex:1;font-size:10px;padding:2px 3px">' + groupConfigOptsHtml + '</select>' +
          '<button class="group-apply-btn btn btn-primary" style="padding:2px 8px;font-size:10px;white-space:nowrap">Apply</button>' +
        '</div>' +
        (g.configName ? '<div style="margin-top:3px;font-size:9px;color:var(--accent)">✓ ' + escapeHtml(g.configName) + '</div>' : '') +
      '</div>';
  });
  el.innerHTML = html;

  // Attach events via delegation (avoids quoting issues with inline onclick)
  el.querySelectorAll('.group-card').forEach(card => {
    const gName = decodeURIComponent(card.dataset.group);
    card.querySelector('.group-name-click')?.addEventListener('click', () => selectGroupWalls(gName));
    card.querySelector('.group-delete-btn')?.addEventListener('click', () => deleteGroup(gName));
    card.querySelector('.group-apply-btn')?.addEventListener('click', () => applyConfigToGroup(gName));
  });
}

// ─── Init filter/group event listeners ────────────────────────────────

function initFilterModal() {
  const openBtn = getEl('btnOpenFilterModal');
  const closeBtn = getEl('btnCloseFilterModal');
  const applyBtn = getEl('btnModalApply');
  const addRowBtn = getEl('btnModalAddRow');
  const modal = getEl('filterModal');
  const content = getEl('filterModalContent');

  // Smooth collapse animation back to button position
  function closeModal() {
    const filterBtn = getEl('filterWidgetMinimized').style.display !== 'none'
      ? getEl('filterWidgetMinimized')
      : openBtn;

    if (filterBtn && content) {
      content.style.pointerEvents = 'none'; // Block click-throughs during animation!
      const btnRect = filterBtn.getBoundingClientRect();
      const modalRect = content.getBoundingClientRect();
      const deltaX = (btnRect.left + btnRect.width / 2) - (modalRect.left + modalRect.width / 2);
      const deltaY = (btnRect.top + btnRect.height / 2) - (modalRect.top + modalRect.height / 2);

      content.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease';
      content.style.transformOrigin = 'center center';
      content.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.05)`;
      content.style.opacity = '0';

      setTimeout(() => {
        modal.classList.add('hidden');
        content.style.transition = '';
        content.style.transform = '';
        content.style.opacity = '';
      }, 400);
    } else {
      modal.classList.add('hidden');
    }
  }

  // Spring open animation from the button position
  openBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Toggle: if modal is already open, close/minimize it
    if (!modal.classList.contains('hidden')) {
      closeModal();
      return;
    }

    modal.classList.remove('hidden');
    content.style.pointerEvents = 'auto';

    const btnRect = openBtn.getBoundingClientRect();
    content.style.transition = '';
    content.style.opacity = '0';

    // Let browser calculate final centered rect
    setTimeout(() => {
      const modalRect = content.getBoundingClientRect();
      const deltaX = (btnRect.left + btnRect.width / 2) - (modalRect.left + modalRect.width / 2);
      const deltaY = (btnRect.top + btnRect.height / 2) - (modalRect.top + modalRect.height / 2);

      // Start collapsed at button
      content.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(0.05)`;
      content.style.opacity = '0';

      content.offsetHeight; // Force repaint

      // Bouncy spring to center
      content.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease';
      content.style.transform = 'translate(0px, 0px) scale(1)';
      content.style.opacity = '1';
    }, 10);

    const container = getEl('filterRows');
    if (container && container.children.length === 0) {
      addFilterRow();
    }

    // Reset modal save section
    const modalSaveSection = getEl('modalSaveSection');
    if (modalSaveSection) modalSaveSection.style.display = 'none';
    const statusEl = getEl('modalFilterStatus');
    if (statusEl) statusEl.innerHTML = '';
  });

  closeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeModal();
  });

  applyBtn?.addEventListener('click', () => {
    applyFilters();
    // Do NOT close the modal. Let user see results and option to save group!
    const activeFilterStatus = getEl('activeFilterStatus');
    if (activeFilterStatus) {
      if (state.filteredIndices && state.filteredIndices.length > 0) {
        activeFilterStatus.style.display = 'block';
      } else {
        activeFilterStatus.style.display = 'none';
      }
    }
  });

  addRowBtn?.addEventListener('click', addFilterRow);

  // Minimize Widget listeners
  getEl('btnMinimizeWidget')?.addEventListener('click', () => {
    getEl('filterGroupsWidget').style.display = 'none';
    getEl('filterWidgetMinimized').style.display = 'flex';
  });

  getEl('filterWidgetMinimized')?.addEventListener('click', () => {
    getEl('filterWidgetMinimized').style.display = 'none';
    getEl('filterGroupsWidget').style.display = 'flex';
  });

  // Dragging
  makeModalDraggable('filterModalHeader', 'filterModalContent');
}

function makeModalDraggable(headerId, contentId) {
  const header = getEl(headerId);
  const content = getEl(contentId);
  if (!header || !content) return;

  let posX = 0, posY = 0, mouseX = 0, mouseY = 0;
  header.addEventListener('mousedown', dragMouseDown);

  function dragMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    mouseX = e.clientX;
    mouseY = e.clientY;
    document.addEventListener('mouseup', closeDragElement);
    document.addEventListener('mousemove', elementDrag);
  }

  function elementDrag(e) {
    e.preventDefault();
    posX = mouseX - e.clientX;
    posY = mouseY - e.clientY;
    mouseX = e.clientX;
    mouseY = e.clientY;

    const newTop = content.offsetTop - posY;
    const newLeft = content.offsetLeft - posX;

    const maxTop = window.innerHeight - 100;
    const maxLeft = window.innerWidth - 100;

    content.style.top = Math.max(10, Math.min(newTop, maxTop)) + "px";
    content.style.left = Math.max(10, Math.min(newLeft, maxLeft)) + "px";
  }

  function closeDragElement() {
    document.removeEventListener('mouseup', closeDragElement);
    document.removeEventListener('mousemove', elementDrag);
  }
}

// Bind events
initFilterModal();
getEl('btnClearFilter')?.addEventListener('click', clearFilters);
getEl('btnCreateGroup')?.addEventListener('click', createGroup);

// Load groups from localStorage on startup (currently disabled)
loadGroups();
renderGroups();

// ─── Plan View & Element Info Logic ─────────────────────────────────

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function p2s(gx, gy) {
  return [
    state.planPanX + gx * state.planZoom,
    state.planPanY - gy * state.planZoom
  ];
}

function s2p(sx, sy) {
  return [
    (sx - state.planPanX) / state.planZoom,
    (state.planPanY - sy) / state.planZoom
  ];
}

function localToGlobal(lx, ly, lz, wall) {
  const originX = wall.origin_x || 0;
  const originY = wall.origin_y || 0;
  const originZ = wall.origin_z || 0;
  const dx = wall.direction_x !== undefined ? wall.direction_x : 1;
  const dy = wall.direction_y !== undefined ? wall.direction_y : 0;

  const gx = originX + lx * dx - lz * dy;
  const gy = originY + lx * dy + lz * dx;
  const gz = originZ + ly;
  return { x: gx, y: gy, z: gz };
}

function getLineIntersection(p1, p2, p3, p4) {
  const det = (p2.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p2.y - p1.y);
  if (Math.abs(det) < 1e-5) return null; // Parallel or collinear

  const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p4.x - p3.x) * (p3.y - p1.y)) / det;

  // We treat the grid line (p3 to p4) as infinite.
  // As long as the intersection point lies on the wall segment (p1 to p2), we draw it.
  if (u >= 0 && u <= 1) {
    return {
      x: p1.x + u * (p2.x - p1.x),
      y: p1.y + u * (p2.y - p1.y)
    };
  }
  return null;
}

function globalToLocal(gx, gy, wall) {
  const originX = wall.origin_x || 0;
  const originY = wall.origin_y || 0;
  const dx = wall.direction_x !== undefined ? wall.direction_x : 1;
  const dy = wall.direction_y !== undefined ? wall.direction_y : 0;

  const lx = (gx - originX) * dx + (gy - originY) * dy;
  const lz = -(gx - originX) * dy + (gy - originY) * dx;
  return { lx, lz };
}

function drawLocalRect(lx, lz, w_local, d_local, wall, fillColor, strokeColor, lineWidth, isSelected, m) {
  let localCorners;
  if (wall && wall.corners) {
    const T = wall.thickness || 92.08;
    const z1 = lz - d_local / 2;
    const z2 = lz + d_local / 2;

    const getXStart = (z) => {
      const t = (z + T / 2) / T;
      const xs = wall.corners.start_neg_z + t * (wall.corners.start_pos_z - wall.corners.start_neg_z);
      const len = wall.length || 0;
      if (len <= 0) return xs;
      const x0 = lx - w_local / 2;
      return xs + (x0 / len) * (getXEnd_full(z) - xs);
    };

    const getXEnd_full = (z) => {
      const t = (z + T / 2) / T;
      return wall.corners.end_neg_z + t * (wall.corners.end_pos_z - wall.corners.end_neg_z);
    };

    const getXEnd = (z) => {
      const t = (z + T / 2) / T;
      const xs = wall.corners.start_neg_z + t * (wall.corners.start_pos_z - wall.corners.start_neg_z);
      const xe = getXEnd_full(z);
      const len = wall.length || 0;
      if (len <= 0) return xe;
      const x1 = lx + w_local / 2;
      return xs + (x1 / len) * (xe - xs);
    };

    localCorners = [
      { lx: getXStart(z1), lz: z1 },
      { lx: getXEnd(z1), lz: z1 },
      { lx: getXEnd(z2), lz: z2 },
      { lx: getXStart(z2), lz: z2 }
    ];
  } else {
    const x1 = lx - w_local / 2;
    const x2 = lx + w_local / 2;
    const z1 = lz - d_local / 2;
    const z2 = lz + d_local / 2;

    localCorners = [
      { lx: x1, lz: z1 },
      { lx: x2, lz: z1 },
      { lx: x2, lz: z2 },
      { lx: x1, lz: z2 }
    ];
  }

  const screenCorners = localCorners.map(c => {
    const g = localToGlobal(c.lx, 0, c.lz, wall);
    const s = p2s(g.x, g.y);
    return s;
  });

  planCtx.fillStyle = fillColor;
  planCtx.strokeStyle = strokeColor;
  planCtx.lineWidth = lineWidth;

  planCtx.beginPath();
  planCtx.moveTo(screenCorners[0][0], screenCorners[0][1]);
  for (let i = 1; i < 4; i++) {
    planCtx.lineTo(safeGet(screenCorners, i)[0], safeGet(screenCorners, i)[1]);
  }
  planCtx.closePath();
  planCtx.fill();
  planCtx.stroke();

  // Indicate web orientation for C-studs and tracks
  if (m && (m.profile === 'C_STUD' || m.profile === 'TRACK' || m.type.includes('stud') || m.type.includes('track') || m.type.includes('header'))) {
    const rot = (Math.abs(m.rotation || 0)) % 360;
    let p1, p2;

    if (m.is_vertical) {
      if (rot === 0) {
        p1 = localCorners[0];
        p2 = localCorners[3];
      } else if (rot === 180) {
        p1 = localCorners[1];
        p2 = localCorners[2];
      } else if (rot === 90) {
        p1 = localCorners[0];
        p2 = localCorners[1];
      } else if (rot === 270) {
        p1 = localCorners[3];
        p2 = localCorners[2];
      }
    } else {
      if (rot === 270) {
        p1 = localCorners[3];
        p2 = localCorners[2];
      } else {
        p1 = localCorners[0];
        p2 = localCorners[1];
      }
    }

    if (p1 && p2) {
      const g1 = localToGlobal(p1.lx, 0, p1.lz, wall);
      const g2 = localToGlobal(p2.lx, 0, p2.lz, wall);
      const s1 = p2s(g1.x, g1.y);
      const s2 = p2s(g2.x, g2.y);

      planCtx.strokeStyle = strokeColor;
      planCtx.lineWidth = Math.max(2, 3 * state.planZoom);
      planCtx.beginPath();
      planCtx.moveTo(s1[0], s1[1]);
      planCtx.lineTo(s2[0], s2[1]);
      planCtx.stroke();
    }
  }
}

function drawDetailedProfile(lx, lz, D, F, wall, fillColor, strokeColor, strokeWidth, m) {
  const G = m.gauge_mm || 1.5;
  
  const hasRevit = !!(m.revit_family_name || m.revit_symbol_name);
  const fam = m.revit_family_name || '';
  const sym = m.revit_symbol_name || '';
  const match = hasRevit ? (state.customRevitProfiles || []).find(p => p.familyName === fam && p.designation === sym) : null;

  let localVertices = [];
  if (hasRevit && match && match.vertices && match.vertices.length > 0) {
    // Rotate to map Revit local profile coordinates to our visualizer base coordinate system,
    // and center on (0, 0). Vertical members are rotated 90° counter-clockwise,
    // while horizontal members (tracks) are rotated 90° clockwise.
    const isVert = m.is_vertical || m.type === "stud" || m.type === "end_stud" || m.type === "king_stud" || m.type === "trimmer_stud" || m.type === "cripple_stud";
    const rawVertices = match.vertices.map(r => {
      return isVert ? { u: -r.v, v: r.u } : { u: r.v, v: -r.u };
    });
    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;
    for (const pt of rawVertices) {
      if (pt.u < minU) minU = pt.u;
      if (pt.u > maxU) maxU = pt.u;
      if (pt.v < minV) minV = pt.v;
      if (pt.v > maxV) maxV = pt.v;
    }

    const D_total = maxU - minU;
    const centerU = 0;
    const centerV = 0;

    localVertices = rawVertices.map(pt => ({
      u: pt.u - centerU,
      v: pt.v - centerV
    }));
  } else {
    const isCProfile = m.profile === 'C_STUD' || m.type.includes('stud');
    const shapeType = hasRevit ? getMemberShapeProfile(m) : (isCProfile ? 'c_stud' : 'track');
    const L = isCProfile ? (m.lip_mm || 12.7) : 0;
    
    if (shapeType === 'ch_stud') {
      const L_val = L || 12.7;
      localVertices = [
        { u: D / 2 - L_val, v: -F / 2 },
        { u: D / 2, v: -F / 2 },
        { u: D / 2, v: F / 2 },
        { u: D / 2 - L_val, v: F / 2 },
        { u: D / 2 - L_val, v: F / 2 - G },
        { u: D / 2 - G, v: F / 2 - G },
        { u: D / 2 - G, v: G },
        { u: -D / 2 + 25.4 + G, v: G },
        { u: -D / 2 + 25.4 + G, v: F / 2 },
        { u: -D / 2 + 25.4, v: F / 2 },
        { u: -D / 2 + 25.4, v: G },
        { u: -D / 2 + G, v: G },
        { u: -D / 2 + G, v: F / 2 },
        { u: -D / 2, v: F / 2 },
        { u: -D / 2, v: -F / 2 },
        { u: -D / 2 + G, v: -F / 2 },
        { u: -D / 2 + G, v: -G },
        { u: -D / 2 + 25.4, v: -G },
        { u: -D / 2 + 25.4, v: -F / 2 },
        { u: -D / 2 + 25.4 + G, v: -F / 2 },
        { u: -D / 2 + 25.4 + G, v: -G },
        { u: D / 2 - G, v: -G },
        { u: D / 2 - G, v: -F / 2 + G },
        { u: D / 2 - L_val, v: -F / 2 + G }
      ];
    } else if (shapeType === 'j_runner') {
      const F_long = F;
      const F2 = match ? match.flange_short_mm : m.flange_short_mm;
      const F_short = F2 || Math.max(25.4, F * 0.45);
      localVertices = [
        { u: D / 2, v: -F_long / 2 + F_short },
        { u: D / 2, v: -F_long / 2 },
        { u: -D / 2, v: -F_long / 2 },
        { u: -D / 2, v: F_long / 2 },
        { u: -D / 2 + G, v: F_long / 2 },
        { u: -D / 2 + G, v: -F_long / 2 + G },
        { u: D / 2 - G, v: -F_long / 2 + G },
        { u: D / 2 - G, v: -F_long / 2 + F_short }
      ];
    } else if (shapeType === 'hat_channel') {
      const brim = L || 12.7;
      localVertices = [
        { u: -F / 2 - brim, v: -D / 2 },
        { u: -F / 2, v: -D / 2 },
        { u: -F / 2, v: D / 2 },
        { u: F / 2, v: D / 2 },
        { u: F / 2, v: -D / 2 },
        { u: F / 2 + brim, v: -D / 2 },
        { u: F / 2 + brim, v: -D / 2 + G },
        { u: F / 2 + G, v: -D / 2 + G },
        { u: F / 2 + G, v: D / 2 - G },
        { u: -F / 2 - G, v: D / 2 - G },
        { u: -F / 2 - G, v: -D / 2 + G },
        { u: -F / 2 - brim, v: -D / 2 + G }
      ];
    } else if (shapeType === 'z_girt') {
      const fTop = F;
      const F2 = match ? match.flange_short_mm : m.flange_short_mm;
      const fBottom = F2 || F;
      localVertices = [
        { u: fTop, v: D / 2 },
        { u: -G / 2, v: D / 2 },
        { u: -G / 2, v: -D / 2 + G },
        { u: -fBottom, v: -D / 2 + G },
        { u: -fBottom, v: -D / 2 },
        { u: G / 2, v: -D / 2 },
        { u: G / 2, v: D / 2 - G },
        { u: fTop, v: D / 2 - G }
      ];
    } else if (shapeType === 'angle') {
      localVertices = [
        { u: -F / 2, v: D / 2 },
        { u: -F / 2, v: -D / 2 },
        { u: F / 2, v: -D / 2 },
        { u: F / 2, v: -D / 2 + G },
        { u: -F / 2 + G, v: -D / 2 + G },
        { u: -F / 2 + G, v: D / 2 }
      ];
    } else if (shapeType === 'track') {
      localVertices = [
        { u: D / 2, v: F / 2 },
        { u: D / 2, v: -F / 2 },
        { u: -D / 2, v: -F / 2 },
        { u: -D / 2, v: F / 2 },
        { u: -D / 2 + G, v: F / 2 },
        { u: -D / 2 + G, v: -F / 2 + G },
        { u: D / 2 - G, v: -F / 2 + G },
        { u: D / 2 - G, v: F / 2 }
      ];
    } else {
      // c_stud
      localVertices = [
        { u: D / 2 - L, v: -F / 2 },
        { u: D / 2, v: -F / 2 },
        { u: D / 2, v: F / 2 },
        { u: -D / 2, v: F / 2 },
        { u: -D / 2, v: -F / 2 },
        { u: -D / 2 + L, v: -F / 2 },
        { u: -D / 2 + L, v: -F / 2 + G },
        { u: -D / 2 + G, v: -F / 2 + G },
        { u: -D / 2 + G, v: F / 2 - G },
        { u: D / 2 - G, v: F / 2 - G },
        { u: D / 2 - G, v: -F / 2 + G },
        { u: D / 2 - L, v: -F / 2 + G }
      ];
    }
  }

  const theta = ((m.rotation || 0) * Math.PI) / 180;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  const screenCorners = localVertices.map(v => {
    const u_rot = v.u * cosT - v.v * sinT;
    const v_rot = v.u * sinT + v.v * cosT;
    const lx_v = lx + u_rot;
    const lz_v = lz + v_rot;
    const g = localToGlobal(lx_v, 0, lz_v, wall);
    return p2s(g.x, g.y);
  });

  planCtx.fillStyle = fillColor;
  planCtx.strokeStyle = strokeColor;
  planCtx.lineWidth = strokeWidth;

  planCtx.beginPath();
  planCtx.moveTo(screenCorners[0][0], screenCorners[0][1]);
  for (let i = 1; i < screenCorners.length; i++) {
    planCtx.lineTo(safeGet(screenCorners, i)[0], safeGet(screenCorners, i)[1]);
  }
  planCtx.closePath();
  planCtx.fill();
  planCtx.stroke();
}

function resizePlanCanvas() {
  if (!planCanvas || !planCtx) return;
  const r = planCanvas.parentElement.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  planCanvas.width = r.width * d;
  planCanvas.height = r.height * d;
  planCanvas.style.width = r.width + 'px';
  planCanvas.style.height = r.height + 'px';
  planCtx.setTransform(d, 0, 0, d, 0, 0);
}

function fitPlanView() {
  if (!planCanvas || !state.wallsData || state.wallsData.length === 0) return;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  const sourceWalls = state.framingResult || state.wallsData;
  sourceWalls.forEach((w, idx) => {
    const input = safeGet(state.wallsData, idx) || w;
    const originX = input.origin_x || 0;
    const originY = input.origin_y || 0;
    const dx = input.direction_x !== undefined ? input.direction_x : 1;
    const dy = input.direction_y !== undefined ? input.direction_y : 0;
    const len = w.length_mm || w.length || 0;
    const thick = w.thickness_mm || w.thickness || 92.08;

    const localCorners = [
      { lx: 0, lz: -thick / 2 },
      { lx: len, lz: -thick / 2 },
      { lx: len, lz: thick / 2 },
      { lx: 0, lz: thick / 2 }
    ];

    localCorners.forEach(c => {
      const gx = originX + c.lx * dx - c.lz * dy;
      const gy = originY + c.lx * dy + c.lz * dx;
      if (gx < minX) minX = gx;
      if (gx > maxX) maxX = gx;
      if (gy < minY) minY = gy;
      if (gy > maxY) maxY = gy;
    });
  });

  if (minX === Infinity) {
    minX = -1000; maxX = 1000;
    minY = -1000; maxY = 1000;
  }

  const wWidth = maxX - minX;
  const wHeight = maxY - minY;

  const cw = planCanvas.clientWidth;
  const ch = planCanvas.clientHeight;
  const padding = 80;

  const scaleX = wWidth > 0 ? (cw - padding * 2) / wWidth : 1;
  const scaleY = wHeight > 0 ? (ch - padding * 2) / wHeight : 1;

  state.planZoom = Math.min(scaleX, scaleY);
  if (state.planZoom <= 0 || isNaN(state.planZoom)) state.planZoom = 0.05;

  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  state.planPanX = cw / 2 - midX * state.planZoom;
  state.planPanY = ch / 2 + midY * state.planZoom;

  updatePlanZoomLabel();
}

function updatePlanZoomLabel() {
  const el = getEl('statusPlanZoom');
  if (el) {
    el.textContent = Math.round(state.planZoom * 100) + '%';
  }
}

function renderPlan() {
  if (!planCanvas || !planCtx) return;

  planCtx.clearRect(0, 0, planCanvas.width, planCanvas.height);

  const cs = getComputedStyle(document.documentElement);
  const canvasBg = cs.getPropertyValue('--bg-canvas') || '#121214';
  const gridColor = cs.getPropertyValue('--border-color') || 'rgba(255,255,255,0.06)';
  const textColor = cs.getPropertyValue('--canvas-text') || '#a0aec0';

  planCtx.fillStyle = canvasBg;
  planCtx.fillRect(0, 0, planCanvas.width, planCanvas.height);

  let spacing = 1000;
  const minPixels = 40;
  if (state.displayUnit === 'imperial') {
    const spacings = [25.4, 76.2, 152.4, 304.8, 609.6, 1524, 3048, 6096, 15240, 30480];
    spacing = safeGet(spacings, spacings.length - 1);
    for (let i = 0; i < spacings.length; i++) {
      if (safeGet(spacings, i) * state.planZoom >= minPixels) {
        spacing = safeGet(spacings, i);
        break;
      }
    }
  } else {
    const spacings = [10, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    spacing = safeGet(spacings, spacings.length - 1);
    for (let i = 0; i < spacings.length; i++) {
      if (safeGet(spacings, i) * state.planZoom >= minPixels) {
        spacing = safeGet(spacings, i);
        break;
      }
    }
  }

  const W = planCanvas.width;
  const H = planCanvas.height;
  const p00 = s2p(0, 0);
  const pWH = s2p(W, H);
  const minX = Math.min(p00[0], pWH[0]);
  const maxX = Math.max(p00[0], pWH[0]);
  const minY = Math.min(p00[1], pWH[1]);
  const maxY = Math.max(p00[1], pWH[1]);

  planCtx.strokeStyle = gridColor;
  planCtx.lineWidth = 0.5;
  planCtx.font = '10px JetBrains Mono';
  planCtx.fillStyle = textColor;

  const startX = Math.floor(minX / spacing) * spacing;
  for (let gx = startX; gx <= maxX; gx += spacing) {
    const [sx] = p2s(gx, 0);
    planCtx.beginPath();
    planCtx.moveTo(sx, 0);
    planCtx.lineTo(sx, H);
    planCtx.stroke();
    planCtx.fillText(mmToDisplay(gx), sx + 4, 15);
  }

  const startY = Math.floor(minY / spacing) * spacing;
  for (let gy = startY; gy <= maxY; gy += spacing) {
    const [, sy] = p2s(0, gy);
    planCtx.beginPath();
    planCtx.moveTo(0, sy);
    planCtx.lineTo(W, sy);
    planCtx.stroke();
    planCtx.fillText(mmToDisplay(gy), 4, sy - 4);
  }

  // Draw grids in Plan View
  const showGrids = getActiveVisibilitySettings().showGrids;
  if (showGrids && state.gridsData && state.gridsData.length > 0) {
    planCtx.save();
    planCtx.strokeStyle = '#4299e1'; // Blueish grid line color
    planCtx.lineWidth = 1.5;
    planCtx.setLineDash([5, 5]);
    planCtx.fillStyle = '#4299e1';
    planCtx.font = 'bold 10px Inter, sans-serif';
    planCtx.textAlign = 'center';
    planCtx.textBaseline = 'middle';

    state.gridsData.forEach(grid => {
      const [sx0, sy0] = p2s(grid.start_x, grid.start_y);
      const [sx1, sy1] = p2s(grid.end_x, grid.end_y);

      // Draw grid line
      planCtx.beginPath();
      planCtx.moveTo(sx0, sy0);
      planCtx.lineTo(sx1, sy1);
      planCtx.stroke();

      // Draw bubbles at both ends
      const drawBubble = (x, y) => {
        planCtx.save();
        planCtx.setLineDash([]);
        planCtx.fillStyle = canvasBg; // Fill with canvas background color
        planCtx.strokeStyle = '#4299e1';
        planCtx.beginPath();
        planCtx.arc(x, y, 10, 0, Math.PI * 2);
        planCtx.fill();
        planCtx.stroke();

        planCtx.fillStyle = '#4299e1';
        planCtx.fillText(grid.label || '', x, y);
        planCtx.restore();
      };

      drawBubble(sx0, sy0);
      drawBubble(sx1, sy1);
    });
    planCtx.restore();
  }

  if (!state.framingResult || !state.wallsData) return;

  state.framingResult.forEach((wallResult, i) => {
    const wallInputOriginal = safeGet(state.wallsData, i);
    if (!wallResult || !wallInputOriginal) return;
    if (state.hiddenElements && state.hiddenElements.has(wallInputOriginal)) return;

    const wallInput = {
      ...wallInputOriginal,
      origin_x: wallResult.origin_x !== undefined ? wallResult.origin_x : wallInputOriginal.origin_x,
      origin_y: wallResult.origin_y !== undefined ? wallResult.origin_y : wallInputOriginal.origin_y,
      direction_x: wallResult.direction_x !== undefined ? wallResult.direction_x : wallInputOriginal.direction_x,
      direction_y: wallResult.direction_y !== undefined ? wallResult.direction_y : wallInputOriginal.direction_y,
      length: wallResult.length_mm !== undefined ? wallResult.length_mm : wallInputOriginal.length,
      thickness: wallResult.thickness_mm !== undefined ? wallResult.thickness_mm : wallInputOriginal.thickness
    };

    const isCurrentWall = (i === state.currentWallIdx);
    const len = wallResult.length_mm;
    const thick = wallResult.thickness_mm || wallInput.thickness || 92.08;

    const layers = (wallInput.layers && wallInput.layers.length > 0) ? wallInput.layers : null;

    const hasErrors = wallResult.validation_errors && wallResult.validation_errors.length > 0;
    if (hasErrors) {
      const globalOpacity = (state.wallStyle === 'translucent') ? state.wallOpacity : 1.0;
      const fillColor = `rgba(239, 68, 68, ${globalOpacity * 0.25})`;
      const strokeColor = '#f87171';
      const strokeW = isCurrentWall ? 2.5 : 1.5;
      drawLocalRect(len / 2, 0, len, thick, wallInput,
        fillColor, strokeColor, strokeW, false, null);
    } else if (state.wallStyle === 'hidden' || !getActiveVisibilitySettings().showWallVolume) {
      // Hidden: show only a very faint outline for the active wall
      if (isCurrentWall) {
        drawLocalRect(len / 2, 0, len, thick, wallInput,
          'rgba(66, 153, 225, 0.03)', 'rgba(66, 153, 225, 0.15)', 1, false, null);
      }
    } else {
      // Translucent or Solid — render wall layers (or fallback single block)
      const globalOpacity = (state.wallStyle === 'translucent') ? state.wallOpacity : 1.0;
      const strokeAlpha = (state.wallStyle === 'translucent') ? Math.min(1.0, state.wallOpacity * 1.5) : 1.0;
      const activeStroke = isCurrentWall ? 'rgba(66,153,225,' + strokeAlpha + ')' : 'rgba(148,163,184,' + strokeAlpha + ')';
      const activeStrokeW = isCurrentWall ? 1.5 : 1;

      if (layers) {
        // ── Layer-aware cross-section strips ──
        // In Plan view the wall runs along X and the depth axis is Z (local).
        // We draw each layer as a horizontal strip at the correct Z offset.
        const totalThick = layers.reduce((s, l) => s + l.thickness_mm, 0);
        let zCursor = -totalThick / 2;  // start at exterior face (matches 3D)

        layers.forEach(layer => {
          const hexStr = safeGet(LAYER_FUNCTION_COLORS, layer.function) || LAYER_FUNCTION_COLORS['Other'];

          // Parse hex → rgba
          const r = parseInt(hexStr.slice(1, 3), 16);
          const g = parseInt(hexStr.slice(3, 5), 16);
          const b = parseInt(hexStr.slice(5, 7), 16);
          let opacity = globalOpacity;
          if (state.theme === 'dark' && state.wallStyle === 'translucent') {
            opacity = Math.max(0.6, state.wallOpacity);
          }
          const fillColor = `rgba(${r},${g},${b},${opacity})`;
          const dividerColor = state.theme === 'light' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.65)';

          // Centre Z of this layer strip
          const layerZCenter = zCursor + layer.thickness_mm / 2;
          zCursor += layer.thickness_mm;

          drawLocalRect(
            len / 2, layerZCenter, len, layer.thickness_mm,
            wallInput,
            fillColor,
            dividerColor,
            0.75,
            false, null
          );
        });

        // Draw an overall border on top for clarity
        drawLocalRect(len / 2, 0, len, totalThick, wallInput,
          'rgba(0,0,0,0)', activeStroke, activeStrokeW, false, null);

      } else {
        // ── Fallback: single block (no layer data) ──
        let wallOutlineColor, wallStrokeColor;
        if (state.wallStyle === 'translucent') {
          if (isCurrentWall) {
            wallOutlineColor = `rgba(66, 153, 225, ${state.wallOpacity * 0.5})`;
            wallStrokeColor = activeStroke;
          } else {
            const baseColor = state.theme === 'light' ? '226, 232, 240' : '71, 85, 105';
            wallOutlineColor = `rgba(${baseColor}, ${state.wallOpacity})`;
            wallStrokeColor = `rgba(148, 163, 184, ${Math.min(1.0, state.wallOpacity * 1.2)})`;
          }
        } else { // solid
          if (isCurrentWall) {
            wallOutlineColor = 'rgba(49, 130, 206, 0.7)';
            wallStrokeColor = 'rgba(49, 130, 206, 1.0)';
          } else {
            wallOutlineColor = state.theme === 'light' ? 'rgba(203, 213, 225, 1.0)' : 'rgba(51, 65, 85, 1.0)';
            wallStrokeColor = state.theme === 'light' ? 'rgba(100, 116, 139, 1.0)' : 'rgba(148, 163, 184, 1.0)';
          }
        }
        drawLocalRect(len / 2, 0, len, thick, wallInput,
          wallOutlineColor, wallStrokeColor, activeStrokeW, false, null);
      }
    }

    // ── Openings highlight (drawn over layers/errors) ──
    if (wallResult.openings && (hasErrors || (state.wallStyle !== 'hidden' && getActiveVisibilitySettings().showWallVolume))) {
      wallResult.openings.forEach(op => {
        if (state.hiddenElements && state.hiddenElements.has(op)) return;
        const xo = op.x_offset || op.x_start || 0;
        const opW = op.width;
        const opThick = (layers
          ? layers.reduce((s, l) => s + l.thickness_mm, 0)
          : thick) + 4;

        const accent = (cs.getPropertyValue('--accent') || '#007fff').trim();
        const isSelected = state.selectedOpening && (state.selectedOpening.label === op.label) && (state.currentWallIdx === i);
        const isHovered = state.hoveredPlanOpening && (state.hoveredPlanOpening.label === op.label) && (state.hoveredPlanOpeningWallIdx === i);

        let opFill, opStroke, opStrokeW = 0.75;
        if (isSelected) {
          opFill = hexA(accent, 0.45);
          opStroke = accent;
          opStrokeW = 2.0;
        } else if (isHovered) {
          opFill = hexA(accent, 0.28);
          opStroke = accent;
          opStrokeW = 1.5;
        } else if (state.wallStyle === 'translucent' || hasErrors) {
          opFill = hexA(accent, state.wallOpacity * 0.35);
          opStroke = hexA(accent, Math.min(1, state.wallOpacity * 0.9));
        } else {
          opFill = hexA(accent, 0.2);
          opStroke = hexA(accent, 0.7);
        }
        drawLocalRect(xo + opW / 2, 0, opW, opThick, wallInput,
          opFill, opStroke, opStrokeW, false, null);
      });
    }


    MEMBER_DRAW_ORDER.forEach(t => {
      wallResult.members.forEach(m => {
        if (state.hiddenElements && state.hiddenElements.has(m)) return;
        if (m.type !== t) return;

        const isVisible = getActiveVisibilitySettings().showFramingGlobal && safeGet(getActiveVisibilitySettings(), m.type);
        if (!isVisible) return;

        const isSelected = (m === state.selectedMember) || (state.selectedMembers && state.selectedMembers.includes(m));
        const isHovered = (m === state.hoveredPlanMember);

        const c = safeGet(MEMBER_COLORS, m.type) || '#888';

        let fillColor, strokeColor, strokeWidth;

        if (isSelected) {
          fillColor = c;
          strokeColor = '#3182ce';
          strokeWidth = 2.5;
        } else if (isHovered) {
          fillColor = hexA(c, 0.65);
          strokeColor = c;
          strokeWidth = 2;
        } else {
          const opacityFill = isCurrentWall ? 0.70 : 0.08;
          const opacityStroke = isCurrentWall ? 1.0 : 0.4;

          fillColor = hexA(c, opacityFill);
          strokeColor = hexA(c, opacityStroke);
          strokeWidth = isCurrentWall ? 2 : 1;
        }

        const rotMod = Math.abs(m.rotation || 0) % 360;
        let lx, lz, w_local, d_local;

        if (m.is_vertical) {
          lx = m.start.x;
          lz = m.z_offset || 0;
          drawDetailedProfile(
            lx, lz, m.depth_mm, m.flange_mm,
            wallInput,
            fillColor,
            strokeColor,
            strokeWidth,
            m
          );
        } else {
          lx = (m.start.x + m.end.x) / 2;
          lz = m.z_offset || 0;
          w_local = Math.abs(m.end.x - m.start.x);
          d_local = (rotMod === 0 || rotMod === 180) ? m.flange_mm : m.depth_mm;

          drawLocalRect(
            lx, lz, w_local, d_local,
            wallInput,
            fillColor,
            strokeColor,
            strokeWidth,
            isSelected, m
          );
        }
      });
    });

    // Draw wall selection highlight overlay if selected
    const isWallSelected = state.selectedWallIndices && state.selectedWallIndices.includes(i);
    if (isWallSelected) {
      const wallHeight = (wallInput.layers && wallInput.layers.length > 0)
        ? wallInput.layers.reduce((s, l) => s + l.thickness_mm, 0)
        : thick;
      drawLocalRect(
        len / 2, 0, len, wallHeight,
        wallInput,
        'rgba(66, 153, 225, 0.35)', // Blue transparent wash
        'rgba(49, 130, 206, 0.95)',  // Solid blue border
        2.5,                        // Bold stroke width
        false, null
      );
    }

    // Render Panel Name tag if showPanelNames is true
    if (getActiveVisibilitySettings().showPanelNames) {
      const isWallSelectedOrActive = (i === state.currentWallIdx) || (state.selectedWallIndices && state.selectedWallIndices.includes(i));
      // Detail LOD: Hide non-selected wall labels when zoomed out far
      if (state.planZoom < 0.02 && !isWallSelectedOrActive) {
        return;
      }

      const labelText = `Panel ${wallInput.label || wallInput.wall_id}`;
      const lx_c = len / 2;
      const lz_c = -(thick / 2 + 120); // offset slightly in front

      const g = localToGlobal(lx_c, 0, lz_c, wallInput);
      const [scx, scy] = p2s(g.x, g.y);

      let angle = Math.atan2(-wallInput.direction_y, wallInput.direction_x);
      if (Math.cos(angle) < 0) {
        angle += Math.PI;
      }

      planCtx.save();
      planCtx.translate(scx, scy);
      planCtx.rotate(angle);

      planCtx.font = 'bold 11px Inter';
      const textW = planCtx.measureText(labelText).width;
      const padX = 10, padY = 5;
      const badgeW = textW + padX * 2;
      const badgeH = 11 + padY * 2;

      const isWallHovered = (state.hoveredPlanWallIdx === i) && (state.hoveredPlanMember === null);
      const style = getPanelBadgeStyle(isWallSelectedOrActive, isWallHovered);

      planCtx.fillStyle = style.bg;
      planCtx.strokeStyle = style.border;
      planCtx.lineWidth = 2;

      drawRoundedRect(planCtx, -badgeW / 2, -badgeH / 2, badgeW, badgeH, 6);
      planCtx.fill();
      planCtx.stroke();

      planCtx.fillStyle = style.text;
      planCtx.textAlign = 'center';
      planCtx.textBaseline = 'middle';
      planCtx.fillText(labelText, 0, 0);
      planCtx.restore();
    }
  });

  // ── Render 2D Join Markers ──
  if (state.framingResult && state.wallsData && getActiveVisibilitySettings().showJoinMarkers) {
    const uniquePlanJoins = new Map();
    state.framingResult.forEach((wallResult, i) => {
      const wallInputOriginal = safeGet(state.wallsData, i);
      if (!wallResult || !wallInputOriginal) return;

      const wallInput = {
        ...wallInputOriginal,
        origin_x: wallResult.origin_x !== undefined ? wallResult.origin_x : wallInputOriginal.origin_x,
        origin_y: wallResult.origin_y !== undefined ? wallResult.origin_y : wallInputOriginal.origin_y,
        direction_x: wallResult.direction_x !== undefined ? wallResult.direction_x : wallInputOriginal.direction_x,
        direction_y: wallResult.direction_y !== undefined ? wallResult.direction_y : wallInputOriginal.direction_y,
        length: wallResult.length_mm !== undefined ? wallResult.length_mm : wallInputOriginal.length,
        thickness: wallResult.thickness_mm !== undefined ? wallResult.thickness_mm : wallInputOriginal.thickness
      };

      if (wallResult.joins) {
        wallResult.joins.forEach(j => {
          if (j.is_stopped_wall) {
            const key = [j.stopped_wall_id, j.continuing_wall_id].sort().join(':');
            if (!uniquePlanJoins.has(key)) {
              const g = localToGlobal(j.stopped_wall_end_x, 0, 0, wallInput);
              uniquePlanJoins.set(key, {
                join: j,
                globalPos: g
              });
            }
          }
        });
      }
    });

    uniquePlanJoins.forEach((data, key) => {
      const j = data.join;
      const [sx, sy] = p2s(data.globalPos.x, data.globalPos.y);

      const isHovered = state.hoveredPlanJoin &&
        ([state.hoveredPlanJoin.stopped_wall_id, state.hoveredPlanJoin.continuing_wall_id].sort().join(':') === key);
      const isSelected = (state.selectedJoin &&
        ([state.selectedJoin.stopped_wall_id, state.selectedJoin.continuing_wall_id].sort().join(':') === key)) ||
        (state.selectedJoins && state.selectedJoins.some(sj => [sj.stopped_wall_id, sj.continuing_wall_id].sort().join(':') === key));

      planCtx.save();
      planCtx.beginPath();
      planCtx.arc(sx, sy, 10, 0, Math.PI * 2);

      if (isSelected) {
        planCtx.fillStyle = '#ff7f50'; // coral
        planCtx.strokeStyle = '#ffffff';
        planCtx.lineWidth = 2.5;
      } else if (isHovered) {
        planCtx.fillStyle = '#ffa07a'; // light salmon
        planCtx.strokeStyle = '#ff7f50';
        planCtx.lineWidth = 2.0;
      } else {
        planCtx.fillStyle = 'rgba(255, 127, 80, 0.4)'; // transparent coral
        planCtx.strokeStyle = '#ff7f50';
        planCtx.lineWidth = 1.5;
      }
      planCtx.fill();
      planCtx.stroke();

      planCtx.fillStyle = '#ffffff';
      planCtx.font = 'bold 9px sans-serif';
      planCtx.textAlign = 'center';
      planCtx.textBaseline = 'middle';
      planCtx.fillText(j.join_type, sx, sy);
      planCtx.restore();
    });
  }
}

function onPlanWheel(e) {
  e.preventDefault();
  const rect = planCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const [gx, gy] = s2p(mx, my);

  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  state.planZoom *= factor;

  if (state.planZoom < 0.0001) state.planZoom = 0.0001;
  if (state.planZoom > 10) state.planZoom = 10;

  state.planPanX = mx - gx * state.planZoom;
  state.planPanY = my + gy * state.planZoom;

  renderPlan();
  updatePlanZoomLabel();
}

function onPlanMouseDown(e) {
  const rect = planCanvas.getBoundingClientRect();

  state.planDragStartX = e.clientX;
  state.planDragStartY = e.clientY;
  state.planDragDistance = 0;

  if (e.button === 0) { // Left Click
    state.isDrawingPlanBox = true;
    state.planSelectionStart = { x: e.clientX, y: e.clientY };
    state.planSelectionCurrent = { x: e.clientX, y: e.clientY };
  } else if (e.button === 1 || e.button === 2) { // Middle or Right Click
    state.isPlanDragging = true;
    updatePlanCursor(e);
  }
}

function onPlanMouseMove(e) {
  const rect = planCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  const [gx, gy] = s2p(mx, my);
  const coordEl = getEl('statusPlanCoord');
  if (coordEl) {
    coordEl.textContent = `X:${mmToDisplay(gx)} Y:${mmToDisplay(gy)}`;
  }

  if (state.isPlanDragging) {
    const dx = e.clientX - state.planDragStartX;
    const dy = e.clientY - state.planDragStartY;
    state.planDragDistance += Math.sqrt(dx * dx + dy * dy);
    state.planPanX += dx;
    state.planPanY += dy;
    state.planDragStartX = e.clientX;
    state.planDragStartY = e.clientY;
    renderPlan();
    return;
  }

  if (state.isDrawingPlanBox) {
    const dx = e.clientX - state.planDragStartX;
    const dy = e.clientY - state.planDragStartY;
    state.planDragDistance += Math.sqrt(dx * dx + dy * dy);
    state.planDragStartX = e.clientX;
    state.planDragStartY = e.clientY;

    state.planSelectionCurrent = { x: e.clientX, y: e.clientY };

    const container = getEl('canvas-container');
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const x1 = state.planSelectionStart.x - containerRect.left;
      const y1 = state.planSelectionStart.y - containerRect.top;
      const x2 = state.planSelectionCurrent.x - containerRect.left;
      const y2 = state.planSelectionCurrent.y - containerRect.top;

      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);

      const overlay = getEl('selectionBoxOverlay');
      if (overlay) {
        overlay.style.left = left + 'px';
        overlay.style.top = top + 'px';
        overlay.style.width = width + 'px';
        overlay.style.height = height + 'px';
        overlay.style.display = 'block';
        if (x2 >= x1) {
          overlay.className = 'selection-box-overlay window';
        } else {
          overlay.className = 'selection-box-overlay crossing';
        }
      }
    }
    return;
  }

  if (!state.wallsData || !state.framingResult) return;

  let hitJoin = null;
  // Unique joins hit test
  const uniqueJoinsForHit = [];
  if (getActiveVisibilitySettings().showJoinMarkers) {
    state.framingResult.forEach((wallResult, i) => {
      const wallInputOriginal = safeGet(state.wallsData, i);
      if (!wallResult || !wallInputOriginal) return;
      const wallInput = {
        ...wallInputOriginal,
        origin_x: wallResult.origin_x !== undefined ? wallResult.origin_x : wallInputOriginal.origin_x,
        origin_y: wallResult.origin_y !== undefined ? wallResult.origin_y : wallInputOriginal.origin_y,
        direction_x: wallResult.direction_x !== undefined ? wallResult.direction_x : wallInputOriginal.direction_x,
        direction_y: wallResult.direction_y !== undefined ? wallResult.direction_y : wallInputOriginal.direction_y,
        length: wallResult.length_mm !== undefined ? wallResult.length_mm : wallInputOriginal.length,
        thickness: wallResult.thickness_mm !== undefined ? wallResult.thickness_mm : wallInputOriginal.thickness
      };
      if (wallResult.joins) {
        wallResult.joins.forEach(j => {
          if (j.is_stopped_wall) {
            const key = [j.stopped_wall_id, j.continuing_wall_id].sort().join(':');
            const g = localToGlobal(j.stopped_wall_end_x, 0, 0, wallInput);
            const [sx, sy] = p2s(g.x, g.y);
            uniqueJoinsForHit.push({ join: j, sx, sy, key });
          }
        });
      }
    });

    for (let u of uniqueJoinsForHit) {
      const dist = Math.hypot(mx - u.sx, my - u.sy);
      if (dist <= 12) {
        hitJoin = u.join;
        break;
      }
    }
  }

  let hitMember = null;
  let hitWallIdx = null;
  let hitOpening = null;

  for (let i = state.framingResult.length - 1; i >= 0; i--) {
    const wResult = safeGet(state.framingResult, i);
    const wInputOriginal = safeGet(state.wallsData, i);
    if (!wResult || !wInputOriginal) continue;
    if (state.hiddenElements && state.hiddenElements.has(wInputOriginal)) continue;

    const wInput = {
      ...wInputOriginal,
      origin_x: wResult.origin_x !== undefined ? wResult.origin_x : wInputOriginal.origin_x,
      origin_y: wResult.origin_y !== undefined ? wResult.origin_y : wInputOriginal.origin_y,
      direction_x: wResult.direction_x !== undefined ? wResult.direction_x : wInputOriginal.direction_x,
      direction_y: wResult.direction_y !== undefined ? wResult.direction_y : wInputOriginal.direction_y,
      length: wResult.length_mm !== undefined ? wResult.length_mm : wInputOriginal.length,
      thickness: wResult.thickness_mm !== undefined ? wResult.thickness_mm : wInputOriginal.thickness
    };

    const { lx, lz } = globalToLocal(gx, gy, wInput);
    const len = wResult.length_mm;
    // Use the same thickness the wall is DRAWN with:
    // when layers are present, the total thickness is the sum of all layer thicknesses.
    const structuralThick = wResult.thickness_mm || wInput.thickness || 92.08;
    const layers = wInput.layers && wInput.layers.length > 0 ? wInput.layers : null;
    const totalThick = layers
      ? layers.reduce((s, l) => s + l.thickness_mm, 0)
      : structuralThick;

    // Screen-space tolerances converted to model-space (mm), clamped to sensible bounds.
    // outerTol: generous enough to enter the wall loop but not so large it grabs distant walls.
    const outerTol = Math.min(60, Math.max(10, 3 / state.planZoom));
    // tolMember: tight for individual member hit detection — stays within the member's cross-section.
    const tolMember = Math.min(20, Math.max(5, 1 / state.planZoom));

    // Check if cursor is within the panel name badge bounding box
    if (getActiveVisibilitySettings().showPanelNames) {
      const isWallSelectedOrActive = (i === state.currentWallIdx) || (state.selectedWallIndices && state.selectedWallIndices.includes(i));
      // Detail LOD: Hide non-selected wall labels when zoomed out far
      if (state.planZoom >= 0.02 || isWallSelectedOrActive) {
        const lx_c = len / 2;
        const lz_c = -(totalThick / 2 + 120);
        const labelText = `Panel ${wResult.label || wResult.wall_id}`;

        planCtx.save();
        planCtx.font = 'bold 11px Inter';
        const textW = planCtx.measureText(labelText).width;
        planCtx.restore();

        const badgeW_pixels = textW + 20;
        const badgeH_pixels = 21;
        const badgeW_mm = badgeW_pixels / state.planZoom;
        const badgeH_mm = badgeH_pixels / state.planZoom;

        const insideBadge = Math.abs(lx - lx_c) <= badgeW_mm / 2 && Math.abs(lz - lz_c) <= badgeH_mm / 2;
        if (insideBadge) {
          hitWallIdx = i;
          hitMember = null;
          break;
        }
      }
    }

    // Check if cursor is within the wall's bounding box (using total drawn thickness)
    const insideWallBBox = lx >= -outerTol && lx <= len + outerTol && Math.abs(lz) <= totalThick / 2 + outerTol;
    if (!insideWallBBox) continue;


    // Loop 1: Prioritize vertical members (studs) — only if framing is visible
    if (getActiveVisibilitySettings().showFramingGlobal) {
      for (let j = wResult.members.length - 1; j >= 0; j--) {
        const m = safeGet(wResult.members, j);
        if (state.hiddenElements && state.hiddenElements.has(m)) continue;
        if (!m.is_vertical) continue;

        // Visibility check
        if (!safeGet(getActiveVisibilitySettings(), m.type)) continue;

        const rotMod = Math.abs(m.rotation || 0) % 360;
        const lx_m = m.start.x;
        const lz_m = m.z_offset || 0;
        let wX, wZ;
        if (rotMod === 0 || rotMod === 180) {
          wX = m.depth_mm;
          wZ = m.flange_mm;
        } else {
          wX = m.flange_mm;
          wZ = m.depth_mm;
        }

        if (Math.abs(lx - lx_m) <= wX / 2 + tolMember && Math.abs(lz - lz_m) <= wZ / 2 + tolMember) {
          hitMember = m;
          hitWallIdx = i;
          break;
        }
      }

      // Loop 2: Check horizontal members (tracks, noggings, headers, sills) if no vertical member was hit
      if (!hitMember) {
        for (let j = wResult.members.length - 1; j >= 0; j--) {
          const m = safeGet(wResult.members, j);
          if (state.hiddenElements && state.hiddenElements.has(m)) continue;
          if (m.is_vertical) continue;

          // Visibility check
          if (!safeGet(getActiveVisibilitySettings(), m.type)) continue;

          const rotMod = Math.abs(m.rotation || 0) % 360;
          const lx_m_start = Math.min(m.start.x, m.end.x);
          const lx_m_end = Math.max(m.start.x, m.end.x);
          const lz_m = m.z_offset || 0;
          const wZ = (rotMod === 0 || rotMod === 180) ? m.flange_mm : m.depth_mm;

          if (lx >= lx_m_start - tolMember && lx <= lx_m_end + tolMember && Math.abs(lz - lz_m) <= wZ / 2 + tolMember) {
            hitMember = m;
            hitWallIdx = i;
            break;
          }
        }
      }
    }

    // If we hit a member, stop searching other walls
    if (hitMember) break;

    // Check if hit an opening on this wall
    if (wResult.openings) {
      for (let j = 0; j < wResult.openings.length; j++) {
        const op = safeGet(wResult.openings, j);
        if (state.hiddenElements && state.hiddenElements.has(op)) continue;
        const xo = op.x_offset || op.x_start || 0;
        if (lx >= xo && lx <= xo + op.width && Math.abs(lz) <= totalThick / 2) {
          hitOpening = op;
          hitWallIdx = i;
          break;
        }
      }
    }
    if (hitOpening) break;

    // Wall-body hit — only if the wall volume is actually visible and cursor is strictly inside the wall body
    const insideWallBody = lx >= 0 && lx <= len && Math.abs(lz) <= totalThick / 2;
    if (insideWallBody && getActiveVisibilitySettings().showWallVolume && hitWallIdx === null) {
      hitWallIdx = i;
      break;
    }
  }

  let planOpeningChanged = false;
  if (hitOpening !== state.hoveredPlanOpening || (hitOpening && state.hoveredPlanOpeningWallIdx !== hitWallIdx)) {
    state.hoveredPlanOpening = hitOpening;
    state.hoveredPlanOpeningWallIdx = hitOpening ? hitWallIdx : null;
    planOpeningChanged = true;
  }

  let planJoinChanged = false;
  if (hitJoin !== state.hoveredPlanJoin) {
    state.hoveredPlanJoin = hitJoin;
    planJoinChanged = true;
  }

  if (hitMember !== state.hoveredPlanMember || hitWallIdx !== state.hoveredPlanWallIdx || planOpeningChanged || planJoinChanged) {
    state.hoveredPlanMember = hitMember;
    state.hoveredPlanWallIdx = hitWallIdx;
    renderPlan();
    if (hitJoin) {
      updatePlanJoinTooltip(hitJoin, e.clientX, e.clientY);
    } else {
      updatePlanTooltip(hitMember, hitWallIdx, e.clientX, e.clientY);
    }
  } else if (hitJoin) {
    updatePlanJoinTooltip(hitJoin, e.clientX, e.clientY);
  } else if (hitMember) {
    updatePlanTooltip(hitMember, hitWallIdx, e.clientX, e.clientY);
  } else {
    updatePlanTooltip(null, null);
  }

  updatePlanCursor(e);
}

async function onPlanMouseUp(e) {
  if (state.isPlanDragging) {
    state.isPlanDragging = false;
    updatePlanCursor(e);
  }

  if (state.isDrawingPlanBox) {
    state.isDrawingPlanBox = false;
    const overlay = getEl('selectionBoxOverlay');
    if (overlay) overlay.style.display = 'none';

    if (state.planDragDistance > 5) {
      const canvasRect = planCanvas.getBoundingClientRect();
      const cx1 = state.planSelectionStart.x - canvasRect.left;
      const cy1 = state.planSelectionStart.y - canvasRect.top;
      const cx2 = e.clientX - canvasRect.left;
      const cy2 = e.clientY - canvasRect.top;

      const selMinX = Math.min(cx1, cx2);
      const selMaxX = Math.max(cx1, cx2);
      const selMinY = Math.min(cy1, cy2);
      const selMaxY = Math.max(cy1, cy2);

      const isCrossing = cx2 < cx1;
      const isMulti = e.ctrlKey || e.shiftKey;

      await performPlanBoxSelection(selMinX, selMaxX, selMinY, selMaxY, isCrossing, isMulti);
    }
  }
}

async function performPlanBoxSelection(minX, maxX, minY, maxY, isCrossing, isMulti) {
  if (!state.wallsData || !state.framingResult) return;

  const selectedMembers = isMulti ? [...(state.selectedMembers || [])] : [];
  const selectedWallIndices = isMulti ? [...(state.selectedWallIndices || [])] : [];
  const selectedJoins = isMulti ? [...(state.selectedJoins || [])] : [];

  let foundMembers = [];
  let foundWallIndices = [];
  let foundJoins = [];

  const isPointInBox = (sx, sy) => sx >= minX && sx <= maxX && sy >= minY && sy <= maxY;

  // Find joins in box
  const uniquePlanJoins = new Map();
  if (getActiveVisibilitySettings().showJoinMarkers) {
    state.framingResult.forEach((wallResult, i) => {
      const wallInputOriginal = safeGet(state.wallsData, i);
      if (!wallResult || !wallInputOriginal) return;

      const wallInput = {
        ...wallInputOriginal,
        origin_x: wallResult.origin_x !== undefined ? wallResult.origin_x : wallInputOriginal.origin_x,
        origin_y: wallResult.origin_y !== undefined ? wallResult.origin_y : wallInputOriginal.origin_y,
        direction_x: wallResult.direction_x !== undefined ? wallResult.direction_x : wallInputOriginal.direction_x,
        direction_y: wallResult.direction_y !== undefined ? wallResult.direction_y : wallInputOriginal.direction_y,
        length: wallResult.length_mm !== undefined ? wallResult.length_mm : wallInputOriginal.length,
        thickness: wallResult.thickness_mm !== undefined ? wallResult.thickness_mm : wallInputOriginal.thickness
      };

      if (wallResult.joins) {
        wallResult.joins.forEach(j => {
          if (j.is_stopped_wall) {
            const key = [j.stopped_wall_id, j.continuing_wall_id].sort().join(':');
            if (!uniquePlanJoins.has(key)) {
              const g = localToGlobal(j.stopped_wall_end_x, 0, 0, wallInput);
              uniquePlanJoins.set(key, {
                join: j,
                globalPos: g
              });
            }
          }
        });
      }
    });
  }

  uniquePlanJoins.forEach((data, key) => {
    const [sx, sy] = p2s(data.globalPos.x, data.globalPos.y);
    if (isPointInBox(sx, sy)) {
      foundJoins.push(data.join);
    }
  });

  for (let i = 0; i < state.framingResult.length; i++) {
    const wResult = safeGet(state.framingResult, i);
    const wInputOriginal = safeGet(state.wallsData, i);
    if (!wResult || !wInputOriginal) continue;

    const wInput = {
      ...wInputOriginal,
      origin_x: wResult.origin_x !== undefined ? wResult.origin_x : wInputOriginal.origin_x,
      origin_y: wResult.origin_y !== undefined ? wResult.origin_y : wInputOriginal.origin_y,
      direction_x: wResult.direction_x !== undefined ? wResult.direction_x : wInputOriginal.direction_x,
      direction_y: wResult.direction_y !== undefined ? wResult.direction_y : wInputOriginal.direction_y,
      length: wResult.length_mm !== undefined ? wResult.length_mm : wInputOriginal.length,
      thickness: wResult.thickness_mm !== undefined ? wResult.thickness_mm : wInputOriginal.thickness
    };

    const len = wResult.length_mm;
    const structuralThick = wResult.thickness_mm || wInput.thickness || 92.08;
    const layers = wInput.layers && wInput.layers.length > 0 ? wInput.layers : null;
    const totalThick = layers ? layers.reduce((s, l) => s + l.thickness_mm, 0) : structuralThick;

    if (getActiveVisibilitySettings().showFramingGlobal) {
      wResult.members.forEach(m => {
        if (!safeGet(getActiveVisibilitySettings(), m.type)) return;

        if (m.is_vertical) {
          const lx_m = m.start.x;
          const lz_m = m.z_offset || 0;
          const gp = localToGlobal(lx_m, 0, lz_m, wInput);
          const [sx, sy] = p2s(gp.x, gp.y);

          if (isPointInBox(sx, sy)) {
            foundMembers.push(m);
          }
        } else {
          const gp1 = localToGlobal(m.start.x, 0, m.z_offset || 0, wInput);
          const gp2 = localToGlobal(m.end.x, 0, m.z_offset || 0, wInput);
          const [sx1, sy1] = p2s(gp1.x, gp1.y);
          const [sx2, sy2] = p2s(gp2.x, gp2.y);

          if (isCrossing) {
            if (lineIntersectsBox(sx1, sy1, sx2, sy2, minX, maxX, minY, maxY)) {
              foundMembers.push(m);
            }
          } else {
            if (isPointInBox(sx1, sy1) && isPointInBox(sx2, sy2)) {
              foundMembers.push(m);
            }
          }
        }
      });
    }

    const gpStart = localToGlobal(0, 0, 0, wInput);
    const gpEnd = localToGlobal(len, 0, 0, wInput);
    const [sxStart, syStart] = p2s(gpStart.x, gpStart.y);
    const [sxEnd, syEnd] = p2s(gpEnd.x, gpEnd.y);

    if (isCrossing) {
      if (lineIntersectsBox(sxStart, syStart, sxEnd, syEnd, minX, maxX, minY, maxY)) {
        foundWallIndices.push(i);
      }
    } else {
      if (isPointInBox(sxStart, syStart) && isPointInBox(sxEnd, syEnd)) {
        foundWallIndices.push(i);
      }
    }
  }

  state.selectedOpening = null;

  // Ensure parent walls of found members are also added to foundWallIndices
  foundMembers.forEach(m => {
    for (let i = 0; i < state.framingResult.length; i++) {
      if (safeGet(state.framingResult, i).members.includes(m)) {
        if (!foundWallIndices.includes(i)) {
          foundWallIndices.push(i);
        }
        break;
      }
    }
  });

  if (getActiveVisibilitySettings().showFramingGlobal && foundMembers.length > 0) {
    foundMembers.forEach(m => {
      if (!selectedMembers.includes(m)) selectedMembers.push(m);
    });
    state.selectedMembers = selectedMembers;
    state.selectedMember = safeGet(selectedMembers, selectedMembers.length - 1) || null;

    if (state.selectedMember && state.framingResult) {
      for (let i = 0; i < state.framingResult.length; i++) {
        if (safeGet(state.framingResult, i).members.includes(state.selectedMember)) {
          state.currentWallIdx = i;
          getEl('wallSelect').value = i;
          await restoreWallConfig(i);
          break;
        }
      }
    }
  } else if (!isMulti) {
    state.selectedMembers = [];
    state.selectedMember = null;
  }

  if (foundWallIndices.length > 0) {
    foundWallIndices.forEach(idx => {
      if (!selectedWallIndices.includes(idx)) selectedWallIndices.push(idx);
    });
    state.selectedWallIndices = selectedWallIndices;
    if (foundMembers.length === 0) {
      state.currentWallIdx = safeGet(selectedWallIndices, selectedWallIndices.length - 1) ?? state.currentWallIdx;
      getEl('wallSelect').value = state.currentWallIdx;
      await restoreWallConfig(state.currentWallIdx);
    }
  } else if (!isMulti) {
    state.selectedWallIndices = [];
  }

  if (foundJoins.length > 0) {
    foundJoins.forEach(j => {
      const key = [j.stopped_wall_id, j.continuing_wall_id].sort().join(':');
      const alreadyHas = selectedJoins.some(sj => [sj.stopped_wall_id, sj.continuing_wall_id].sort().join(':') === key);
      if (!alreadyHas) {
        selectedJoins.push(j);
      }
    });
    state.selectedJoins = selectedJoins;
    state.selectedJoin = safeGet(selectedJoins, selectedJoins.length - 1) || null;
  } else if (!isMulti) {
    state.selectedJoins = [];
    state.selectedJoin = null;
  }

  syncBrowserTreeSelection();
  renderPlan();
  render();
  updateSelectedElementInfo();
}

async function perform3DBoxSelection(minX, maxX, minY, maxY, isCrossing, isMulti) {
  if (!state.wallsData || !state.framingResult) return;

  if (!isMulti) {
    state.selectedJoin = null;
    state.selectedJoins = [];
  }

  const selectedMembers = isMulti ? [...(state.selectedMembers || [])] : [];
  const selectedWallIndices = isMulti ? [...(state.selectedWallIndices || [])] : [];

  const foundMembers = [];
  const foundWallIndices = [];

  const canvas3D = getEl('framingCanvas3D');
  if (!canvas3D) return;

  const rect = canvas3D.getBoundingClientRect();
  const box = new THREE.Box3();
  const vector = new THREE.Vector3();

  // Force update scene world matrices so bounding box calculations are up-to-date
  scene3D.updateMatrixWorld(true);

  scene3D.traverse(node => {
    if (!node.isMesh) return;

    // Check if the node itself and all its ancestors are visible
    let visible = true;
    let parent = node;
    while (parent) {
      if (parent.visible === false) {
        visible = false;
        break;
      }
      parent = parent.parent;
    }
    if (!visible) return;

    const ud = node.userData;
    if (!ud) return;

    if (ud.isMemberMesh && ud.memberRef) {
      const m = ud.memberRef;
      if (!foundMembers.includes(m)) {
        if (!getActiveVisibilitySettings().showFramingGlobal) return;
        if (!safeGet(getActiveVisibilitySettings(), m.type)) return;

        box.setFromObject(node);
        const min = box.min;
        const max = box.max;

        const corners = [
          new THREE.Vector3(min.x, min.y, min.z),
          new THREE.Vector3(min.x, min.y, max.z),
          new THREE.Vector3(min.x, max.y, min.z),
          new THREE.Vector3(min.x, max.y, max.z),
          new THREE.Vector3(max.x, min.y, min.z),
          new THREE.Vector3(max.x, min.y, max.z),
          new THREE.Vector3(max.x, max.y, min.z),
          new THREE.Vector3(max.x, max.y, max.z)
        ];

        let minScreenX = Infinity, maxScreenX = -Infinity;
        let minScreenY = Infinity, maxScreenY = -Infinity;
        let allInBox = true;
        let anyInFront = false;

        for (const corner of corners) {
          // Check if corner is in front of the camera (z coordinate in camera space is negative)
          const tempV = corner.clone().applyMatrix4(camera3D.matrixWorldInverse);
          if (tempV.z < 0) {
            anyInFront = true;
            vector.copy(corner).project(camera3D);
            const sx = (vector.x * 0.5 + 0.5) * rect.width;
            const sy = (-vector.y * 0.5 + 0.5) * rect.height;

            if (sx < minScreenX) minScreenX = sx;
            if (sx > maxScreenX) maxScreenX = sx;
            if (sy < minScreenY) minScreenY = sy;
            if (sy > maxScreenY) maxScreenY = sy;

            const inBox = (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY);
            if (!inBox) {
              allInBox = false;
            }
          } else {
            allInBox = false;
          }
        }

        if (anyInFront) {
          if (isCrossing) {
            const overlaps = (
              minScreenX <= maxX && maxScreenX >= minX &&
              minScreenY <= maxY && maxScreenY >= minY
            );
            if (overlaps) {
              foundMembers.push(m);
            }
          } else {
            if (allInBox) {
              foundMembers.push(m);
            }
          }
        }
      }
    } else if (ud.isWallVolume && getActiveVisibilitySettings().showWallVolume) {
      const wallIdx = ud.wallIdx;
      if (wallIdx === undefined || wallIdx === null) return;
      if (!foundWallIndices.includes(wallIdx)) {
        box.setFromObject(node);
        const min = box.min;
        const max = box.max;

        const corners = [
          new THREE.Vector3(min.x, min.y, min.z),
          new THREE.Vector3(min.x, min.y, max.z),
          new THREE.Vector3(min.x, max.y, min.z),
          new THREE.Vector3(min.x, max.y, max.z),
          new THREE.Vector3(max.x, min.y, min.z),
          new THREE.Vector3(max.x, min.y, max.z),
          new THREE.Vector3(max.x, max.y, min.z),
          new THREE.Vector3(max.x, max.y, max.z)
        ];

        let minScreenX = Infinity, maxScreenX = -Infinity;
        let minScreenY = Infinity, maxScreenY = -Infinity;
        let allInBox = true;
        let anyInFront = false;

        for (const corner of corners) {
          // Check if corner is in front of the camera (z coordinate in camera space is negative)
          const tempV = corner.clone().applyMatrix4(camera3D.matrixWorldInverse);
          if (tempV.z < 0) {
            anyInFront = true;
            vector.copy(corner).project(camera3D);
            const sx = (vector.x * 0.5 + 0.5) * rect.width;
            const sy = (-vector.y * 0.5 + 0.5) * rect.height;

            if (sx < minScreenX) minScreenX = sx;
            if (sx > maxScreenX) maxScreenX = sx;
            if (sy < minScreenY) minScreenY = sy;
            if (sy > maxScreenY) maxScreenY = sy;

            const inBox = (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY);
            if (!inBox) {
              allInBox = false;
            }
          } else {
            allInBox = false;
          }
        }

        if (anyInFront) {
          if (isCrossing) {
            const overlaps = (
              minScreenX <= maxX && maxScreenX >= minX &&
              minScreenY <= maxY && maxScreenY >= minY
            );
            if (overlaps) {
              foundWallIndices.push(wallIdx);
            }
          } else {
            if (allInBox) {
              foundWallIndices.push(wallIdx);
            }
          }
        }
      }
    }
  });

  state.selectedOpening = null;

  // Ensure parent walls of found members are also added to foundWallIndices
  foundMembers.forEach(m => {
    for (let i = 0; i < state.framingResult.length; i++) {
      if (safeGet(state.framingResult, i).members.includes(m)) {
        if (!foundWallIndices.includes(i)) {
          foundWallIndices.push(i);
        }
        break;
      }
    }
  });

  if (getActiveVisibilitySettings().showFramingGlobal && foundMembers.length > 0) {
    foundMembers.forEach(m => {
      if (!selectedMembers.includes(m)) selectedMembers.push(m);
    });
    state.selectedMembers = selectedMembers;
    state.selectedMember = safeGet(selectedMembers, selectedMembers.length - 1) || null;

    if (state.selectedMember && state.framingResult) {
      for (let i = 0; i < state.framingResult.length; i++) {
        if (safeGet(state.framingResult, i).members.includes(state.selectedMember)) {
          state.currentWallIdx = i;
          getEl('wallSelect').value = i;
          await restoreWallConfig(i);
          break;
        }
      }
    }
  } else if (!isMulti) {
    state.selectedMembers = [];
    state.selectedMember = null;
  }

  if (foundWallIndices.length > 0) {
    foundWallIndices.forEach(idx => {
      if (!selectedWallIndices.includes(idx)) selectedWallIndices.push(idx);
    });
    state.selectedWallIndices = selectedWallIndices;
    if (foundMembers.length === 0) {
      state.currentWallIdx = safeGet(selectedWallIndices, selectedWallIndices.length - 1) ?? state.currentWallIdx;
      getEl('wallSelect').value = state.currentWallIdx;
      await restoreWallConfig(state.currentWallIdx);
    }
  } else if (!isMulti) {
    state.selectedWallIndices = [];
  }

  updateMemberSummary();
  updateWallInfo();
  syncBrowserTreeSelection();
  updateSelectedElementInfo();
  update3DVisualStates();
  render3DScene();
  render();
  if (planCanvas) renderPlan();
}

function lineIntersectsBox(x1, y1, x2, y2, minX, maxX, minY, maxY) {
  if ((x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY) ||
    (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY)) {
    return true;
  }
  return lineIntersectsLine(x1, y1, x2, y2, minX, minY, maxX, minY) ||
    lineIntersectsLine(x1, y1, x2, y2, minX, maxY, maxX, maxY) ||
    lineIntersectsLine(x1, y1, x2, y2, minX, minY, minX, maxY) ||
    lineIntersectsLine(x1, y1, x2, y2, maxX, minY, maxX, maxY);
}

function lineIntersectsLine(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y) {
  const det = (a2x - a1x) * (b2y - b1y) - (a2y - a1y) * (b2x - b1x);
  if (det === 0) return false;

  const lambda = ((b2y - b1y) * (b1x - a1x) + (b1x - b2x) * (b1y - a1y)) / det;
  const gamma = ((a1y - a2y) * (b1x - a1x) + (a2x - a1x) * (b1y - a1y)) / det;

  return (0 <= lambda && lambda <= 1) && (0 <= gamma && gamma <= 1);
}

function updatePlanTooltip(m, wallIdx, cx, cy) {
  const el = getEl('tooltipPlan');
  if (!el) return;
  if (!m) {
    el.classList.add('hidden');
    return;
  }

  const wall = safeGet(state.framingResult, wallIdx);
  const wallId = wall?.wall_id || safeGet(state.wallsData, wallIdx)?.wall_id || ('Wall ' + wallIdx);

  const len = m.is_vertical ? Math.abs(m.end.y - m.start.y) : Math.abs(m.end.x - m.start.x);
  el.innerHTML = 
    '<div class="tt-label">' + escapeHtml(m.label || m.type) + '</div>' +
    '<div class="tt-row"><span class="tt-key">Wall ID</span><span class="tt-val">' + escapeHtml(wallId) + '</span></div>' +
    '<div class="tt-row"><span class="tt-key">Type</span><span class="tt-val">' + escapeHtml(safeGet(MEMBER_LABELS, m.type) || m.type) + '</span></div>' +
    '<div class="tt-row"><span class="tt-key">Profile</span><span class="tt-val">' + escapeHtml(m.profile || '—') + '</span></div>' +
    '<div class="tt-row"><span class="tt-key">Length</span><span class="tt-val">' + escapeHtml(mmToDisplay(len)) + '</span></div>' +
    '<div class="tt-row"><span class="tt-key">Depth</span><span class="tt-val">' + escapeHtml(mmToDisplay(m.depth_mm)) + '</span></div>' +
    '<div class="tt-row"><span class="tt-key">Rotation</span><span class="tt-val">' + escapeHtml(m.rotation) + '°</span></div>';
  el.classList.remove('hidden');

  const rect = planCanvas.getBoundingClientRect();
  const tx = cx - rect.left;
  const ty = cy - rect.top;
  let l = tx + 14, t = ty + 14;
  if (l + 220 > rect.width) l = tx - 234;
  if (t + 150 > rect.height) t = ty - 164;
  el.style.left = l + 'px';
  el.style.top = t + 'px';
}

function updatePlanJoinTooltip(j, cx, cy) {
  const el = getEl('tooltipPlan');
  if (!el) return;
  if (!j) {
    el.classList.add('hidden');
    return;
  }

  const styleKey = [j.stopped_wall_id, j.continuing_wall_id].sort().join(':');
  const style = state.joinOverrides[styleKey] || j.style_name || (j.join_type === 'L' ? 'L10' : 'T10');

  el.innerHTML = 
    '<div class="tt-label">' + j.join_type + '-Join Marker</div>' +
    '<div class="tt-row"><span class="tt-key">Stopped Wall</span><span class="tt-val">' + escapeHtml(j.stopped_wall_id) + '</span></div>' +
    '<div class="tt-row"><span class="tt-key">Continuing Wall</span><span class="tt-val">' + escapeHtml(j.continuing_wall_id) + '</span></div>' +
    '<div class="tt-row"><span class="tt-key">Angle</span><span class="tt-val">' + j.angle_deg.toFixed(1) + '°</span></div>' +
    '<div class="tt-row"><span class="tt-key">Active Style</span><span class="tt-val" style="color: var(--accent); font-weight: bold;">' + escapeHtml(style) + '</span></div>';
  el.classList.remove('hidden');

  const rect = planCanvas.getBoundingClientRect();
  const tx = cx - rect.left;
  const ty = cy - rect.top;
  let l = tx + 14, t = ty + 14;
  if (l + 220 > rect.width) l = tx - 234;
  if (t + 150 > rect.height) t = ty - 164;
  el.style.left = l + 'px';
  el.style.top = t + 'px';
}

function getSelectionActionsHtml() {
  const hasSelection = state.selectedMember ||
    (state.selectedMembers && state.selectedMembers.length > 0) ||
    (state.selectedWallIndices && state.selectedWallIndices.length > 0) ||
    (state.selectedJoins && state.selectedJoins.length > 0);
  if (!hasSelection) return '';

  const selectedWallCount = state.selectedWallIndices ? state.selectedWallIndices.length : 0;
  const selectedMemberCount = state.selectedMembers ? state.selectedMembers.length : 0;
  const selectedJoinCount = state.selectedJoins ? state.selectedJoins.length : 0;

  let html = `
    <div class="selection-actions-container" style="display: flex; flex-direction: column; gap: 6px;">
  `;

  // Add Selection Filter button
  if (selectedWallCount > 0 || selectedMemberCount > 0 || selectedJoinCount > 0) {
    html += `
      <button id="btnSelectionFilter" class="btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; font-size:12px; font-weight:600; padding:6px 12px; border-radius: 6px; cursor: pointer; background: var(--bg-panel); border: 1px solid var(--border-color); color: var(--text-primary);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px;">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
        </svg>
        Filter Selection...
      </button>
    `;
  }

  // Add Create Group button
  if (selectedWallCount > 0) {
    html += `
      <button id="btnCreateGroupFromSelection" class="btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; font-size:12px; font-weight:600; padding:6px 12px; border-radius: 6px; cursor: pointer; background: var(--bg-panel); border: 1px solid var(--border-color); color: var(--text-primary);">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px;">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
          <line x1="12" y1="11" x2="12" y2="17"></line>
          <line x1="9" y1="14" x2="15" y2="14"></line>
        </svg>
        Create Group from Selection
      </button>
    `;
  }

  if (state.sectionBoxActive) {
    html += `
      <button id="btnClearSelectionBox" class="btn" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; font-size:12px; font-weight:600; padding:6px 12px; border-radius: 6px; cursor: pointer; background: var(--bg-panel); border: 1px solid var(--border-color); color: var(--text-primary);">
        Clear Selection Box
      </button>
    `;
  } else {
    html += `
      <button id="btnSelectionBox" class="btn btn-primary" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; font-size:12px; font-weight:600; padding:6px 12px; border-radius: 6px; border: none; cursor: pointer; background: var(--accent); color: white;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px;">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="9" y1="3" x2="9" y2="21"></line>
          <line x1="15" y1="3" x2="15" y2="21"></line>
          <line x1="3" y1="9" x2="21" y2="9"></line>
          <line x1="3" y1="15" x2="21" y2="15"></line>
        </svg>
        Selection Box (BX)
      </button>
    `;
  }

  html += `</div>`;
  return html;
}

function attachSelectionActionsListeners(parentEl) {
  const btnSel = parentEl.querySelector('#btnSelectionBox');
  if (btnSel) {
    btnSel.addEventListener('click', () => {
      enableSelectionBoxForCurrentSelection();
    });
  }

  const btnClear = parentEl.querySelector('#btnClearSelectionBox');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      disableSelectionBox();
    });
  }

  const btnFilter = parentEl.querySelector('#btnSelectionFilter');
  if (btnFilter) {
    btnFilter.addEventListener('click', async () => {
      const wCount = state.selectedWallIndices ? state.selectedWallIndices.length : 0;
      const mCount = state.selectedMembers ? state.selectedMembers.length : 0;
      const jCount = state.selectedJoins ? state.selectedJoins.length : 0;

      if (wCount === 0 && mCount === 0 && jCount === 0) return;

      const customDiv = document.createElement('div');
      customDiv.style.display = 'flex';
      customDiv.style.flexDirection = 'column';
      customDiv.style.gap = '12px';
      customDiv.style.marginTop = '8px';

      let checkboxHtml = `<div style="font-size:12px; color:var(--text-muted); margin-bottom:4px;">Select the categories of elements to keep:</div>`;
      if (wCount > 0) {
        checkboxHtml += `
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; color:var(--text-color);">
            <input type="checkbox" id="filter_walls_cb" style="width:16px; height:16px; cursor:pointer;" checked>
            Walls (${wCount})
          </label>
        `;
      }
      if (mCount > 0) {
        checkboxHtml += `
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; color:var(--text-color);">
            <input type="checkbox" id="filter_members_cb" style="width:16px; height:16px; cursor:pointer;" checked>
            Framing Members (${mCount})
          </label>
        `;
      }
      if (jCount > 0) {
        checkboxHtml += `
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:13px; color:var(--text-color);">
            <input type="checkbox" id="filter_joins_cb" style="width:16px; height:16px; cursor:pointer;" checked>
            Wall Joins (${jCount})
          </label>
        `;
      }
      customDiv.innerHTML = checkboxHtml;

      const result = await createCustomDialog({
        title: 'Filter Selection',
        customHtml: customDiv,
        confirmText: 'OK',
        cancelText: 'Cancel'
      });

      if (result) {
        if (wCount > 0 && result.filter_walls_cb === false) {
          state.selectedWallIndices = [];
        }
        if (mCount > 0 && result.filter_members_cb === false) {
          state.selectedMembers = [];
          state.selectedMember = null;
        }
        if (jCount > 0 && result.filter_joins_cb === false) {
          state.selectedJoins = [];
          state.selectedJoin = null;
        }

        updateMemberSummary();
        updateWallInfo();
        syncBrowserTreeSelection();
        updateSelectedElementInfo();
        update3DVisualStates();
        render3DScene();
        render();
        if (planCanvas) renderPlan();
      }
    });
  }

  const btnGroup = parentEl.querySelector('#btnCreateGroupFromSelection');
  if (btnGroup) {
    btnGroup.addEventListener('click', async () => {
      if (!state.selectedWallIndices || state.selectedWallIndices.length === 0) {
        showToast('No walls selected to group');
        return;
      }
      const groupName = await showPrompt('Enter group name for the selected walls:', 'Group 1', 'Create Wall Group');
      if (groupName && groupName.trim()) {
        const name = groupName.trim();
        if (state.wallGroups[name]) {
          await showAlert(`Group '${name}' already exists. Please choose a different name.`, 'Duplicate Group');
          return;
        }
        state.wallGroups[name] = {
          wallIndices: [...state.selectedWallIndices],
          config: null,
          configName: null,
        };
        renderGroups();
        showToast(`Group '${name}' created with ${state.selectedWallIndices.length} walls!`);
      }
    });
  }
}

function updateSelectedElementInfo() {
  updateSelectionActionBar();
  updateWallConfigLabel();
  const el = getEl('propertiesInfo');
  if (!el) return;

  if (state.selectedJoins && state.selectedJoins.length > 0) {
    const customLJoins = Object.keys(state.configRaw?.custom_l_joins || {});
    const customTJoins = Object.keys(state.configRaw?.custom_t_joins || {});

    // Compute styles of selected joins
    const styles = state.selectedJoins.map(j => {
      const styleKey = [j.stopped_wall_id, j.continuing_wall_id].sort().join(':');
      const isL = j.join_type === 'L';
      return state.joinOverrides[styleKey] || j.style_name || (isL ? 'L10' : 'T10');
    });
    const uniqueStyles = [...new Set(styles)];
    const hasMultipleStyles = uniqueStyles.length > 1;
    const commonStyle = hasMultipleStyles ? '' : uniqueStyles[0];

    const allL = state.selectedJoins.every(j => j.join_type === 'L');
    const allT = state.selectedJoins.every(j => j.join_type === 'T');

    let styleOptionsHtml = '';
    if (hasMultipleStyles) {
      styleOptionsHtml += `<option value="" disabled selected>Multiple</option>`;
    }

    if (allL) {
      styleOptionsHtml +=
        '<option value="L10" ' + (commonStyle === 'L10' ? 'selected' : '') + '>L10 (Stop at Core Face)</option>' +
        '<option value="L11" ' + (commonStyle === 'L11' ? 'selected' : '') + '>L11 (Stop at Finish Face)</option>' +
        '<option value="L12" ' + (commonStyle === 'L12' ? 'selected' : '') + '>L12 (Core Face + Extra Stud)</option>' +
        '<option value="L13" ' + (commonStyle === 'L13' ? 'selected' : '') + '>L13 (Finish Face + Extra Stud)</option>' +
        '<option value="L14" ' + (commonStyle === 'L14' ? 'selected' : '') + '>L14 (Core Face + Back-to-Back Studs)</option>' +
        '<option value="L15" ' + (commonStyle === 'L15' ? 'selected' : '') + '>L15 (Rotated Backing Stud)</option>' +
        customLJoins.map(n => '<option value="' + escapeHtml(n) + '" ' + (commonStyle === n ? 'selected' : '') + '>' + escapeHtml(n) + ' (Custom)</option>').join('');
    } else if (allT) {
      styleOptionsHtml +=
        '<option value="T10" ' + (commonStyle === 'T10' || commonStyle === 'standard_t' ? 'selected' : '') + '>T10 (Standard)</option>' +
        '<option value="T11" ' + (commonStyle === 'T11' ? 'selected' : '') + '>T11 (Double Backing Studs)</option>' +
        '<option value="T12" ' + (commonStyle === 'T12' ? 'selected' : '') + '>T12 (Double Backing + Mirrored Stud)</option>' +
        customTJoins.map(n => '<option value="' + escapeHtml(n) + '" ' + (commonStyle === n ? 'selected' : '') + '>' + escapeHtml(n) + ' (Custom)</option>').join('');
    } else {
      styleOptionsHtml +=
        '<optgroup label="L-Join Styles">' +
          '<option value="L10" ' + (commonStyle === 'L10' ? 'selected' : '') + '>L10 (Stop at Core Face)</option>' +
          '<option value="L11" ' + (commonStyle === 'L11' ? 'selected' : '') + '>L11 (Stop at Finish Face)</option>' +
          '<option value="L12" ' + (commonStyle === 'L12' ? 'selected' : '') + '>L12 (Core Face + Extra Stud)</option>' +
          '<option value="L13" ' + (commonStyle === 'L13' ? 'selected' : '') + '>L13 (Finish Face + Extra Stud)</option>' +
          '<option value="L14" ' + (commonStyle === 'L14' ? 'selected' : '') + '>L14 (Core Face + Back-to-Back Studs)</option>' +
          '<option value="L15" ' + (commonStyle === 'L15' ? 'selected' : '') + '>L15 (Rotated Backing Stud)</option>' +
          customLJoins.map(n => '<option value="' + escapeHtml(n) + '" ' + (commonStyle === n ? 'selected' : '') + '>' + escapeHtml(n) + ' (Custom)</option>').join('') +
        '</optgroup>' +
        '<optgroup label="T-Join Styles">' +
          '<option value="T10" ' + (commonStyle === 'T10' || commonStyle === 'standard_t' ? 'selected' : '') + '>T10 (Standard)</option>' +
          '<option value="T11" ' + (commonStyle === 'T11' ? 'selected' : '') + '>T11 (Double Backing Studs)</option>' +
          '<option value="T12" ' + (commonStyle === 'T12' ? 'selected' : '') + '>T12 (Double Backing + Mirrored Stud)</option>' +
          customTJoins.map(n => '<option value="' + escapeHtml(n) + '" ' + (commonStyle === n ? 'selected' : '') + '>' + escapeHtml(n) + ' (Custom)</option>').join('') +
        '</optgroup>';
    }

    if (state.selectedJoins.length === 1) {
      const j = state.selectedJoins[0];
      el.innerHTML = `
        <div class="properties-sticky-header" style="position: sticky; top: -12px; background: var(--bg-panel); backdrop-filter: blur(12px); margin: -12px -14px 12px -14px; padding: 12px 14px 10px 14px; border-bottom: 1px solid var(--border-color); z-index: 10;">
          <div class="selected-element-title" style="font-weight:700; font-size: 13px; color: var(--accent); margin-bottom: 8px;">
            Selected ${j.join_type}-Join
          </div>
          ${getSelectionActionsHtml()}
        </div>
        <div class="wall-stat"><span class="label">Stopped Wall</span><span class="value">${escapeHtml(j.stopped_wall_id)}</span></div>
        <div class="wall-stat"><span class="label">Continuing Wall</span><span class="value">${escapeHtml(j.continuing_wall_id)}</span></div>
        <div class="wall-stat"><span class="label">Angle</span><span class="value">${j.angle_deg.toFixed(2)}°</span></div>
        
        <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border-color);">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Join Settings</div>
          
          <div class="config-row-custom" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:4px;">
            <span style="font-size:11px; color:var(--text-color); margin-right:4px;">Join Style</span>
            <div style="display: flex; gap: 4px; align-items: center;">
              <select id="join_style_override" class="glass-input" style="width:140px; font-size:11px; padding:2px 4px; height: 28px;">
                ${styleOptionsHtml}
              </select>
              <button type="button" class="btn btn-choose" onclick="triggerSelectedJoinManager()" style="height: 28px; padding: 4px 6px;">Choose...</button>
            </div>
          </div>
        </div>
      `;
    } else {
      el.innerHTML = `
        <div class="properties-sticky-header" style="position: sticky; top: -12px; background: var(--bg-panel); backdrop-filter: blur(12px); margin: -12px -14px 12px -14px; padding: 12px 14px 10px 14px; border-bottom: 1px solid var(--border-color); z-index: 10;">
          <div class="selected-element-title" style="font-weight:700; font-size: 13px; color: var(--accent); margin-bottom: 8px;">
            Selected Joins (${state.selectedJoins.length})
          </div>
          ${getSelectionActionsHtml()}
        </div>
        <div class="wall-stat"><span class="label">Count</span><span class="value">${state.selectedJoins.length} joins</span></div>
        
        <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border-color);">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Join Settings</div>
          
          <div class="config-row-custom" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:4px;">
            <span style="font-size:11px; color:var(--text-color); margin-right:4px;">Join Style</span>
            <div style="display: flex; gap: 4px; align-items: center;">
              <select id="join_style_override" class="glass-input" style="width:140px; font-size:11px; padding:2px 4px; height: 28px;">
                ${styleOptionsHtml}
              </select>
              <button type="button" class="btn btn-choose" onclick="triggerSelectedJoinManager()" style="height: 28px; padding: 4px 6px;">Choose...</button>
            </div>
          </div>
        </div>
      `;
    }

    const selectEl = getEl('join_style_override');
    const chooseBtn = el.querySelector('.btn-choose');
    if (state.isReadOnly) {
      if (selectEl) {
        selectEl.disabled = true;
        selectEl.style.opacity = '0.5';
        selectEl.style.pointerEvents = 'none';
      }
      if (chooseBtn) {
        chooseBtn.disabled = true;
        chooseBtn.style.opacity = '0.5';
        chooseBtn.style.pointerEvents = 'none';
        chooseBtn.removeAttribute('onclick');
      }
    }

    if (selectEl) {
      selectEl.addEventListener('change', async (e) => {
        if (state.isReadOnly) return;
        const val = e.target.value;
        if (!val) return;

        state.selectedJoins.forEach(sj => {
          const styleKey = [sj.stopped_wall_id, sj.continuing_wall_id].sort().join(':');
          state.joinOverrides[styleKey] = val;
        });

        // Trigger framing calculation to apply the style immediately
        await runFraming();

        // Update selection arrays with updated joins
        const updatedJoins = [];
        state.selectedJoins.forEach(sj => {
          const styleKey = [sj.stopped_wall_id, sj.continuing_wall_id].sort().join(':');
          const updatedJoin = state.framingResult
            .flatMap(w => w.joins || [])
            .find(join => join.is_stopped_wall && [join.stopped_wall_id, join.continuing_wall_id].sort().join(':') === styleKey);
          if (updatedJoin) {
            updatedJoins.push(updatedJoin);
          } else {
            updatedJoins.push(sj);
          }
        });

        state.selectedJoins = updatedJoins;
        state.selectedJoin = safeGet(updatedJoins, updatedJoins.length - 1) || null;
        updateSelectedElementInfo();
      });
    }
    attachSelectionActionsListeners(el);
    return;
  }

  if (state.selectedOpening) {
    const op = state.selectedOpening;
    const parentWallIdx = state.currentWallIdx;

    const originalWall = getOriginalWallInput(parentWallIdx);
    const currentWall = state.wallsData[parentWallIdx];

    let origOp = null;
    if (originalWall && originalWall.openings) {
      origOp = originalWall.openings.find(o => o.label === op.label);
    }

    let currOp = null;
    if (currentWall && currentWall.openings) {
      currOp = currentWall.openings.find(o => o.label === op.label);
    }

    const targetOp = origOp || currOp || op;
    if (!targetOp.config_overrides) targetOp.config_overrides = {};
    const ov = targetOp.config_overrides;

    const wVal = op.width;
    const hVal = op.height;
    const sillVal = op.sill_height || 0;

    el.innerHTML = `
      <div class="selected-element-title" style="font-weight:700; font-size: 13px; color: var(--accent); margin-bottom: 8px;">
        Selected Opening: ${escapeHtml(op.label || 'Opening')}
      </div>
      <div class="wall-stat"><span class="label">Type</span><span class="value" style="text-transform: capitalize;">${escapeHtml(op.type || op.opening_type || 'window')}</span></div>
      <div class="wall-stat"><span class="label">Width</span><span class="value">${mmToDisplay(wVal)}</span></div>
      <div class="wall-stat"><span class="label">Height</span><span class="value">${mmToDisplay(hVal)}</span></div>
      <div class="wall-stat"><span class="label">Sill Height</span><span class="value">${mmToDisplay(sillVal)}</span></div>
      <div class="wall-stat"><span class="label">Offset X</span><span class="value">${mmToDisplay(op.x_offset || op.x_start || 0)}</span></div>

      <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid var(--border-color);">
        <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:8px; text-transform:uppercase;">Framing Overrides</div>

        <div class="config-row-custom" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:11px; color:var(--text-color);">Header Type</span>
          <select id="op_header_type" class="glass-input" style="width:130px; font-size:11px; padding:2px 4px;">
            <option value="" ${ov.header_type === undefined ? 'selected' : ''}>Default</option>
            <option value="single" ${ov.header_type === 'single' ? 'selected' : ''}>Single</option>
            <option value="box" ${ov.header_type === 'box' ? 'selected' : ''}>Box</option>
            <option value="built_up" ${ov.header_type === 'built_up' ? 'selected' : ''}>Built Up</option>
          </select>
        </div>

        <div class="config-row-custom" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:11px; color:var(--text-color);">King Stud Type</span>
          <select id="op_king_type" class="glass-input" style="width:130px; font-size:11px; padding:2px 4px;">
            <option value="" ${ov.king_type === undefined ? 'selected' : ''}>Default</option>
            <option value="single" ${ov.king_type === 'single' ? 'selected' : ''}>Single</option>
            <option value="single_box" ${ov.king_type === 'single_box' ? 'selected' : ''}>Single Box</option>
            <option value="double" ${ov.king_type === 'double' ? 'selected' : ''}>Double</option>
          </select>
        </div>

        <div class="config-row-custom" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:11px; color:var(--text-color);">King Stud Mode</span>
          <select id="op_king_mode" class="glass-input" style="width:130px; font-size:11px; padding:2px 4px;">
            <option value="" ${ov.king_stud_mode === undefined ? 'selected' : ''}>Default</option>
            <option value="full_height" ${ov.king_stud_mode === 'full_height' ? 'selected' : ''}>Full Height</option>
            <option value="stretch_to_nearest" ${ov.king_stud_mode === 'stretch_to_nearest' ? 'selected' : ''}>Stretch to Nearest</option>
          </select>
        </div>

        <div class="config-row-custom" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:11px; color:var(--text-color);">Use Trimmers</span>
          <select id="op_use_trimmers" class="glass-input" style="width:130px; font-size:11px; padding:2px 4px;">
            <option value="" ${ov.use_trimmer_studs === undefined ? 'selected' : ''}>Default</option>
            <option value="true" ${ov.use_trimmer_studs === true || ov.use_trimmer_studs === 'true' ? 'selected' : ''}>Yes</option>
            <option value="false" ${ov.use_trimmer_studs === false || ov.use_trimmer_studs === 'false' ? 'selected' : ''}>No</option>
          </select>
        </div>

        <div class="config-row-custom" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:11px; color:var(--text-color);">Use Cripples</span>
          <select id="op_use_cripples" class="glass-input" style="width:130px; font-size:11px; padding:2px 4px;">
            <option value="" ${ov.use_cripple_studs === undefined ? 'selected' : ''}>Default</option>
            <option value="true" ${ov.use_cripple_studs === true || ov.use_cripple_studs === 'true' ? 'selected' : ''}>Yes</option>
            <option value="false" ${ov.use_cripple_studs === false || ov.use_cripple_studs === 'false' ? 'selected' : ''}>No</option>
          </select>
        </div>

        <div style="font-size:10px; font-weight:600; color:var(--text-muted); margin-top:8px; margin-bottom:4px; text-transform:uppercase;">Tolerances (${state.displayUnit === 'mm' ? 'mm' : (state.displayUnit === 'in' ? 'in' : 'ft-in')})</div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:12px;">
          <div>
            <label style="font-size:10px; color:var(--text-muted);">Left</label>
            <input type="text" id="op_tol_l" class="glass-input" style="width:100%; font-size:11px; padding:2px 4px;" value="${ov.opening_tolerance_left_mm !== undefined && ov.opening_tolerance_left_mm !== null ? mmToDisplay(ov.opening_tolerance_left_mm) : ''}" placeholder="0">
          </div>
          <div>
            <label style="font-size:10px; color:var(--text-muted);">Right</label>
            <input type="text" id="op_tol_r" class="glass-input" style="width:100%; font-size:11px; padding:2px 4px;" value="${ov.opening_tolerance_right_mm !== undefined && ov.opening_tolerance_right_mm !== null ? mmToDisplay(ov.opening_tolerance_right_mm) : ''}" placeholder="0">
          </div>
          <div>
            <label style="font-size:10px; color:var(--text-muted);">Top</label>
            <input type="text" id="op_tol_t" class="glass-input" style="width:100%; font-size:11px; padding:2px 4px;" value="${ov.opening_tolerance_top_mm !== undefined && ov.opening_tolerance_top_mm !== null ? mmToDisplay(ov.opening_tolerance_top_mm) : ''}" placeholder="0">
          </div>
          <div>
            <label style="font-size:10px; color:var(--text-muted);">Bottom</label>
            <input type="text" id="op_tol_b" class="glass-input" style="width:100%; font-size:11px; padding:2px 4px;" value="${ov.opening_tolerance_bottom_mm !== undefined && ov.opening_tolerance_bottom_mm !== null ? mmToDisplay(ov.opening_tolerance_bottom_mm) : ''}" placeholder="0">
          </div>
        </div>

        <div style="display:flex; gap:6px;">
          <button id="btnOpApplyOverrides" class="glass-btn btn-primary" style="flex:1.5; font-size:11px; padding:6px 8px; font-weight:700;">Apply Changes</button>
          <button id="btnOpClearOverrides" class="glass-btn" style="flex:1; font-size:11px; padding:6px 8px;">Clear All</button>
        </div>
      </div>
    `;

    const saveOpField = (field, val) => {
      if (state.isReadOnly) return;
      const updateOpObj = (targetOp) => {
        if (!targetOp) return;
        if (!targetOp.config_overrides) targetOp.config_overrides = {};
        if (val === "") {
          Reflect.deleteProperty(targetOp.config_overrides, field);
        } else {
          if (field === 'use_trimmer_studs' || field === 'use_cripple_studs') {
            safeSet(targetOp.config_overrides, field, val === 'true');
          } else if (field.startsWith('opening_tolerance_')) {
            const parsed = displayToMm(val);
            if (isNaN(parsed)) {
              Reflect.deleteProperty(targetOp.config_overrides, field);
            } else {
              safeSet(targetOp.config_overrides, field, parsed);
            }
          } else {
            safeSet(targetOp.config_overrides, field, val);
          }
        }
      };

      updateOpObj(origOp);
      updateOpObj(currOp);

      const parentIdx = getParentWallIdx(currentWall);
      safeSet(state.wallConfigNames, parentIdx, 'Custom *');
      markWallCustom();
      updateWallConfigLabel();
    };

    getEl('op_header_type').addEventListener('change', (e) => saveOpField('header_type', e.target.value));
    getEl('op_king_type').addEventListener('change', (e) => saveOpField('king_type', e.target.value));
    getEl('op_king_mode').addEventListener('change', (e) => saveOpField('king_stud_mode', e.target.value));
    getEl('op_use_trimmers').addEventListener('change', (e) => saveOpField('use_trimmer_studs', e.target.value));
    getEl('op_use_cripples').addEventListener('change', (e) => saveOpField('use_cripple_studs', e.target.value));

    getEl('op_tol_l').addEventListener('change', (e) => saveOpField('opening_tolerance_left_mm', e.target.value));
    getEl('op_tol_r').addEventListener('change', (e) => saveOpField('opening_tolerance_right_mm', e.target.value));
    getEl('op_tol_t').addEventListener('change', (e) => saveOpField('opening_tolerance_top_mm', e.target.value));
    getEl('op_tol_b').addEventListener('change', (e) => saveOpField('opening_tolerance_bottom_mm', e.target.value));

    getEl('btnOpApplyOverrides').addEventListener('click', async () => {
      if (state.isReadOnly) return;
      await runFraming();
    });

    getEl('btnOpClearOverrides').addEventListener('click', async () => {
      if (state.isReadOnly) return;
      if (origOp) origOp.config_overrides = {};
      if (currOp) currOp.config_overrides = {};
      const parentIdx = getParentWallIdx(currentWall);
      safeSet(state.wallConfigNames, parentIdx, 'Custom *');
      markWallCustom();
      updateWallConfigLabel();
      updateSelectedElementInfo();
      await runFraming();
    });

    if (state.isReadOnly) {
      const inputs = el.querySelectorAll('input, select, button');
      inputs.forEach(input => {
        input.disabled = true;
        input.style.opacity = '0.5';
        input.style.pointerEvents = 'none';
      });
    }

    autoOpenPropertiesSection();
    return;
  }

  if (state.selectedMembers && state.selectedMembers.length > 1) {
    const count = state.selectedMembers.length;
    let totalLength = 0;
    const types = new Set();
    state.selectedMembers.forEach(m => {
      const len = m.is_vertical ? Math.abs(m.end.y - m.start.y) : Math.abs(m.end.x - m.start.x);
      totalLength += len;
      types.add(safeGet(MEMBER_LABELS, m.type) || m.type);
    });
    el.innerHTML = 
      '<div class="properties-sticky-header" style="position: sticky; top: -12px; background: var(--bg-panel); backdrop-filter: blur(12px); margin: -12px -14px 12px -14px; padding: 12px 14px 10px 14px; border-bottom: 1px solid var(--border-color); z-index: 10;">' +
        '<div class="selected-element-title" style="font-weight:700; font-size: 13px; color: var(--accent); margin-bottom: 8px;">' +
          'Selected: ' + count + ' Framing Members' +
        '</div>' +
        getSelectionActionsHtml() +
      '</div>' +
      '<div class="wall-stat"><span class="label">Total Length</span><span class="value">' + escapeHtml(mmToDisplay(totalLength)) + '</span></div>' +
      '<div class="wall-stat"><span class="label">Types</span><span class="value" style="font-size:11px">' + escapeHtml([...types].join(', ')) + '</span></div>';

    let parentWallInput = null;
    if (state.selectedMembers.length > 0) {
      const firstM = state.selectedMembers[0];
      if (state.framingResult) {
        for (let i = 0; i < state.framingResult.length; i++) {
          if (safeGet(state.framingResult, i).members.includes(firstM)) {
            parentWallInput = safeGet(state.wallsData, i);
            break;
          }
        }
      }
    }
    if (parentWallInput) {
      const revitHtml = getRevitParamsHtml(parentWallInput);
      if (revitHtml) {
        el.innerHTML += revitHtml;
        autoOpenPropertiesSection();
      }
    }

    attachSelectionActionsListeners(el);
    return;
  }

  if (state.selectedMember || (state.selectedMembers && state.selectedMembers.length === 1)) {
    const m = state.selectedMember || state.selectedMembers[0];
    let parentWallIdx = -1;
    let parentWall = null;
    if (state.framingResult) {
      for (let i = 0; i < state.framingResult.length; i++) {
        if (safeGet(state.framingResult, i).members.includes(m)) {
          parentWallIdx = i;
          parentWall = safeGet(state.framingResult, i);
          break;
        }
      }
    }

    if (parentWallIdx !== -1) {
      const wallInput = safeGet(state.wallsData, parentWallIdx);
      const startGlobal = localToGlobal(m.start.x, m.start.y, m.z_offset || 0, wallInput);
      const endGlobal = localToGlobal(m.end.x, m.end.y, m.z_offset || 0, wallInput);
      const len = m.is_vertical ? Math.abs(m.end.y - m.start.y) : Math.abs(m.end.x - m.start.x);
      const wallId = parentWall?.wall_id || wallInput?.wall_id || `Wall ${parentWallIdx}`;

      el.innerHTML = 
        '<div class="properties-sticky-header" style="position: sticky; top: -12px; background: var(--bg-panel); backdrop-filter: blur(12px); margin: -12px -14px 12px -14px; padding: 12px 14px 10px 14px; border-bottom: 1px solid var(--border-color); z-index: 10;">' +
          '<div class="selected-element-title" style="font-weight:700; font-size: 13px; color: var(--accent); margin-bottom: 8px;">' +
            'Framing Member: ' + escapeHtml(safeGet(MEMBER_LABELS, m.type) || m.type) +
          '</div>' +
          getSelectionActionsHtml() +
        '</div>' +
        '<div class="wall-stat"><span class="label">Wall ID</span><span class="value" style="font-size:11px;word-break:break-all">' + escapeHtml(wallId) + '</span></div>' +
        '<div class="wall-stat"><span class="label">Member Label</span><span class="value" style="font-size:11px">' + escapeHtml(m.label || '—') + '</span></div>' +
        '<div class="wall-stat"><span class="label">Profile</span><span class="value" style="font-size:11px">' + escapeHtml(m.profile || '—') + '</span></div>' +
        '<div class="wall-stat"><span class="label">Length</span><span class="value">' + escapeHtml(mmToDisplay(len)) + '</span></div>' +
        '<div class="wall-stat"><span class="label">Depth</span><span class="value">' + escapeHtml(mmToDisplay(m.depth_mm)) + '</span></div>' +
        '<div class="wall-stat"><span class="label">Flange</span><span class="value">' + escapeHtml(mmToDisplay(m.flange_mm)) + '</span></div>' +
        '<div class="wall-stat"><span class="label">Gauge</span><span class="value">' + escapeHtml(mmToDisplay(m.gauge_mm || 0)) + '</span></div>' +
        '<div class="wall-stat"><span class="label">Rotation</span><span class="value">' + m.rotation + '°</span></div>' +
        (m.FRMX_Comment ? '<div class="wall-stat" style="margin-top:4px;padding-top:4px;border-top:1px dashed var(--border-color);"><span class="label" style="color:#f87171;font-weight:600">FRMX_Comment</span><span class="value" style="color:#f87171;font-weight:600;font-size:11px;text-align:right">' + escapeHtml(m.FRMX_Comment) + '</span></div>' : '') +
        '<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border-color);">' +
          '<div style="font-size:10px;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;font-weight:600">Global Start Point</div>' +
          '<div class="wall-stat"><span class="label">X</span><span class="value">' + escapeHtml(mmToDisplay(startGlobal.x)) + '</span></div>' +
          '<div class="wall-stat"><span class="label">Y</span><span class="value">' + escapeHtml(mmToDisplay(startGlobal.y)) + '</span></div>' +
          '<div class="wall-stat"><span class="label">Z</span><span class="value">' + escapeHtml(mmToDisplay(startGlobal.z)) + '</span></div>' +
        '</div>' +
        '<div style="margin-top:6px;padding-top:6px;border-top:1px dashed var(--border-color);">' +
          '<div style="font-size:10px;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;font-weight:600">Global End Point</div>' +
          '<div class="wall-stat"><span class="label">X</span><span class="value">' + escapeHtml(mmToDisplay(endGlobal.x)) + '</span></div>' +
          '<div class="wall-stat"><span class="label">Y</span><span class="value">' + escapeHtml(mmToDisplay(endGlobal.y)) + '</span></div>' +
          '<div class="wall-stat"><span class="label">Z</span><span class="value">' + escapeHtml(mmToDisplay(endGlobal.z)) + '</span></div>' +
        '</div>';

      const revitHtml = getRevitParamsHtml(wallInput);
      if (revitHtml) {
        el.innerHTML += revitHtml;
        autoOpenPropertiesSection();
      }

      attachSelectionActionsListeners(el);
      return;
    }
  }

  if (state.selectedWallIndices && state.selectedWallIndices.length > 1) {
    const count = state.selectedWallIndices.length;
    let totalLength = 0;
    let totalOpenings = 0;
    let totalMembers = 0;
    state.selectedWallIndices.forEach(idx => {
      const wall = safeGet(state.framingResult, idx);
      const input = safeGet(state.wallsData, idx);
      if (input) {
        totalLength += wall ? wall.length_mm : (input.length || 0);
        totalOpenings += input.openings?.length || 0;
      }
      if (wall) {
        totalMembers += wall.members.length;
      }
    });
    el.innerHTML = 
      '<div class="properties-sticky-header" style="position: sticky; top: -12px; background: var(--bg-panel); backdrop-filter: blur(12px); margin: -12px -14px 12px -14px; padding: 12px 14px 10px 14px; border-bottom: 1px solid var(--border-color); z-index: 10;">' +
        '<div class="selected-element-title" style="font-weight:700; font-size: 13px; color: var(--accent); margin-bottom: 8px;">' +
          'Selected: ' + count + ' Walls' +
        '</div>' +
        getSelectionActionsHtml() +
      '</div>' +
      '<div class="wall-stat"><span class="label">Total Length</span><span class="value">' + escapeHtml(mmToDisplay(totalLength)) + '</span></div>' +
      '<div class="wall-stat"><span class="label">Total Openings</span><span class="value">' + totalOpenings + '</span></div>' +
      '<div class="wall-stat"><span class="label">Total Members</span><span class="value">' + totalMembers + '</span></div>';

    if (state.selectedWallIndices.length > 0) {
      const firstWallIdx = state.selectedWallIndices[0];
      const input = safeGet(state.wallsData, firstWallIdx);
      const revitHtml = getRevitParamsHtml(input);
      if (revitHtml) {
        el.innerHTML += revitHtml;
        autoOpenPropertiesSection();
      }
    }

    attachSelectionActionsListeners(el);
    return;
  }

  if (state.wallsData && (safeGet(state.wallsData, state.currentWallIdx) || (state.selectedWallIndices && state.selectedWallIndices.length === 1))) {
    const wallIdx = (state.selectedWallIndices && state.selectedWallIndices.length === 1) ? state.selectedWallIndices[0] : state.currentWallIdx;
    const wall = safeGet(state.framingResult, wallIdx) || getCurrentWall();
    const input = safeGet(state.wallsData, wallIdx);
    const configLabel = getWallConfigName(input);
    const configColor = configLabel === 'Custom *' ? '#ecc94b' : 'var(--accent)';
    const length = wall ? wall.length_mm : (input.length || 0);
    const height = wall ? wall.height_mm : (input.height || 0);
    const thickness = wall ? (wall.thickness_mm || input.thickness || 0) : (input.thickness || 0);
    const membersCount = wall ? wall.members.length : 0;

    let infoHtml = 
      '<div class="properties-sticky-header" style="position: sticky; top: -12px; background: var(--bg-panel); backdrop-filter: blur(12px); margin: -12px -14px 12px -14px; padding: 12px 14px 10px 14px; border-bottom: 1px solid var(--border-color); z-index: 10;">' +
        '<div class="selected-element-title" style="font-weight:700; font-size: 13px; color: var(--accent); margin-bottom: 8px;">' +
          'Selected Wall: ' + escapeHtml(input.label || input.wall_id || ('Wall ' + wallIdx)) +
        '</div>' +
        getSelectionActionsHtml() +
      '</div>' +
      '<div class="wall-stat"><span class="label">Wall ID</span><span class="value" style="font-size:11px;word-break:break-all">' + escapeHtml(input.wall_id || '—') + '</span></div>' +
      '<div class="wall-stat"><span class="label">Config</span><span class="value" style="font-size:11px;font-weight:600;color:' + escapeHtml(configColor) + '">' + escapeHtml(configLabel) + '</span></div>' +
      '<div class="wall-stat"><span class="label">Length</span><span class="value">' + escapeHtml(mmToDisplay(length)) + '</span></div>' +
      '<div class="wall-stat"><span class="label">Height</span><span class="value">' + escapeHtml(mmToDisplay(height)) + '</span></div>' +
      '<div class="wall-stat"><span class="label">Thickness</span><span class="value">' + escapeHtml(mmToDisplay(thickness)) + '</span></div>' +
      '<div class="wall-stat"><span class="label">Members</span><span class="value">' + membersCount + '</span></div>' +
      '<div class="wall-stat"><span class="label">Openings</span><span class="value">' + (input.openings?.length || 0) + '</span></div>' +
      '<div style="margin-top:8px;padding-top:6px;border-top:1px solid var(--border-color);">' +
        '<div style="font-size:10px;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px;font-weight:600">Global Origin</div>' +
        '<div class="wall-stat"><span class="label">Origin X</span><span class="value">' + escapeHtml(mmToDisplay(input.origin_x || 0)) + '</span></div>' +
        '<div class="wall-stat"><span class="label">Origin Y</span><span class="value">' + escapeHtml(mmToDisplay(input.origin_y || 0)) + '</span></div>' +
        '<div class="wall-stat"><span class="label">Origin Z</span><span class="value">' + escapeHtml(mmToDisplay(input.origin_z || 0)) + '</span></div>' +
        '<div class="wall-stat"><span class="label">Direction</span><span class="value">(' + (input.direction_x || 0).toFixed(2) + ', ' + (input.direction_y || 0).toFixed(2) + ')</span></div>' +
      '</div>';

    const revitHtml = getRevitParamsHtml(input);
    if (revitHtml) {
      infoHtml += revitHtml;
    }

    const parentIdx = getParentWallIdx(input);
    const systemMaxLen = state.configRaw?.control_join?.max_length_mm || state.configRaw?.control_join_max_length_mm || 0;
    const parentWall = state.originalWallsData?.[parentIdx] || input;
    const parentLength = parentWall ? (parentWall.length || 0) : 0;
    const hasRemoveOverride = (
      safeGet(safeGet(state.perWallOverrides, parentIdx), 'control_join_max_length_mm') === 0 &&
      systemMaxLen > 0 &&
      parentLength > systemMaxLen
    );
    const isSplitPanel = /_P\d+$/.test(input.wall_id);

    if (isSplitPanel || hasRemoveOverride) {
      if (hasRemoveOverride) {
        infoHtml += `
          <div style="margin-top:10px; padding:10px; border-radius:4px; background:rgba(236,201,75,0.08); border:1px solid rgba(236,201,75,0.2);">
            <div style="font-size:11px; font-weight:600; color:#ecc94b; margin-bottom:4px; display:flex; align-items:center; gap:4px;">
              <span>◫</span> Control Join Settings
            </div>
            <div style="font-size:11px; color:var(--text-secondary); margin-bottom:8px;">
              ✓ Control join will be removed on refresh.
            </div>
            <button id="btnCancelRemoveControlJoin" class="btn" style="width:100%; padding:4px 8px; font-size:11px; background:var(--bg-input); color:var(--text-primary); border:1px solid var(--border-color); border-radius:4px; cursor:pointer;">
              Undo Remove
            </button>
          </div>
        `;
      } else {
        infoHtml += `
          <div style="margin-top:10px; padding:10px; border-radius:4px; background:rgba(66,153,225,0.08); border:1px solid rgba(66,153,225,0.2);">
            <div style="font-size:11px; font-weight:600; color:var(--accent); margin-bottom:4px; display:flex; align-items:center; gap:4px;">
              <span>◫</span> Control Join Settings
            </div>
            <div style="font-size:11px; color:var(--text-secondary); margin-bottom:8px;">
              Control join was applied on wall.
            </div>
            <button id="btnRemoveControlJoin" class="btn" style="width:100%; padding:4px 8px; font-size:11px; background:#f56565; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:600; display:flex; align-items:center; justify-content:center; gap:4px;">
              ✕ Remove Join
            </button>
          </div>
        `;
      }
    }

    el.innerHTML = infoHtml;

    if (revitHtml) {
      autoOpenPropertiesSection();
    }

    const btnRemove = el.querySelector('#btnRemoveControlJoin');
    if (btnRemove) {
      btnRemove.addEventListener('click', () => {
        // Collect current overrides to base the per-wall override on, then modify max length to 0
        const ov = collectOverrides();
        ov.control_join_max_length_mm = 0;
        safeSet(state.perWallOverrides, parentIdx, ov);

        // Update input field to show 0
        setFieldMm('cfg-control-join-max-length', 0);

        // Also update wallConfigNames to Custom *
        if (!state.wallConfigNames) state.wallConfigNames = {};
        safeSet(state.wallConfigNames, parentIdx, 'Custom *');

        markWallCustom();
        updateSelectedElementInfo();
      });
    }
    const btnCancelRemove = el.querySelector('#btnCancelRemoveControlJoin');
    if (btnCancelRemove) {
      btnCancelRemove.addEventListener('click', async () => {
        // Remove override for control join only
        if (safeGet(state.perWallOverrides, parentIdx)) {
          Reflect.deleteProperty(safeGet(state.perWallOverrides, parentIdx), 'control_join_max_length_mm');

          // Revert back config selectivity if no overrides remain
          if (Object.keys(safeGet(state.perWallOverrides, parentIdx)).length === 0) {
            Reflect.deleteProperty(state.perWallOverrides, parentIdx);
            if (state.wallConfigNames) {
              Reflect.deleteProperty(state.wallConfigNames, parentIdx);
            }
            const cs = getEl('configSelect');
            if (cs) {
              cs.value = state.configName || 'us_default';
            }
          }
        }

        // Reload values from the base configuration
        await restoreWallConfig(wallIdx);
        updateSelectedElementInfo();
      });
    }

    attachSelectionActionsListeners(el);
    return;
  }

  el.innerHTML = '<p class="muted">Click a wall or member in Plan or Elevation view to view properties</p>';
}

// %%% Project Management & Versioning Dashboard %%%%%%%%%%%%%%%%%%%%%%%

let isSeeding = false;
let isDashboardInitialized = false;
let currentProjectsRenderId = 0;
let currentExchangeRenderId = 0;

// ─── Seeding Initial Database ─────────────────────────────────────────
async function seedInitialDatabase() {
  const user = window.currentUser || (typeof authModule !== 'undefined' ? authModule.getCurrentUser() : null);
  if (!user) return;

  const seedKey = `lgsf_seeded_${user.uid}`;
  if (localStorage.getItem(seedKey) === 'true' || isSeeding) {
    return;
  }
  isSeeding = true;

  try {
    const projects = await projectsDB.getProjects();
    if (projects.length > 0) {
      localStorage.setItem(seedKey, 'true');
      return;
    }

    // Set the flag immediately to prevent concurrent triggers from duplicate seed calls
    localStorage.setItem(seedKey, 'true');

    const projId = await projectsDB.addProject({
      name: "Project-X",
      description: "Default seeded workspace project.",
      createdAt: new Date().toISOString(),
      createdBy: "Dexter Lab"
    });

    const optId = await projectsDB.addExchangeOption({
      projectId: projId,
      name: "My first Project",
      createdAt: new Date().toISOString(),
      createdBy: "Dexter Lab",
      activeVersionId: null
    });

    // Load payload from My Test Project.wex using the backend endpoint we added
    try {
      const payload = await api.get('/api/walls/wex/My%20Test%20Project');
      const vId = await projectsDB.addVersion({
        exchangeOptionId: optId,
        name: "Version 1 - My Test Project.wex",
        uploadedAt: new Date().toISOString(),
        uploadedBy: "Dexter Lab",
        payload: payload
      });
      await projectsDB.updateExchangeOption({
        id: optId,
        projectId: projId,
        name: "My first Project",
        createdAt: new Date().toISOString(),
        createdBy: "Dexter Lab",
        activeVersionId: vId
      });
    } catch (e) {
      console.error("Failed to seed My Test Project.wex", e);
    }
  } catch (err) {
    console.error("Failed to seed initial database:", err);
  } finally {
    isSeeding = false;
  }
}

// ─── Linked Hub Cache Helpers ─────────────────────────────────────────
function getLinkedHubs() {
  try {
    const raw = localStorage.getItem('lgsf_linked_hubs');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveLinkedHubs(hubs) {
  localStorage.setItem('lgsf_linked_hubs', JSON.stringify(hubs));
}

// ─── Company Hub & Collaboration Management ───────────────────────────
function initCompanySettings() {
  const modal = getEl('companySettingsModal');
  const btnOpen = getEl('btnOpenCompanySettings');
  const btnClose = getEl('btnCloseCompanySettingsModal');
  const btnCloseConfirm = getEl('btnConfirmCloseHubSettings');
  
  if (!btnOpen) return;

  btnOpen.addEventListener('click', async (e) => {
    e.stopPropagation();
    modal.classList.remove('hidden');
    await refreshCompanySettings();
  });

  const closeModal = () => modal.classList.add('hidden');
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCloseConfirm) btnCloseConfirm.addEventListener('click', closeModal);

  // Link Company Hub handler
  getEl('btnHubLinkCompany')?.addEventListener('click', () => {
    const domainInput = getEl('hubLinkDomainInput');
    const domain = domainInput.value.trim().toLowerCase();
    if (!domain) {
      showToast("Please enter a domain name.");
      return;
    }
    const myCompanyId = window.currentCompanyId || 'demo_company';
    if (domain === myCompanyId) {
      showToast("You cannot link your own company hub.");
      return;
    }

    const linked = getLinkedHubs();
    if (!linked.includes(domain)) {
      linked.push(domain);
      saveLinkedHubs(linked);
      domainInput.value = '';
      refreshCompanySettings();
      renderProjectsList();
      showToast(`Linked Company Hub: ${domain}`);
    } else {
      showToast("This hub is already linked.");
    }
  });

  // Add Domain Sharing handler
  getEl('btnHubAddDomain')?.addEventListener('click', async () => {
    const domainInput = getEl('hubNewDomainInput');
    const accessSelect = getEl('hubNewDomainAccess');
    const domain = domainInput.value.trim().toLowerCase();
    const access = accessSelect.value;

    if (!domain) {
      showToast("Please enter a domain name.");
      return;
    }

    try {
      let token = await window.currentUser.getIdToken();
      const res = await fetch('/api/companies/my-company/allowed-domains', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ domain: domain, access_level: access })
      });

      if (res.ok) {
        showToast(`Successfully shared with domain ${domain} (${access})`);
        domainInput.value = '';
        await refreshCompanySettings();
      } else {
        const errData = await res.json();
        showToast("Failed to share: " + (errData.detail || res.statusText));
      }
    } catch (err) {
      showToast("Error adding sharing permission: " + err.message);
    }
  });
}

async function refreshCompanySettings() {
  const myCompanyId = window.currentCompanyId || 'demo_company';
  const idEl = getEl('hubInfoId');
  if (idEl) idEl.textContent = myCompanyId;

  // Render linked hubs list
  const linkedList = getEl('hubLinkedCompaniesList');
  if (linkedList) {
    linkedList.innerHTML = '';
    const linked = getLinkedHubs();

    if (linked.length === 0) {
      linkedList.innerHTML = `<div class="muted" style="padding:12px; font-size:11px; text-align:center;">No external hubs linked.</div>`;
    } else {
      linked.forEach(domain => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px 12px';
        row.style.borderBottom = '1px solid var(--border-color)';
        row.innerHTML = `
          <span style="font-family:var(--font-mono); font-size:12px; color:var(--text-primary);">${escapeHtml(domain)}</span>
          <button class="btn btn-icon-sm" style="color:#f56565; cursor:pointer;" title="Unlink Hub">✕</button>
        `;
        row.querySelector('button').addEventListener('click', () => {
          const updated = linked.filter(d => d !== domain);
          saveLinkedHubs(updated);
          refreshCompanySettings();
          renderProjectsList();
          showToast(`Unlinked Hub: ${domain}`);
        });
        linkedList.appendChild(row);
      });
    }
  }

  // Fetch my company info from API
  try {
    let token = await window.currentUser.getIdToken();
    const res = await fetch('/api/companies/my-company', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const ownerEl = getEl('hubInfoOwner');
    const roleEl = getEl('hubInfoRole');
    const allowedList = getEl('hubAllowedDomainsList');

    if (res.ok) {
      const data = await res.json();
      if (ownerEl) ownerEl.textContent = data.owner_uid || 'unknown';
      if (roleEl) {
        roleEl.textContent = data.is_owner ? 'Owner' : 'Member';
        roleEl.style.color = data.is_owner ? '#48bb78' : '#eab308';
      }

      const allowedRead = data.allowed_read_domains || [];
      const allowedWrite = data.allowed_write_domains || [];
      const totalAllowed = [
        ...allowedRead.map(d => ({ domain: d, access: 'Read-Only', rawAccess: 'read' })),
        ...allowedWrite.map(d => ({ domain: d, access: 'Read-Write', rawAccess: 'write' }))
      ];

      // Hide or show controls based on owner status
      const sharingForm = getEl('hubAddSharingForm');
      const sharingNotice = getEl('hubSharingNotice');
      if (sharingForm) sharingForm.style.display = data.is_owner ? 'flex' : 'none';
      if (sharingNotice) sharingNotice.style.display = data.is_owner ? 'none' : 'block';

      if (allowedList) {
        allowedList.innerHTML = '';
        if (totalAllowed.length === 0) {
          allowedList.innerHTML = `<div class="muted" style="padding:12px; font-size:11px; text-align:center;">No sharing permissions configured.</div>`;
        } else {
          totalAllowed.forEach(item => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.padding = '8px 12px';
            row.style.borderBottom = '1px solid var(--border-color)';
            row.innerHTML = `
              <span style="flex: 2; font-family:var(--font-mono); font-size:12px; color:var(--text-primary); text-align:left;">${escapeHtml(item.domain)}</span>
              <span style="flex: 1.5; font-size:11px; color:var(--text-secondary); text-align:left;">${escapeHtml(item.access)}</span>
              <span style="width:60px; display:flex; justify-content:center;">
                ${data.is_owner ? '<button class="btn btn-icon-sm" style="color:#f56565; cursor:pointer;" title="Remove Access">✕</button>' : '-'}
              </span>
            `;
            if (data.is_owner) {
              row.querySelector('button').addEventListener('click', async () => {
                if (await showConfirm(`Remove access for domain ${item.domain}?`)) {
                  try {
                    const delRes = await fetch(`/api/companies/my-company/allowed-domains?domain=${item.domain}&access_level=${item.rawAccess}`, {
                      method: 'DELETE',
                      headers: { 'Authorization': `Bearer ${token}` }
                    });
                    if (delRes.ok) {
                      showToast(`Access removed for ${item.domain}`);
                      await refreshCompanySettings();
                    } else {
                      const errData = await delRes.json();
                      showToast("Failed to remove: " + (errData.detail || delRes.statusText));
                    }
                  } catch (err) {
                    showToast("Error removing domain: " + err.message);
                  }
                }
              });
            }
            allowedList.appendChild(row);
          });
        }
      }
    } else {
      console.warn("Failed to fetch my company info:", res.statusText);
      if (ownerEl) ownerEl.textContent = 'N/A (Bypassed / Offline)';
      if (roleEl) roleEl.textContent = 'N/A';
      if (allowedList) allowedList.innerHTML = `<div class="muted" style="padding:12px; font-size:11px; text-align:center;">Unavailable offline.</div>`;
      const sharingForm = getEl('hubAddSharingForm');
      const sharingNotice = getEl('hubSharingNotice');
      if (sharingForm) sharingForm.style.display = 'none';
      if (sharingNotice) sharingNotice.style.display = 'block';
    }
  } catch (err) {
    console.error("Error refreshing company settings:", err);
  }
}

// ─── Dashboard Navigation and Render Logic ────────────────────────────
let tempExchangePayload = null;
let tempExchangeFileName = "";

function initDashboard() {
  if (isDashboardInitialized) return;
  isDashboardInitialized = true;

  // Dashboard theme toggle
  getEl('btnThemeDashboard')?.addEventListener('click', toggleTheme);

  // Initialize Company Settings
  initCompanySettings();

  // Navigation rail home click
  getEl('railBtnHome').addEventListener('click', (e) => {
    e.stopPropagation();
    state.activePanel = null;
    updateSidebarLayout();
    showDashboard('projects');
  });

  // Breadcrumbs Projects link
  getEl('breadcrumb-projects-btn').addEventListener('click', () => {
    showDashboard('projects');
  });

  // Pin settings panel
  getEl('btnPinSettings').addEventListener('click', (e) => {
    e.stopPropagation();
    cancelCloseTimeout();
    if (state.pinnedPanel === 'settings') {
      state.pinnedPanel = null;
    } else {
      state.pinnedPanel = 'settings';
    }
    updateSidebarLayout();
  });

  // Settings tab click
  getEl('railBtnSettings').addEventListener('click', (e) => {
    e.stopPropagation();
    cancelCloseTimeout();
    if (state.activePanel === 'settings') {
      if (state.pinnedPanel === 'settings') {
        // Keep open
      } else {
        state.activePanel = null;
      }
    } else {
      state.activePanel = 'settings';
    }
    updateSidebarLayout();
    if (state.activePanel === 'settings') {
      renderSettingsPanel();
    }
  });

  // Back to projects grid
  getEl('btnBackToProjectsGrid').addEventListener('click', () => {
    showDashboard('projects');
  });

  // Create Project Modal controls
  getEl('btnOpenCreateProjectModal').addEventListener('click', () => {
    getEl('newProjectNameInput').value = '';
    getEl('newProjectDescInput').value = '';
    getEl('createProjectModal').classList.remove('hidden');
  });

  const closeProjModal = () => getEl('createProjectModal').classList.add('hidden');
  getEl('btnCloseCreateProjectModal').addEventListener('click', closeProjModal);
  getEl('btnCancelCreateProject').addEventListener('click', closeProjModal);

  getEl('btnConfirmCreateProject').addEventListener('click', async () => {
    const name = getEl('newProjectNameInput').value.trim();
    const desc = getEl('newProjectDescInput').value.trim() || "No description provided.";
    if (!name) {
      showToast("Please enter a project name.");
      return;
    }

    try {
      const targetCid = state.currentProjectCompanyId || window.currentCompanyId;
      await projectsDB.addProject({
        name: name,
        description: desc,
        createdAt: new Date().toISOString(),
        createdBy: getCurrentUserName()
      }, targetCid);
      closeProjModal();
      renderProjectsList();
    } catch (err) {
      showToast("Failed to create project: " + err.message);
    }
  });

  // Create Exchange Option Modal controls
  getEl('btnOpenCreateExchangeModal').addEventListener('click', () => {
    getEl('newExchangeNameInput').value = '';
    getEl('newExchangeFileInput').value = '';
    getEl('exchangeFileNameDisplay').style.display = 'none';
    getEl('exchangeFileNameDisplay').innerText = '';
    tempExchangePayload = null;
    tempExchangeFileName = "";
    getEl('createExchangeModal').classList.remove('hidden');
  });

  const closeExchModal = () => getEl('createExchangeModal').classList.add('hidden');
  getEl('btnCloseCreateExchangeModal').addEventListener('click', closeExchModal);
  getEl('btnCancelCreateExchange').addEventListener('click', closeExchModal);

  // DropZone Click & Drag handlers
  const dropZone = getEl('exchangeDropZone');
  const fileInput = getEl('newExchangeFileInput');

  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--accent)';
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'var(--border-color)';
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border-color)';
    if (e.dataTransfer.files.length > 0) {
      handleExchangeFileSelection(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleExchangeFileSelection(e.target.files[0]);
    }
  });

  getEl('btnConfirmCreateExchange').addEventListener('click', async () => {
    const name = getEl('newExchangeNameInput').value.trim();
    if (!name) {
      showToast("Please enter an exchange option name.");
      return;
    }
    if (!tempExchangePayload) {
      showToast("Please upload a valid Revit Model (.wex) file first.");
      return;
    }

    try {
      // 1. Create Exchange Option
      const exchangeId = await projectsDB.addExchangeOption({
        projectId: state.currentProjectId,
        name: name,
        createdAt: new Date().toISOString(),
        createdBy: getCurrentUserName(),
        activeVersionId: null
      }, state.currentProjectCompanyId);

      // 2. Create Initial Version
      const versionId = await projectsDB.addVersion({
        exchangeOptionId: exchangeId,
        name: `Version 1 - ${tempExchangeFileName}`,
        uploadedAt: new Date().toISOString(),
        uploadedBy: getCurrentUserName(),
        payload: tempExchangePayload
      }, state.currentProjectCompanyId);

      // 3. Link version to exchange option
      await projectsDB.updateExchangeOption({
        id: exchangeId,
        projectId: state.currentProjectId,
        name: name,
        createdAt: new Date().toISOString(),
        createdBy: getCurrentUserName(),
        activeVersionId: versionId
      }, state.currentProjectCompanyId);

      closeExchModal();

      // 4. Load in workspace
      await loadExchangeOption(exchangeId);
    } catch (err) {
      showToast("Failed to create exchange option: " + err.message);
    }
  });

  // Settings update JSON version
  getEl('btnUpdateExchangeJson').addEventListener('click', () => {
    if (state.isReadOnly) {
      showToast("Cannot upload new versions in Read-Only mode.");
      return;
    }
    getEl('updateExchangeJsonInput').click();
  });

  getEl('updateExchangeJsonInput').addEventListener('change', async (e) => {
    if (e.target.files.length === 0) return;
    const file = e.target.files[0];
    const isWex = file.name.endsWith('.wex');

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (typeof window.showLoading === 'function') {
        window.showLoading("Uploading new version...");
      }
      try {
        let payload;
        if (isWex) {
          const base64Data = event.target.result.split(',')[1];
          payload = await api.post('/api/wex/parse', { data: base64Data });
        } else {
          payload = JSON.parse(event.target.result);
        }

        if (!payload.walls && !payload.Walls) {
          showToast("Invalid file format. Missing 'walls' or 'Walls' list.");
          return;
        }

        // Get versions to compute next version number and fetch exchange option in parallel
        const [versions, opt] = await Promise.all([
          projectsDB.getVersions(state.currentExchangeId, state.currentProjectCompanyId),
          projectsDB.getExchangeOption(state.currentExchangeId, state.currentProjectCompanyId)
        ]);
        const nextVerNum = versions.length + 1;

        // Save new version
        const newVerId = await projectsDB.addVersion({
          exchangeOptionId: state.currentExchangeId,
          name: `Version ${nextVerNum} - ${file.name}`,
          uploadedAt: new Date().toISOString(),
          uploadedBy: getCurrentUserName(),
          payload: payload
        }, state.currentProjectCompanyId);

        // Update active version
        if (opt) {
          opt.activeVersionId = newVerId;
          await projectsDB.updateExchangeOption(opt, state.currentProjectCompanyId);
        }

        // Load into workspace
        await loadWallData(payload, opt.name);

        // Refresh settings panel
        renderSettingsPanel();
        await updateTopBarVersionSelector();
        showToast("New model version uploaded successfully!");
      } catch (err) {
        showToast("Error parsing file: " + err.message);
      } finally {
        if (typeof window.hideLoading === 'function') {
          window.hideLoading();
        }
        getEl('updateExchangeJsonInput').value = '';
      }
    };
    if (isWex) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }
  });
}

function handleExchangeFileSelection(file) {
  const isWex = file.name.endsWith('.wex');
  if (!isWex && !file.name.endsWith('.json')) {
    showToast("Please select a valid .wex or .json file.");
    return;
  }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      let payload;
      if (isWex) {
        const base64Data = e.target.result.split(',')[1];
        payload = await api.post('/api/wex/parse', { data: base64Data });
      } else {
        payload = JSON.parse(e.target.result);
      }

      if (!payload.walls && !payload.Walls) {
        showToast("Invalid file format. Missing 'walls' or 'Walls' list.");
        return;
      }
      tempExchangePayload = payload;
      tempExchangeFileName = file.name;

      const display = getEl('exchangeFileNameDisplay');
      display.innerText = `Selected: ${file.name}`;
      display.style.display = 'block';

      // Auto fill option name if empty
      const nameInput = getEl('newExchangeNameInput');
      if (nameInput.value.trim() === "") {
        nameInput.value = file.name.replace('.json', '').replace('.wex', '');
      }
    } catch (err) {
      showToast("Error parsing file: " + err.message);
    }
  };
  if (isWex) {
    reader.readAsDataURL(file);
  } else {
    reader.readAsText(file);
  }
}

function saveNavigationState(viewType) {
  try {
    const navState = {
      viewType: viewType,
      currentProjectId: state.currentProjectId || null,
      currentProjectCompanyId: state.currentProjectCompanyId || null,
      currentExchangeId: state.currentExchangeId || null,
      activeExchangeName: state.activeExchangeName || null,
      activeProjectName: state.activeProjectName || null
    };
    localStorage.setItem('lgsf_navigation_state', JSON.stringify(navState));
  } catch (err) {
    console.warn('[app] Failed to save navigation state:', err);
  }
}

async function showDashboard(viewType) {
  const db = getEl('project-dashboard');
  if (!db) return;

  if (viewType === 'hide') {
    db.classList.add('hidden');
    // Reactivate standard rail items
    getEl('railBtnHome').classList.remove('active');
    getEl('railBtnProperties').classList.add('active');
    state.activePanel = 'properties';
    updateSidebarLayout();
    saveNavigationState('hide');
    return;
  }

  // Release lock when showing dashboard (navigating away from active option) in the background (non-blocking)
  releaseActiveLock().catch(err => console.error("[Lock] Release active lock failed:", err));
  state.currentExchangeId = null;

  db.classList.remove('hidden');
  getEl('railBtnHome').classList.add('active');
  getEl('railBtnProperties').classList.remove('active');
  getEl('railBtnBrowser').classList.remove('active');
  getEl('railBtnSettings').classList.remove('active');

  const projectsView = getEl('db-projects-view');
  const exchangeView = getEl('db-exchange-view');
  const divider = getEl('db-breadcrumb-divider');
  const breadcrumbProjectName = getEl('breadcrumb-project-name');

  if (viewType === 'projects') {
    projectsView.classList.remove('hidden');
    exchangeView.classList.add('hidden');
    divider.classList.add('hidden');
    breadcrumbProjectName.classList.add('hidden');
    state.currentProjectId = null;
    saveNavigationState('projects');
    pushNavigation('projects');
    await renderProjectsList();
  } else if (viewType === 'exchanges') {
    projectsView.classList.add('hidden');
    exchangeView.classList.remove('hidden');
    divider.classList.remove('hidden');
    breadcrumbProjectName.classList.remove('hidden');
    saveNavigationState('exchanges');
    pushNavigation('exchanges');
    await renderExchangeOptionsList();
  }
}

async function renderProjectsList() {
  const container = getEl('db-projects-grid');
  if (!container) return;

  const renderId = ++currentProjectsRenderId;
  container.innerHTML = '';

  const myCompanyId = window.currentCompanyId || 'demo_company';
  const linkedHubs = getLinkedHubs().filter(h => h && h !== myCompanyId);
  const allHubs = [myCompanyId, ...linkedHubs];

  // We will build sections for each hub
  for (const hubId of allHubs) {
    const section = document.createElement('div');
    section.className = 'db-hub-section';
    section.style.display = 'flex';
    section.style.flexDirection = 'column';
    section.style.gap = '12px';

    const isMine = hubId === myCompanyId;
    
    // Header for the hub group
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.borderBottom = '1px solid var(--border-color)';
    header.style.paddingBottom = '8px';
    header.style.marginTop = isMine ? '0px' : '16px';

    header.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size: 16px; font-weight: 700; color: var(--text-primary); text-align: left;">
          Hub: <span style="color:var(--accent); font-family:var(--font-mono);">${escapeHtml(hubId)}</span>
          ${isMine ? ' <span style="font-size:11px; padding:2px 6px; background:rgba(72,187,120,0.15); color:#48bb78; border-radius:10px; font-weight:600; margin-left:6px;">Your Company</span>' : ' <span style="font-size:11px; padding:2px 6px; background:rgba(235,104,76,0.15); color:var(--accent); border-radius:10px; font-weight:600; margin-left:6px;">Linked Hub</span>'}
        </span>
      </div>
    `;

    const grid = document.createElement('div');
    grid.className = 'db-card-grid';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
    grid.style.gap = '16px';

    // Fetch projects for this hub
    let projects = [];
    try {
      projects = await projectsDB.getProjects(hubId);
      if (renderId !== currentProjectsRenderId) return;
    } catch (err) {
      if (renderId !== currentProjectsRenderId) return;
      console.warn(`[app] Failed to load projects for hub ${hubId}:`, err.message);
      grid.innerHTML = `<div class="muted" style="padding:12px; font-size:12px; grid-column: 1/-1; text-align: left;">Failed to load projects from this hub. Check sharing permissions.</div>`;
      section.appendChild(header);
      section.appendChild(grid);
      container.appendChild(section);
      continue;
    }

    if (projects.length === 0) {
      grid.innerHTML = `<div class="muted" style="padding:24px; text-align:center; font-size:12px; grid-column: 1/-1;">No projects in this hub.</div>`;
    } else {
      // Fetch all exchange options for this hub in parallel
      const optionsPromises = projects.map(p => projectsDB.getExchangeOptions(p.id, hubId));
      const optionsList = await Promise.all(optionsPromises);
      if (renderId !== currentProjectsRenderId) return;

      projects.forEach((p, idx) => {
        const card = document.createElement('div');
        card.className = 'db-card';
        card.style.position = 'relative';

        const options = optionsList[idx];
        const dateStr = new Date(p.createdAt).toLocaleDateString(undefined, {
          year: 'numeric', month: 'short', day: 'numeric'
        });

        card.innerHTML = 
          '<h3>' + escapeHtml(p.name) + '</h3>' +
          '<p>' + escapeHtml(p.description) + '</p>' +
          '<button class="db-card-delete-btn" title="Delete Project">✕</button>' +
          '<div class="db-card-meta">' +
            '<span class="db-card-badge">' + options.length + ' Exchange Options</span>' +
            '<div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px; font-size:12px; color:var(--text-secondary);">' +
              '<span>Created: ' + escapeHtml(dateStr) + '</span>' +
              '<span>By: ' + escapeHtml(p.createdBy || 'Demo User') + '</span>' +
            '</div>' +
          '</div>';

        // Click project to drill down
        card.addEventListener('click', async (e) => {
          if (e.target.classList.contains('db-card-delete-btn')) {
            e.stopPropagation();
            if (await showConfirm(`Are you sure you want to delete project "${p.name}"? This will delete all its exchange options and version history.`)) {
              try {
                await projectsDB.deleteProject(p.id, hubId);
                renderProjectsList();
              } catch (delErr) {
                showToast("Failed to delete project: " + delErr.message);
              }
            }
            return;
          }
          if (typeof window.showLoading === 'function') {
            window.showLoading("Loading project exchange options...");
          }
          try {
            state.currentProjectId = p.id;
            state.currentProjectCompanyId = hubId; // <-- Store the active project's company hub!
            state.activeProjectName = p.name;
            getEl('breadcrumb-project-name').innerText = p.name;
            await showDashboard('exchanges');
          } catch (err) {
            console.error("Failed to open project", err);
          } finally {
            if (typeof window.hideLoading === 'function') {
              window.hideLoading();
            }
          }
        });

        grid.appendChild(card);
      });
    }

    section.appendChild(header);
    section.appendChild(grid);
    container.appendChild(section);
  }
}

async function renderExchangeOptionsList() {
  const grid = getEl('db-exchange-grid');
  if (!grid) return;

  const renderId = ++currentExchangeRenderId;
  grid.innerHTML = '';
  if (!state.currentProjectId) return;

  // Set Project details
  const projects = await projectsDB.getProjects(state.currentProjectCompanyId);
  if (renderId !== currentExchangeRenderId) return;
  const proj = projects.find(p => p.id === state.currentProjectId);
  if (proj) {
    getEl('db-current-project-title').innerText = proj.name;
    getEl('db-current-project-desc').innerText = proj.description;
  }

  const options = await projectsDB.getExchangeOptions(state.currentProjectId, state.currentProjectCompanyId);
  if (renderId !== currentExchangeRenderId) return;

  if (options.length === 0) {
    grid.innerHTML = `<div class="muted" style="grid-column: 1/-1; text-align: center; padding: 48px;">No exchange options created yet. Click "+ Create Exchange Option" to upload framing JSON layouts.</div>`;
    return;
  }

  // Fetch all versions in parallel to avoid sequential network round-trips
  const versionsPromises = options.map(o => projectsDB.getVersions(o.id, state.currentProjectCompanyId));
  const versionsList = await Promise.all(versionsPromises);
  if (renderId !== currentExchangeRenderId) return;

  options.forEach((o, idx) => {
    const card = document.createElement('div');
    card.className = 'db-card';

    const versions = versionsList[idx];
    const dateStr = new Date(o.createdAt).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric'
    });

    let lastUpdatedBy = o.createdBy || 'Demo User';
    if (versions.length > 0) {
      const activeVer = versions.find(v => v.id === o.activeVersionId) || safeGet(versions, versions.length - 1);
      if (activeVer && activeVer.uploadedBy) {
        lastUpdatedBy = activeVer.uploadedBy;
      }
    }

    card.innerHTML = 
      '<h3>' + escapeHtml(o.name) + '</h3>' +
      '<p style="color: var(--text-secondary); font-size: 12px; margin-bottom: 2px;">Active Version: ' + (versions.length > 0 ? ('v' + versions.length) : 'None') + '</p>' +
      '<p style="color: var(--text-secondary); font-size: 12px; margin-bottom: 2px;">Created by: ' + escapeHtml(o.createdBy || 'Demo User') + '</p>' +
      '<button class="db-card-delete-btn" title="Delete Exchange Option">✕</button>' +
      '<div class="db-card-meta">' +
        '<span class="db-card-badge">' + versions.length + ' Version' + (versions.length === 1 ? '' : 's') + '</span>' +
        '<div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px; font-size:12px; color:var(--text-secondary);">' +
          '<span>Created: ' + escapeHtml(dateStr) + '</span>' +
          '<span>Last updated by: ' + escapeHtml(lastUpdatedBy) + '</span>' +
        '</div>' +
      '</div>';

    // Click card to load exchange option
    card.addEventListener('click', async (e) => {
      if (e.target.classList.contains('db-card-delete-btn')) {
        e.stopPropagation();

        // Check if exchange option is locked by another user
        try {
          const freshOpt = await projectsDB.getExchangeOption(o.id, state.currentProjectCompanyId);
          if (freshOpt) {
            const now = new Date();
            const lockedAt = freshOpt.lockedAt ? new Date(freshOpt.lockedAt) : null;
            const isLockActive = freshOpt.lockedBy && lockedAt && (now - lockedAt < 60000);
            if (isLockActive && freshOpt.lockedBy !== (window.currentUser?.uid || '')) {
              showToast(`Cannot delete: Another user (${freshOpt.lockedByName || 'someone else'}) is working on this option.`);
              return;
            }
          }
        } catch (err) {
          console.error("Lock check before delete failed:", err);
        }

        if (await showConfirm(`Are you sure you want to delete exchange option "${o.name}"? This will delete all its version data.`)) {
          await projectsDB.deleteExchangeOption(o.id, state.currentProjectCompanyId);
          renderExchangeOptionsList();
        }
        return;
      }
      await loadExchangeOption(o.id);
    });

    grid.appendChild(card);
  });
}

async function loadExchangeOption(exchangeId) {
  if (typeof window.showLoading === 'function') {
    window.showLoading("Loading exchange option...");
  }
  try {
    // 1. Release active lock of previous exchange option in the background (non-blocking)
    releaseActiveLock().catch(err => console.error("[Lock] Release active lock failed:", err));

    // 2. Fetch target exchange option metadata first (cache-friendly, resolves instantly)
    const opt = await projectsDB.getExchangeOption(exchangeId, state.currentProjectCompanyId);
    if (!opt) return;

    if (!opt.activeVersionId) {
      showToast("This exchange option has no active version JSON.");
      return;
    }

    // 3. Concurrently check lock status and download larger version/project data in parallel
    const lockPromise = acquireLock(exchangeId);
    const [projects, version] = await Promise.all([
      projectsDB.getProjects(state.currentProjectCompanyId),
      projectsDB.getVersion(opt.activeVersionId, state.currentProjectCompanyId)
    ]);

    const proj = projects.find(p => p.id === opt.projectId) || null;

    if (!version) {
      showToast("Active version JSON payload not found.");
      return;
    }

    // 4. Resolve the lease lock check
    const lockResult = await lockPromise;
    if (!lockResult.success) {
      const viewAnyway = confirm(`This workspace is currently being edited by ${lockResult.option?.lockedByName || "another user"}.\n\nWould you like to view it in Read-Only mode?\n(Click Cancel to return to the dashboard.)`);
      if (!viewAnyway) {
        showDashboard('exchanges');
        return;
      }
    }

    // 5. Register the real-time listener for the lock
    subscribeToExchangeLock(exchangeId);

    // Set state
    state.currentProjectId = opt.projectId;
    state.currentExchangeId = exchangeId;
    state.activeExchangeName = opt.name;
    state.activeProjectName = proj ? proj.name : "None";

    // Save and push history navigation state
    saveNavigationState('hide');
    pushNavigation('hide');

    // Load payload
    await loadWallData(version.payload, opt.name);

    // Refresh Settings panel and top bar version select list
    renderSettingsPanel();
    await updateTopBarVersionSelector();

    // Hide dashboard, show workspace
    showDashboard('hide');
  } catch (err) {
    showToast("Failed to load exchange option: " + err.message);
  } finally {
    if (typeof window.hideLoading === 'function') {
      window.hideLoading();
    }
  }
}

async function renderSettingsPanel() {
  const exchangeNameEl = getEl('settingsActiveExchangeName');
  const projNameEl = getEl('settingsActiveProjectName');
  const listContainer = getEl('settingsVersionList');
  const select = getEl('settingsExchangeOptionSelect');

  if (!exchangeNameEl || !listContainer) return;

  if (!state.currentExchangeId) {
    exchangeNameEl.innerText = "No active Exchange Option";
    projNameEl.innerText = "Project: None";
    if (select) {
      select.innerHTML = '<option value="">-- No Active Exchange --</option>';
      select.disabled = true;
    }
    listContainer.innerHTML = '<p class="muted" style="padding:12px 16px;">Open a project from the Home dashboard to enable version history controls.</p>';
    getEl('btnUpdateExchangeJson').style.display = 'none';
    return;
  }

  getEl('btnUpdateExchangeJson').style.display = 'inline-block';
  exchangeNameEl.innerText = state.activeExchangeName || "Active Exchange";

  // Populate Exchange Options select dropdown for project context switcher
  if (select && state.currentProjectId) {
    select.disabled = false;
    select.innerHTML = '';
    try {
      const options = await projectsDB.getExchangeOptions(state.currentProjectId, state.currentProjectCompanyId);
      options.forEach(o => {
        const optEl = document.createElement('option');
        optEl.value = o.id;
        optEl.textContent = o.name;
        select.appendChild(optEl);
      });
      select.value = state.currentExchangeId;

      if (!select.dataset.bound) {
        select.dataset.bound = "true";
        select.addEventListener('change', async () => {
          const val = select.value;
          if (val && val !== state.currentExchangeId) {
            await loadExchangeOption(val);
          }
        });
      }
    } catch (err) {
      console.error("Failed to populate settings exchange switcher", err);
    }
  }

  try {
    // Fetch versions and active exchange option details in parallel
    const [versions, opt] = await Promise.all([
      projectsDB.getVersions(state.currentExchangeId, state.currentProjectCompanyId),
      projectsDB.getExchangeOption(state.currentExchangeId, state.currentProjectCompanyId)
    ]);

    let lastUpdatedBy = opt ? (opt.createdBy || '') : '';
    if (opt && opt.activeVersionId) {
      const activeVer = versions.find(v => v.id === opt.activeVersionId);
      if (activeVer && activeVer.uploadedBy) {
        lastUpdatedBy = activeVer.uploadedBy;
      }
    }

    projNameEl.innerHTML = 
      'Project: ' + escapeHtml(state.activeProjectName || "None") + '<br>' +
      'Last updated by: <strong>' + escapeHtml(lastUpdatedBy) + '</strong>';

    listContainer.innerHTML = '';

    if (versions.length === 0) {
      listContainer.innerHTML = '<p class="muted" style="padding:12px 16px;">No versions available.</p>';
      return;
    }

    // Render versions (newest first)
    const sorted = [...versions].reverse();
    sorted.forEach((v) => {
      const item = document.createElement('div');
      const isActive = opt && opt.activeVersionId === v.id;
      item.className = `version-item ${isActive ? 'active' : ''}`;

      const dateStr = new Date(v.uploadedAt).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });

      item.innerHTML = `
        <div class="version-info">
          <span class="version-name">${v.name}</span>
          <span class="version-date">${dateStr} • By: ${v.uploadedBy || 'Demo User'}</span>
        </div>
        ${isActive ? '<span class="version-active-badge">Active</span>' : ''}
        <button class="version-delete-btn" title="Delete Version">✕</button>
      `;

      item.addEventListener('click', async (e) => {
        if (e.target.classList.contains('version-delete-btn') || e.target.parentElement.classList.contains('version-delete-btn')) {
          e.stopPropagation();
          if (state.isReadOnly) {
            showToast("Cannot delete versions in Read-Only mode.");
            return;
          }
          if (isActive) {
            showToast("Cannot delete the active version. Switch to another version first.");
            return;
          }
          if (await showConfirm(`Delete version "${v.name}"?`)) {
            await projectsDB.deleteVersion(v.id, state.currentProjectCompanyId);
            renderSettingsPanel();
            await updateTopBarVersionSelector();
          }
          return;
        }

        if (isActive) return;

        if (state.isReadOnly) {
          showToast("Cannot switch versions in Read-Only mode.");
          return;
        }

        // Switch to this version
        if (typeof window.showLoading === 'function') {
          window.showLoading("Switching version...");
        }
        try {
          opt.activeVersionId = v.id;
          await projectsDB.updateExchangeOption(opt, state.currentProjectCompanyId);
          await loadWallData(v.payload, opt.name);
          renderSettingsPanel();
          await updateTopBarVersionSelector();
          showToast(`Switched to version: ${v.name}`);
        } catch (err) {
          showToast("Failed to load version: " + err.message);
        } finally {
          if (typeof window.hideLoading === 'function') {
            window.hideLoading();
          }
        }
      });

      listContainer.appendChild(item);
    });
  } catch (err) {
    listContainer.innerHTML = '<p style="color:#f56565; padding:12px 16px;">Error: ' + escapeHtml(err.message) + '</p>';
  }
}

async function updateTopBarVersionSelector() {
  const wfs = getEl('wallFile');
  if (!wfs) return;

  const btnSyncModel = getEl('btnSyncModel');
  if (btnSyncModel) {
    btnSyncModel.style.display = state.currentExchangeId ? 'inline-flex' : 'none';
  }

  wfs.innerHTML = '';

  if (!state.currentExchangeId) {
    if (state.wallsData && state.wallsData.length > 0) {
      // Standalone load
      const o = document.createElement('option');
      o.value = 'standalone';
      o.textContent = '📄 Standalone Upload';
      wfs.appendChild(o);
      wfs.value = 'standalone';
      wfs.disabled = false;
    } else {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = '-- No Active Exchange --';
      wfs.appendChild(o);
      wfs.disabled = true;
    }
    return;
  }

  wfs.disabled = false;
  try {
    // Fetch versions and active exchange option details in parallel
    const [versions, opt] = await Promise.all([
      projectsDB.getVersions(state.currentExchangeId, state.currentProjectCompanyId),
      projectsDB.getExchangeOption(state.currentExchangeId, state.currentProjectCompanyId)
    ]);

    versions.forEach((v) => {
      const o = document.createElement('option');
      o.value = v.id;
      const isActive = opt && opt.activeVersionId === v.id;
      o.textContent = `${v.name}${isActive ? ' (Active)' : ''}`;
      wfs.appendChild(o);
      if (isActive) {
        wfs.value = v.id;
      }
    });

  } catch (err) {
    console.error("Failed to populate topbar version selector", err);
  }
}
