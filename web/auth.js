/**
 * auth.js — FrameX Authentication Module
 *
 * Handles Firebase Authentication (sign-in, registration, password reset)
 * and per-company data isolation via Firestore and custom claims.
 *
 * Loaded before app.js so the login overlay is always shown first.
 * Once authenticated, hides the overlay and boots the main app.
 */

// ─── Firebase Configuration ──────────────────────────────────────────────────
// Project: framexdexterlab  |  Firebase JS SDK compat (CDN)
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCNosPOIHXtUzFYuWyYZ6Zu6ozEZyJnQ-0",
  authDomain:        "framexdexterlab.firebaseapp.com",
  projectId:         "framexdexterlab",
  storageBucket:     "framexdexterlab.firebasestorage.app",
  messagingSenderId: "348095531267",
  appId:             "1:348095531267:web:a12884e4c5b5fcea540136",
  measurementId:     "G-PGG1XXE8YJ"
};

// ─── Global Loading Overlay Helpers ──────────────────────────────────────────
window.showLoading = function(text = "Loading workspace...") {
  const overlay = document.getElementById('loadingOverlay');
  const txt = document.getElementById('loadingText');
  const video = document.getElementById('loadingVideo');
  if (overlay) {
    if (txt) txt.textContent = text;
    overlay.classList.remove('hidden');
    if (video) {
      video.currentTime = 0;
      video.play().catch(err => console.warn("Autoplay was prevented:", err));
    }
  }
};

window.hideLoading = function() {
  const overlay = document.getElementById('loadingOverlay');
  const video = document.getElementById('loadingVideo');
  if (overlay) {
    overlay.classList.add('hidden');
    if (video) {
      video.pause();
    }
  }
};

