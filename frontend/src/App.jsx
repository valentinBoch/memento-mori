// frontend/src/App.jsx
import React, { useState, useEffect, useRef } from 'react'; // NEW: Import useRef
import { useTranslation } from 'react-i18next';
import LifeGrid from './components/LifeGrid';
import './App.css';
import { setLanguage, getCurrentLanguage, setThemePreference, getThemePreference, setAccentPreference, getAccentPreference } from './i18n';

// Utility to detect mobile platforms
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

// Constants for clarity and easy maintenance
const LIFE_EXPECTANCY = { homme: 80, femme: 85 };
const LOCAL_STORAGE_KEY = 'momentoMoriData';

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

  // Ask for browser notification permission (Push subscription will be added later)
  const urlBase = (import.meta && import.meta.env && import.meta.env.VITE_API_BASE_URL) || 'http://localhost:3001';

  function base64UrlToUint8Array(base64UrlString) {
    const padding = '='.repeat((4 - (base64UrlString.length % 4)) % 4);
    const base64 = (base64UrlString + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const output = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
    return output;
  }

  const requestNotificationPermission = async () => {
    try {
      if (typeof Notification === 'undefined') {
        alert('Les notifications ne sont pas supportées sur cet appareil/navigateur.');
        return;
      }
      const result = await Notification.requestPermission();
      setNotifPermission(result);
      if (result === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        const vapid = (import.meta && import.meta.env && import.meta.env.VITE_VAPID_PUBLIC_KEY) || '';
        if (!vapid) {
          console.warn('VAPID public key manquante (VITE_VAPID_PUBLIC_KEY).');
        }
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapid ? base64UrlToUint8Array(vapid) : undefined,
        });
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        await fetch(`${urlBase}/api/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription, timezone })
        });
        // Auto-sync preferences after subscription if available
        try { await syncPrefsToBackend(); } catch (_) {}
        alert('Notifications activées.');
      }
    } catch (err) {
      console.error('Notification permission error:', err);
      alert('Impossible de demander la permission de notification.');
    }
  };

  const sendTestNotification = async () => {
    try {
      await fetch(`${urlBase}/api/push/test`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      alert('Demande de test envoyée (assurez-vous que les clés VAPID sont configurées côté backend).');
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
      const resp = await fetch(`${urlBase}/api/push/prefs`, {
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

  const clampInt = (value, min, max) => Math.max(min, Math.min(max, value));

  // Parse a YYYY-MM-DD string as a UTC date (no time component)
  const parseDateFromInput = (value) => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
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
            customLifeExpectancy: clampInt(
              parseInt(parsedData.customLifeExpectancy, 10) || 80,
              1,
              120
            ),
          });
          calculateWeeks(null, {
            dob: parsedData.dob,
            gender: parsedData.gender,
            customLifeExpectancy: clampInt(
              parseInt(parsedData.customLifeExpectancy, 10) || 80,
              1,
              120
            ),
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
                <button onClick={requestNotificationPermission} className="reset-button">
                  Activer les notifications
                </button>
              ) : (
                <>
                  <p style={{ opacity: 0.8 }}>Notifications activées</p>
                  <button onClick={sendTestNotification} className="reset-button" style={{ marginTop: 8 }}>
                    Tester une notification
                  </button>
                  <button onClick={syncPrefsToBackend} className="reset-button" style={{ marginTop: 8 }}>
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