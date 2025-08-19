// frontend/src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import LifeGrid from './components/LifeGrid';
import './App.css';
import { setLanguage, getCurrentLanguage, setThemePreference, getThemePreference, setAccentPreference, getAccentPreference } from './i18n';

// Utility to detect mobile platforms
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Constants for clarity and easy maintenance
const LIFE_EXPECTANCY = { homme: 80, femme: 85 };
const LOCAL_STORAGE_KEY = 'momentoMoriData';

// ---- Helpers Push/Notifications ----
function base64UrlToUint8Array(base64UrlString) {
  const padding = '='.repeat((4 - (base64UrlString.length % 4)) % 4);
  const base64 = (base64UrlString + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

// Active (ou réutilise) l’abonnement Push et l’envoie au backend
async function activateNotificationsFlow() {
  if (!isSecureContext) throw new Error('HTTPS requis');
  if (typeof Notification === 'undefined') throw new Error('Notifications non supportées');
  if (!('serviceWorker' in navigator)) throw new Error('Service Worker non supporté');

  // 1) Permission : ne pas redemander si déjà décidé
  if (Notification.permission === 'default') {
    const p = await Notification.requestPermission();
    if (p !== 'granted') throw new Error(`Permission = ${p}`);
  } else if (Notification.permission !== 'granted') {
    throw new Error(`Permission = ${Notification.permission}`);
  }

  // 2) Service Worker prêt
  const reg = await navigator.serviceWorker.ready;

  // 3) Récupérer la clé publique depuis le backend
  const r = await fetch('/api/push/public-key', { cache: 'no-store' });
  if (!r.ok) throw new Error('public-key HTTP ' + r.status);
  const { publicKey } = await r.json();
  if (!publicKey) throw new Error('Clé publique VAPID absente');

  // 4) (Ré)abonnement
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
    });
  } else {
    // (facultatif) vérifier les clés, sinon resouscrire
    const hasKeys = !!sub.getKey('p256dh') && !!sub.getKey('auth');
    if (!hasKeys) {
      try { await sub.unsubscribe(); } catch {}
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey),
      });
    }
  }

  // 5) Upsert côté backend (POST absolu)
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription: sub, timezone }),
  });
  if (!res.ok) throw new Error('subscribe HTTP ' + res.status);

  return true;
}

// Réenvoie silencieusement l’abonnement push au backend si présent (après redeploy, retour d’onglet, etc.)
async function resyncPushSubscription() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    // console.log('Resync subscription OK');
  } catch (e) {
    console.warn('Resync subscription failed:', e);
  }
}