// ─── Module Namespace ─────────────────────────────────────────────────────────
const authModule = (() => {

  // State
  let firebaseApp = null;
  let auth = null;
  let db = null;
  let currentUser = null;
  let currentCompanyId = null;

  // ─── Initialization ───────────────────────────────────────────────────────
  function init() {
    try {
      firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
      db   = firebase.firestore();
      
      // Enable Firestore offline persistence for faster loading / caching
      db.enablePersistence({ synchronizeTabs: true })
        .catch((err) => {
          console.warn('[auth.js] Firestore persistence failed:', err.code, err.message);
        });
    } catch (e) {
      // Firebase SDK not loaded (no network / localhost dev fallback)
      console.warn('[auth.js] Firebase SDK unavailable — entering demo mode:', e.message);
      _enterDemoMode();
      return;
    }

    // Show login overlay immediately; hide header/main while not authenticated
    _setAppVisible(false);

    // Watch auth state — resolves before any UI interaction
    auth.onAuthStateChanged(async (user) => {
      if (user) {
        await _onSignedIn(user);
      } else {
        _onSignedOut();
      }
    });

    _bindUI();
  }

  // ─── Auth State Handlers ──────────────────────────────────────────────────
  async function _onSignedIn(user) {
    currentUser = user;

    // Sync claims with backend first (especially important for new sign-ups/registrations)
    if (user.uid !== 'demo' && !user.emailVerified) {
      if (typeof window.hideLoading === 'function') {
        window.hideLoading();
      }
      _showPanel('panelVerifyEmail');
      _showLoginOverlay();
      _setAppVisible(false);
      return;
    }
    let token = await user.getIdToken();
    let regCompanyId = localStorage.getItem('registration_companyId');
    if (regCompanyId) {
      localStorage.removeItem('registration_companyId');
    }

    try {
      const res = await fetch('/api/auth/sync-claims', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ companyId: regCompanyId })
      });
      if (res.ok) {
        const syncResult = await res.json();
        if (syncResult.updated) {
          console.log('[auth.js] Claims updated by backend, forcing token refresh...');
          const newIdTokenResult = await user.getIdTokenResult(true);
          currentCompanyId = newIdTokenResult.claims.companyId || syncResult.companyId;
        } else {
          currentCompanyId = syncResult.companyId;
        }
      } else {
        const idTokenResult = await user.getIdTokenResult(true);
        currentCompanyId = idTokenResult.claims.companyId || _sanitizeCompanyFromEmail(user.email);
      }
    } catch (e) {
      console.warn('[auth.js] Failed to sync custom claims with backend:', e.message);
      const idTokenResult = await user.getIdTokenResult(true);
      currentCompanyId = idTokenResult.claims.companyId || _sanitizeCompanyFromEmail(user.email);
    }

    // Update the profile popover in the app header
    _updateProfileUI(user);

    // Optionally re-init cloud-backed project DB
    if (typeof projectsDB !== 'undefined' && typeof projectsDB.setUser === 'function') {
      projectsDB.setUser(user, currentCompanyId, db);
    }

    console.log(`[auth.js] Signed in: ${user.email} (company: ${currentCompanyId})`);

    // Trigger auth-gated app startup (loadConfig, projectsDB, dashboard)
    // app.js exposes this after DOMContentLoaded; safe to call after token is ready
    if (typeof window.onAppUserReady === 'function') {
      if (typeof window.showLoading === 'function') {
        window.showLoading("Initializing workspace...");
      }
      try {
        await window.onAppUserReady();
      } finally {
        if (typeof window.hideLoading === 'function') {
          window.hideLoading();
        }
      }
    }

    // Hide login screen, reveal app (moved after onAppUserReady to prevent flash of workspace)
    _hideLoginOverlay();
    _setAppVisible(true);
  }

  function _onSignedOut() {
    currentUser = null;
    currentCompanyId = null;
    _setAppVisible(false);
    
    // Explicitly hide the projects dashboard on logout
    const dbDashboard = _getEl('project-dashboard');
    if (dbDashboard) dbDashboard.classList.add('hidden');

    // Clear saved navigation state on sign out
    try {
      localStorage.removeItem('lgsf_navigation_state');
    } catch (e) {
      console.warn('[auth.js] Failed to clear navigation state on sign out:', e.message);
    }

    // Reset button states
    _setButtonLoading('btnSignIn', false);
    _setButtonLoading('btnRegister', false);
    _setButtonLoading('btnSendReset', false);

    // Clear login/register input fields
    ['signInEmail', 'signInPassword', 'regName', 'regCompany', 'regEmail', 'regPassword', 'resetEmail'].forEach(id => {
      const el = _getEl(id);
      if (el) el.value = '';
    });

    // Reset password strength indicator
    const pwFill = _getEl('pwStrengthFill');
    if (pwFill) pwFill.style.width = '0%';
    const pwBar = _getEl('pwStrengthBar');
    if (pwBar) pwBar.style.display = 'none';

    _showPanel('panelSignIn');
    _showLoginOverlay();
    if (typeof window.hideLoading === 'function') {
      window.hideLoading();
    }
  }

  // ─── Sign In ──────────────────────────────────────────────────────────────
  async function signIn() {
    const email    = document.getElementById('signInEmail').value.trim();
    const password = document.getElementById('signInPassword').value;

    if (!email || !password) {
      _showError('Please enter your email and password.');
      return;
    }

    _setButtonLoading('btnSignIn', true);
    _hideError();
    if (typeof window.showLoading === 'function') {
      window.showLoading("Signing in...");
    }

    const persistence = document.getElementById('rememberMe').checked
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION;

    try {
      await auth.setPersistence(persistence);
      await auth.signInWithEmailAndPassword(email, password);
      // onAuthStateChanged handles the rest
    } catch (err) {
      _setButtonLoading('btnSignIn', false);
      if (typeof window.hideLoading === 'function') {
        window.hideLoading();
      }
      _showError(_friendlyError(err));
    }
  }

  // ─── Register ─────────────────────────────────────────────────────────────
  async function register() {
    const name     = document.getElementById('regName').value.trim();
    const company  = document.getElementById('regCompany').value.trim();
    const email    = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPassword').value;

    if (!name || !company || !email || !password) {
      _showError('Please fill in all fields.');
      return;
    }
    if (password.length < 8) {
      _showError('Password must be at least 8 characters.');
      return;
    }

    _setButtonLoading('btnRegister', true);
    _hideError();
    if (typeof window.showLoading === 'function') {
      window.showLoading("Creating account...");
    }

    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);

      // Send verification email immediately
      try {
        const actionCodeSettings = {
          url: window.location.origin,
          handleCodeInApp: false
        };
        await cred.user.sendEmailVerification(actionCodeSettings);
      } catch (emailErr) {
        console.warn('[auth.js] Failed to send verification email during registration:', emailErr);
      }

      const companyId = _sanitizeCompanyFromEmail(email);
      localStorage.setItem('registration_companyId', companyId);

      // Update display name
      await cred.user.updateProfile({ displayName: name });

      // Persist company data in Firestore under the users collection.
      // A server-side Cloud Function should react to this write and set
      // the companyId custom claim on the user's token.
      await db.collection('users').doc(cred.user.uid).set({
        displayName: name,
        email:       email,
        company:     company,
        companyId:   companyId,
        createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
        role:        'admin'
      });

      // onAuthStateChanged will fire next
    } catch (err) {
      _setButtonLoading('btnRegister', false);
      if (typeof window.hideLoading === 'function') {
        window.hideLoading();
      }
      _showError(_friendlyError(err));
    }
  }

  // ─── Password Reset ───────────────────────────────────────────────────────
  async function sendPasswordReset() {
    const email = document.getElementById('resetEmail').value.trim();
    if (!email) {
      _showError('Please enter your email address.');
      return;
    }

    _setButtonLoading('btnSendReset', true);
    _hideError();

    try {
      const actionCodeSettings = {
        url: window.location.origin,
        handleCodeInApp: false
      };
      await auth.sendPasswordResetEmail(email, actionCodeSettings);
      _setButtonLoading('btnSendReset', false);
      _showError('✓ Reset link sent! Check your inbox (or Junk Email for Outlook/company mail).', /* isSuccess */ true);
    } catch (err) {
      _setButtonLoading('btnSendReset', false);
      _showError(_friendlyError(err));
    }
  }

  // ─── Sign Out ─────────────────────────────────────────────────────────────
  async function signOut() {
    if (auth) await auth.signOut();
  }

  // ─── Password Strength ───────────────────────────────────────────────────
  function updatePasswordStrength(value) {
    const bar  = document.getElementById('pwStrengthBar');
    const fill = document.getElementById('pwStrengthFill');
    if (!bar || !fill) return;

    bar.style.display = 'block';
    let score = 0;
    if (value.length >= 8)  score++;
    if (/[A-Z]/.test(value)) score++;
    if (/[0-9]/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;

    const pct    = (score / 4) * 100;
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e'];
    fill.style.width           = pct + '%';
    // Use switch instead of bracket array access (avoids user-input bracket notation warning)
    let color;
    switch (score) {
      case 4:  color = '#22c55e'; break; // strong
      case 3:  color = '#eab308'; break; // good
      case 2:  color = '#f97316'; break; // fair
      case 1:  color = '#ef4444'; break; // weak
      default: color = '#ef4444'; break; // empty
    }
    fill.style.backgroundColor = color;
  }

  // ─── Email Verification ───────────────────────────────────────────────────
  async function checkVerificationStatus() {
    if (!auth.currentUser) return;
    _setButtonLoading('btnVerifyChecked', true);
    _hideError();
    try {
      await auth.currentUser.reload();
      const updatedUser = auth.currentUser;
      if (updatedUser.emailVerified) {
        _setButtonLoading('btnVerifyChecked', false);
        // Email is now verified, proceed with normal signed-in startup
        await _onSignedIn(updatedUser);
      } else {
        _setButtonLoading('btnVerifyChecked', false);
        _showError('Your email address has not been verified yet. Please check your inbox and click the verification link.');
      }
    } catch (err) {
      _setButtonLoading('btnVerifyChecked', false);
      _showError(_friendlyError(err));
    }
  }

  async function resendVerificationEmail() {
    if (!auth.currentUser) return;
    _setButtonLoading('btnResendVerification', true);
    _hideError();
    try {
      const actionCodeSettings = {
        url: window.location.origin,
        handleCodeInApp: false
      };
      await auth.currentUser.sendEmailVerification(actionCodeSettings);
      _setButtonLoading('btnResendVerification', false);
      _showError('✓ Verification link sent! Check your inbox or Junk Email folder.', /* isSuccess */ true);
    } catch (err) {
      _setButtonLoading('btnResendVerification', false);
      _showError(_friendlyError(err));
    }
  }

  // ─── UI Bindings ─────────────────────────────────────────────────────────
  function _bindUI() {
    _getEl('btnSignIn')?.addEventListener('click', signIn);
    _getEl('btnRegister')?.addEventListener('click', register);
    _getEl('btnSendReset')?.addEventListener('click', sendPasswordReset);

    // Verify email panel handlers
    _getEl('btnVerifyChecked')?.addEventListener('click', checkVerificationStatus);
    _getEl('btnResendVerification')?.addEventListener('click', resendVerificationEmail);
    _getEl('btnVerifyBackToSignIn')?.addEventListener('click', signOut);

    _getEl('btnGoToRegister')?.addEventListener('click', () => _showPanel('panelRegister'));
    _getEl('btnGoToSignIn')?.addEventListener('click',   () => _showPanel('panelSignIn'));
    _getEl('btnBackToSignIn')?.addEventListener('click', () => _showPanel('panelSignIn'));
    _getEl('btnForgotPassword')?.addEventListener('click', () => _showPanel('panelReset'));

    // Sign-out buttons in profile popover and dashboard header
    _getEl('btnSignOut')?.addEventListener('click', signOut);
    _getEl('btnSignOutDashboard')?.addEventListener('click', signOut);

    // Toggle Dashboard Profile Popover
    const dbUserTrigger = _getEl('dbUserTrigger');
    const dbProfilePopover = _getEl('dbProfilePopover');
    if (dbUserTrigger && dbProfilePopover) {
      dbUserTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dbProfilePopover.classList.toggle('visible');
      });
      dbProfilePopover.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // Click outside to close Dashboard Profile Popover
    document.addEventListener('click', (e) => {
      if (dbProfilePopover && dbProfilePopover.classList.contains('visible') && dbUserTrigger && !dbUserTrigger.contains(e.target)) {
        dbProfilePopover.classList.remove('visible');
      }
    });

    // Edit Profile Modal Logic
    const editModal = _getEl('editProfileModal');
    const nameInput = _getEl('editProfileName');
    const emailInput = _getEl('editProfileEmail');
    const companyInput = _getEl('editProfileCompany');

    const openEditModal = () => {
      if (!currentUser) return;
      nameInput.value = currentUser.displayName || currentUser.email.split('@')[0];
      emailInput.value = currentUser.email || '';
      companyInput.value = currentCompanyId || '';
      editModal.classList.remove('hidden');
      // Close popovers
      _getEl('profilePopover')?.classList.remove('visible');
      dbProfilePopover?.classList.remove('visible');
    };

    _getEl('btnEditProfileWorkspace')?.addEventListener('click', openEditModal);
    _getEl('btnEditProfileDashboard')?.addEventListener('click', openEditModal);

    const closeEditModal = () => editModal.classList.add('hidden');
    _getEl('btnCloseEditProfileModal')?.addEventListener('click', closeEditModal);
    _getEl('btnCancelEditProfile')?.addEventListener('click', closeEditModal);

    _getEl('btnConfirmSaveProfile')?.addEventListener('click', async () => {
      const newName = nameInput.value.trim();
      if (!newName) {
        alert("Name cannot be empty.");
        return;
      }

      const saveBtn = _getEl('btnConfirmSaveProfile');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";
      }

      try {
        // 1. Update Firebase Auth Profile
        await currentUser.updateProfile({ displayName: newName });
        
        // 2. Update Firestore document /users/{uid}
        if (db && currentUser.uid !== 'demo') {
          await db.collection('users').doc(currentUser.uid).set({
            displayName: newName
          }, { merge: true });
        }

        // 3. Update all UI elements
        _updateProfileUI(currentUser);

        closeEditModal();
        
        if (typeof showToast === 'function') {
          showToast("Profile updated successfully!");
        } else {
          alert("Profile updated successfully!");
        }
      } catch (err) {
        alert("Failed to update profile: " + err.message);
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = "Save Changes";
        }
      }
    });

    // Allow Enter key to submit forms
    ['signInEmail', 'signInPassword'].forEach(id => {
      _getEl(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); });
    });
    ['regName', 'regCompany', 'regEmail', 'regPassword'].forEach(id => {
      _getEl(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') register(); });
    });
    _getEl('resetEmail')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') sendPasswordReset();
    });
  }

  // ─── UI Helpers ──────────────────────────────────────────────────────────
  function _showPanel(panelId) {
    ['panelSignIn', 'panelRegister', 'panelReset', 'panelVerifyEmail'].forEach(id => {
      const el = _getEl(id);
      if (el) el.style.display = (id === panelId) ? '' : 'none';
    });
    _hideError();
  }

  function _showError(msg, isSuccess = false) {
    const banner = _getEl('loginErrorBanner');
    const span   = _getEl('loginErrorMsg');
    if (!banner || !span) return;
    span.textContent = msg;
    banner.style.display = 'flex';
    banner.style.background = isSuccess
      ? 'rgba(34, 197, 94, 0.15)'
      : 'rgba(239, 68, 68, 0.15)';
    banner.style.borderColor = isSuccess
      ? 'rgba(34, 197, 94, 0.3)'
      : 'rgba(239, 68, 68, 0.3)';
    banner.style.color = isSuccess ? '#86efac' : '#f87171';
  }

  function _hideError() {
    const banner = _getEl('loginErrorBanner');
    if (banner) banner.style.display = 'none';
  }

  function _setButtonLoading(btnId, loading) {
    const btn = _getEl(btnId);
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      // Store the button's visible label as plain text so we can safely
      // restore it without touching innerHTML (avoids XSS lint warning).
      btn.dataset.origText = btn.textContent.trim();
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 0.8s linear infinite"><path d="M21 12a9 9 0 1 1-6.2-8.56"/></svg> Please wait…';
    } else if (btn.dataset.origText) {
      // Restore via textContent — never assign stored data back to innerHTML
      btn.textContent = btn.dataset.origText;
    }
  }

  function _showLoginOverlay() {
    const el = _getEl('loginScreenOverlay');
    if (!el) return;
    el.style.display    = 'flex';
    el.style.opacity    = '1';
    el.style.visibility = 'visible';
    el.classList.remove('hidden');
  }

  function _hideLoginOverlay() {
    const el = _getEl('loginScreenOverlay');
    if (!el) return;
    el.style.opacity    = '0';
    el.style.visibility = 'hidden';
    el.style.transition = 'opacity 0.6s ease, visibility 0.6s ease';
    setTimeout(() => { el.style.display = 'none'; }, 650);
  }

  function _setAppVisible(visible) {
    const header = document.getElementById('topbar');
    const main   = document.getElementById('app');
    if (header) header.style.visibility = visible ? '' : 'hidden';
    if (main)   main.style.visibility   = visible ? '' : 'hidden';
  }

  function _updateProfileUI(user) {
    // Profile popover: name, email, initials
    const nameEl   = document.querySelector('.profile-name');
    const emailEl  = document.querySelector('.profile-email');
    const avatarEl = document.querySelector('.profile-avatar');

    if (nameEl)   nameEl.textContent  = user.displayName || 'User';
    if (emailEl)  emailEl.textContent = user.email || '';
    if (avatarEl) {
      const parts    = (user.displayName || user.email || 'U').split(' ');
      avatarEl.textContent = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
    }

    // Update dashboard header trigger profile elements
    const dbNameEl = _getEl('dbUserName');
    const dbCompanyEl = _getEl('dbUserCompany');
    const dbAvatarEl = _getEl('dbUserAvatar');

    if (dbNameEl) dbNameEl.textContent = user.displayName || user.email.split('@')[0];
    if (dbCompanyEl) dbCompanyEl.textContent = currentCompanyId || 'Pro-BIM Enterprise';
    if (dbAvatarEl) {
      const parts = (user.displayName || user.email || 'U').split(' ');
      dbAvatarEl.textContent = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
    }

    // Update dashboard popover card profile elements
    const dbPopNameEl = _getEl('dbPopoverName');
    const dbPopEmailEl = _getEl('dbPopoverEmail');
    const dbPopAvatarEl = _getEl('dbPopoverAvatar');

    if (dbPopNameEl) dbPopNameEl.textContent = user.displayName || user.email.split('@')[0];
    if (dbPopEmailEl) dbPopEmailEl.textContent = user.email || '';
    if (dbPopAvatarEl) {
      const parts = (user.displayName || user.email || 'U').split(' ');
      dbPopAvatarEl.textContent = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
    }

    // Expose global convenience accessors for app.js
    window.currentUser      = user;
    window.currentCompanyId = currentCompanyId;
  }

  // ─── Demo / Dev Mode (no Firebase) ───────────────────────────────────────
  function _enterDemoMode() {
    console.warn('[auth.js] Running in DEMO mode — auth is bypassed.');
    _hideLoginOverlay();
    _setAppVisible(true);
    if (typeof window.hideLoading === 'function') {
      window.hideLoading();
    }
    window.currentUser      = { email: 'demo@framex.local', displayName: 'Demo User', uid: 'demo' };
    window.currentCompanyId = 'demo_company';
  }

  // ─── Utilities ────────────────────────────────────────────────────────────
  function _getEl(id) {
    return document.getElementById(id);
  }

  function _sanitizeCompanyFromEmail(email) {
    // Return the full email domain name, e.g. "alice@acme.co" → "acme.co"
    if (!email || !email.includes('@')) return 'unknown';
    return email.split('@')[1].trim().toLowerCase();
  }

  function _friendlyError(err) {
    // Use a Map (not a plain object) so .get() never traverses the prototype
    // chain — eliminates the bracket-notation-with-user-input security warning.
    const errorMap = new Map([
      ['auth/user-not-found',          'No account found with this email.'],
      ['auth/wrong-password',          'Incorrect password. Please try again.'],
      ['auth/invalid-email',           'Please enter a valid email address.'],
      ['auth/email-already-in-use',    'An account with this email already exists.'],
      ['auth/weak-password',           'Password is too weak. Use at least 8 characters.'],
      ['auth/too-many-requests',       'Too many attempts. Please wait a moment and try again.'],
      ['auth/network-request-failed',  'Network error. Please check your connection.'],
      ['auth/invalid-credential',      'Incorrect email or password. Please try again.'],
    ]);

    if (typeof err.code === 'string' && errorMap.has(err.code)) {
      return errorMap.get(err.code);
    }

    // Fall back to err.message — sanitize HTML characters individually
    // using a switch so no bracket notation touches external data.
    const raw = (typeof err.message === 'string') ? err.message : '';
    const sanitized = raw.split('').map(ch => {
      switch (ch) {
        case '<':  return '&lt;';
        case '>':  return '&gt;';
        case '&':  return '&amp;';
        case '"':  return '&quot;';
        case "'":  return '&#39;';
        default:   return ch;
      }
    }).join('');

    return sanitized || 'An unexpected error occurred.';
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    init,
    signIn,
    register,
    signOut,
    sendPasswordReset,
    updatePasswordStrength,
    getCurrentUser:      () => currentUser,
    getCurrentCompanyId: () => currentCompanyId,
    getFirestore:        () => db,
  };

})();

// ─── Inject spin animation ───────────────────────────────────────────────────
(function () {
  if (!document.getElementById('auth-spin-style')) {
    const s = document.createElement('style');
    s.id = 'auth-spin-style';
    s.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(s);
  }
})();

// ─── Auto-initialize ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => authModule.init());