function App() {
  const { t } = useTranslation();

  // MODIFIED: Added customLifeExpectancy to the state
  const [formData, setFormData] = useState({
    dob: '',
    gender: 'homme',
    customLifeExpectancy: 80
  });

  const [lifeData, setLifeData] = useState(null);
  const [error, setError] = useState('');
  // Notifications permission state
  const [notifPermission, setNotifPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'default');

  // Helpers
  const getTodayLocalDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // NEW: Create a ref for the date input
  const dateInputRef = useRef(null);
  const customAgeRef = useRef(null);

  // On component mount, try to load saved data and focus the input
  useEffect(() => {
    // Focus the date input field when the form is shown
    if (dateInputRef.current) {
      dateInputRef.current.focus();
    }

    try {
      const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (savedData) {
        const parsedData = JSON.parse(savedData);
        // Basic shape validation
        if (
          parsedData &&
          typeof parsedData === 'object' &&
          typeof parsedData.dob === 'string' &&
          ['homme', 'femme', 'custom'].includes(parsedData.gender)
        ) {
          setFormData({
            dob: parsedData.dob,
            gender: parsedData.gender,
            customLifeExpectancy: Math.max(1, Math.min(120, parseInt(parsedData.customLifeExpectancy, 10) || 80)),
          });
          calculateWeeks(null, {
            dob: parsedData.dob,
            gender: parsedData.gender,
            customLifeExpectancy: Math.max(1, Math.min(120, parseInt(parsedData.customLifeExpectancy, 10) || 80)),
          });
        }
      }
    } catch (e) {
      // Ignore malformed localStorage content
      console.warn('Failed to read saved data:', e);
    }
    // Hardcode theme and accent
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.setAttribute('data-accent', 'teal');

    // Keep notification permission in sync if it changes
    if (typeof Notification !== 'undefined') {
      setNotifPermission(Notification.permission);
    }
  }, []);

  // When switching to custom gender, focus the custom expectancy field
  useEffect(() => {
    if (formData.gender === 'custom') {
      // timeout to ensure the input is rendered
      setTimeout(() => {
        if (customAgeRef.current) customAgeRef.current.focus();
      }, 0);
    }
  }, [formData.gender]);

  // 🔁 Réenvoi automatique: au montage…
  useEffect(() => {
    resyncPushSubscription();
  }, []);

  // …et à chaque retour d’onglet
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        resyncPushSubscription();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const clampInt = (value, min, max) => Math.max(min, Math.min(max, value));

  // Parse a YYYY-MM-DD string as a UTC date (no time component)
  const parseDateFromInput = (value) => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;

    if (type === 'number') {
      const parsed = parseInt(value, 10);
      const safeNumber = Number.isFinite(parsed) ? clampInt(parsed, 1, 120) : '';
      setFormData({ ...formData, [name]: safeNumber });
      return;
    }

    setFormData({ ...formData, [name]: value });
  };

  const calculateWeeks = (e, savedFormData = null) => {
    if (e) e.preventDefault();

    const dataToProcess = savedFormData || formData;

    if (!dataToProcess.dob) {
      setError(t('error.noDob'));
      return;
    }

    const birthDate = parseDateFromInput(dataToProcess.dob);
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));

    if (birthDate > todayUTC) {
      setError(t('error.futureDob'));
      return;
    }

    // Use custom life expectancy if gender is 'custom'
    let lifeExpectancyYears = dataToProcess.gender === 'custom'
      ? (parseInt(dataToProcess.customLifeExpectancy, 10) || 80)
      : LIFE_EXPECTANCY[dataToProcess.gender];

    lifeExpectancyYears = clampInt(lifeExpectancyYears, 1, 120);

    const endDate = new Date(Date.UTC(birthDate.getUTCFullYear() + lifeExpectancyYears, birthDate.getUTCMonth(), birthDate.getUTCDate()));

    const MS_IN_WEEK = 1000 * 60 * 60 * 24 * 7;
    const totalWeeks = Math.floor((endDate - birthDate) / MS_IN_WEEK);
    const pastWeeks = Math.floor((todayUTC - birthDate) / MS_IN_WEEK);

    setError('');
    setLifeData({ totalWeeks, pastWeeks, birthDate });

    if (!savedFormData) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
          dob: dataToProcess.dob,
          gender: dataToProcess.gender,
          customLifeExpectancy: lifeExpectancyYears,
        }));
      } catch (e2) {
        console.warn('Failed to save data:', e2);
      }
    }
  };

  const resetApp = () => {
    setLifeData(null);
    setFormData({ dob: '', gender: 'homme', customLifeExpectancy: 80 });
    setError('');
    localStorage.removeItem(LOCAL_STORAGE_KEY);

    // Re-focus the date input after a reset
    setTimeout(() => {
      if (dateInputRef.current) {
        dateInputRef.current.focus();
      }
    }, 0);
  };

  // ---- Notifications: Handlers UI ----
  const requestNotificationPermission = async () => {
    try {
      await activateNotificationsFlow();
      setNotifPermission('granted');
      // Auto-sync preferences après abonnement
      try { await syncPrefsToBackend(); } catch (_) {}
      alert('Notifications activées ✅');
    } catch (err) {
      console.error('Activation notifications - erreur:', err);
      alert('Impossible d’activer les notifications : ' + (err?.message || err));
    }
  };

  const sendTestNotification = async () => {
    try {
      await fetch('/api/push/test', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      alert('Demande de test envoyée (assure-toi que des abonnements existent).');
    } catch (e) {
      alert('Échec envoi test.');
    }
  }

  // Sync user prefs (dob, gender, expectancy, timezone) with backend, attached to current push subscription
  const syncPrefsToBackend = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        alert('Aucun abonnement push trouvé. Active d\'abord les notifications.');
        return;
      }
      const endpoint = sub.endpoint;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const payload = {
        endpoint,
        dob: formData.dob || null,
        gender: formData.gender || 'homme',
        customLifeExpectancy: formData.customLifeExpectancy || undefined,
        timezone,
      };
      const resp = await fetch('/api/push/prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || 'Erreur sauvegarde préférences');
      }
      alert('Préférences de notification mises à jour.');
    } catch (e) {
      console.error('syncPrefsToBackend error:', e);
      alert('Impossible de synchroniser les préférences.');
    }
  };

  const todayStr = getTodayLocalDateString();

  return (
    <div className="App">
      <header>
        <div className="header-text">
          <h1>{t('title')}</h1>
          <p className="subtitle">{t('subtitle')}</p>
        </div>
        <div className="toolbar">
          {/* Language and accent controls, and theme toggle removed */}
        </div>
      </header>

      <main>
        {!lifeData ? (
          <form onSubmit={calculateWeeks} className="input-form">
            <div className="form-group">
              <label htmlFor="dob">{t('form.dobLabel')}</label>
              {isMobile ? (
                <div className="dob-segmented">
                  <input
                    type="tel"
                    inputMode="numeric"
                    name="dob-day"
                    placeholder="JJ"
                    value={formData.dob ? formData.dob.split('-')[2] : ''}
                    onChange={(e) => {
                      const day = e.target.value.replace(/\D/g, '').slice(0, 2);
                      const parts = formData.dob ? formData.dob.split('-') : ['', '', ''];
                      parts[2] = day;
                      setFormData({ ...formData, dob: parts.join('-') });
                    }}
                  />
                  <span>-</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    name="dob-month"
                    placeholder="MM"
                    value={formData.dob ? formData.dob.split('-')[1] : ''}
                    onChange={(e) => {
                      const month = e.target.value.replace(/\D/g, '').slice(0, 2);
                      const parts = formData.dob ? formData.dob.split('-') : ['', '', ''];
                      parts[1] = month;
                      setFormData({ ...formData, dob: parts.join('-') });
                    }}
                  />
                  <span>-</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    name="dob-year"
                    placeholder="AAAA"
                    value={formData.dob ? formData.dob.split('-')[0] : ''}
                    onChange={(e) => {
                      const year = e.target.value.replace(/\D/g, '').slice(0, 4);
                      const parts = formData.dob ? formData.dob.split('-') : ['', '', ''];
                      parts[0] = year;
                      setFormData({ ...formData, dob: parts.join('-') });
                    }}
                  />
                </div>
              ) : (
                <input
                  type="date"
                  id="dob"
                  name="dob"
                  value={formData.dob}
                  onChange={handleInputChange}
                  required
                  max={todayStr}
                  ref={dateInputRef}
                />
              )}
            </div>
            <div className="form-group select-wrapper">
              <label htmlFor="gender">{t('form.genderLabel')}</label>
              <select id="gender" name="gender" value={formData.gender} onChange={handleInputChange}>
                <option value="homme">{t('form.genderMale', { years: LIFE_EXPECTANCY.homme })}</option>
                <option value="femme">{t('form.genderFemale', { years: LIFE_EXPECTANCY.femme })}</option>
                <option value="custom">{t('form.genderCustom')}</option>
              </select>
            </div>

            {/* NEW: Conditionally render the custom age input */}
            {formData.gender === 'custom' && (
              <div className="form-group">
                <label htmlFor="customLifeExpectancy">{t('form.customAgeLabel')}</label>
                <input
                  type="number"
                  id="customLifeExpectancy"
                  name="customLifeExpectancy"
                  value={formData.customLifeExpectancy}
                  onChange={handleInputChange}
                  min="1"
                  max="120"
                  ref={customAgeRef}
                />
              </div>
            )}

            {error && (
              <p className="error-message" role="alert" aria-live="polite">{error}</p>
            )}
            <button type="submit">{t('form.submitButton')}</button>
          </form>
        ) : (
          <>
            <LifeGrid
              totalWeeks={lifeData.totalWeeks}
              pastWeeks={lifeData.pastWeeks}
              birthDate={lifeData.birthDate}
            />
            <button onClick={resetApp} className="reset-button">{t('resetButton')}</button>
            <div style={{ marginTop: '12px' }}>
              {notifPermission !== 'granted' ? (
                <button type="button" onClick={requestNotificationPermission} className="reset-button">
                  Activer les notifications
                </button>
              ) : (
                <>
                  <p style={{ opacity: 0.8 }}>Notifications activées</p>
                  <button type="button" onClick={sendTestNotification} className="reset-button" style={{ marginTop: 8 }}>
                    Tester une notification
                  </button>
                  <button type="button" onClick={syncPrefsToBackend} className="reset-button" style={{ marginTop: 8 }}>
                    Mettre à jour préférences
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </main>

      <footer>
        <p>{t('footer')}</p>
      </footer>
    </div>
  );
}

export default App;