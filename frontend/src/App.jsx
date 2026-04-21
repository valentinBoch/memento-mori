import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import LifeGrid from './components/LifeGrid';
import './App.css';
import {
  setLanguage as persistLanguage,
  getCurrentLanguage,
  setThemePreference,
  getThemePreference,
  setAccentPreference,
  getAccentPreference,
} from './i18n';

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

const LIFE_EXPECTANCY = { homme: 80, femme: 85 };
const LOCAL_STORAGE_KEY = 'momentoMoriData';
const DEFAULT_FORM_DATA = { dob: '', gender: 'homme', customLifeExpectancy: 80 };
const LANGUAGE_OPTIONS = [
  { value: 'fr', label: 'FR' },
  { value: 'en', label: 'EN' },
  { value: 'es', label: 'ES' },
  { value: 'it', label: 'IT' },
  { value: 'de', label: 'DE' },
];
const ACCENT_OPTIONS = ['teal', 'amber', 'indigo'];

function pickRandomIndex(length, excludedIndex = -1) {
  if (length <= 1) return 0;

  let nextIndex = excludedIndex;
  while (nextIndex === excludedIndex) {
    nextIndex = Math.floor(Math.random() * length);
  }

  return nextIndex;
}

function base64UrlToUint8Array(base64UrlString) {
  const padding = '='.repeat((4 - (base64UrlString.length % 4)) % 4);
  const base64 = (base64UrlString + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

async function activateNotificationsFlow() {
  if (!isSecureContext) throw new Error('HTTPS requis');
  if (typeof Notification === 'undefined') throw new Error('Notifications non supportées');
  if (!('serviceWorker' in navigator)) throw new Error('Service Worker non supporté');

  if (Notification.permission === 'default') {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error(`Permission = ${permission}`);
  } else if (Notification.permission !== 'granted') {
    throw new Error(`Permission = ${Notification.permission}`);
  }

  const registration = await navigator.serviceWorker.ready;
  const response = await fetch('/api/push/public-key', { cache: 'no-store' });

  if (!response.ok) throw new Error(`public-key HTTP ${response.status}`);

  const { publicKey } = await response.json();
  if (!publicKey) throw new Error('Clé publique VAPID absente');

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
    });
  } else {
    const hasKeys = Boolean(subscription.getKey('p256dh')) && Boolean(subscription.getKey('auth'));

    if (!hasKeys) {
      try {
        await subscription.unsubscribe();
      } catch {
        // noop
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToUint8Array(publicKey),
      });
    }
  }

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const subscribeResponse = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscription, timezone }),
  });

  if (!subscribeResponse.ok) throw new Error(`subscribe HTTP ${subscribeResponse.status}`);
}

async function resyncPushSubscription() {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) return;

    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
  } catch (error) {
    console.warn('Resync subscription failed:', error);
  }
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTodayLocalDateString() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDobSegments(dob = '') {
  const [year = '', month = '', day = ''] = String(dob).split('-');
  return { year, month, day };
}

function buildDobString({ year = '', month = '', day = '' }) {
  return `${year}-${month}-${day}`;
}

function parseDateFromInput(value) {
  if (typeof value !== 'string') return null;

  const { year, month, day } = getDobSegments(value);
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) return null;

  const parsedYear = Number(year);
  const parsedMonth = Number(month);
  const parsedDay = Number(day);
  const date = new Date(Date.UTC(parsedYear, parsedMonth - 1, parsedDay));

  const isValidDate =
    date.getUTCFullYear() === parsedYear &&
    date.getUTCMonth() === parsedMonth - 1 &&
    date.getUTCDate() === parsedDay;

  return isValidDate ? date : null;
}

function getLifeExpectancyYears(data) {
  if (data.gender === 'custom') {
    return clampInt(parseInt(data.customLifeExpectancy, 10) || LIFE_EXPECTANCY.homme, 1, 120);
  }

  return LIFE_EXPECTANCY[data.gender] || LIFE_EXPECTANCY.homme;
}

function calculateLifeCalendar(data) {
  const rawDob = String(data.dob || '');

  if (!rawDob.replace(/-/g, '')) {
    return { errorKey: 'error.noDob' };
  }

  const birthDate = parseDateFromInput(rawDob);
  if (!birthDate) {
    return { errorKey: 'error.invalidDob' };
  }

  const today = new Date();
  const todayUTC = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  if (birthDate > todayUTC) {
    return { errorKey: 'error.futureDob' };
  }

  const lifeExpectancyYears = getLifeExpectancyYears(data);
  const endDate = new Date(Date.UTC(
    birthDate.getUTCFullYear() + lifeExpectancyYears,
    birthDate.getUTCMonth(),
    birthDate.getUTCDate(),
  ));

  const millisecondsInWeek = 1000 * 60 * 60 * 24 * 7;
  const totalWeeks = Math.max(1, Math.floor((endDate - birthDate) / millisecondsInWeek));
  const pastWeeks = clampInt(Math.floor((todayUTC - birthDate) / millisecondsInWeek), 0, totalWeeks);
  const { year, month, day } = getDobSegments(rawDob);

  return {
    normalizedData: {
      dob: `${year}-${month}-${day}`,
      gender: data.gender,
      customLifeExpectancy: lifeExpectancyYears,
    },
    lifeData: {
      totalWeeks,
      pastWeeks,
      birthDate,
    },
  };
}

function syncThemeMeta(theme) {
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', theme === 'light' ? '#f6efe6' : '#111111');
  }
}

async function readErrorMessage(response, fallbackMessage) {
  const data = await response.json().catch(() => ({}));
  return data.error || fallbackMessage;
}

function App() {
  const { t, i18n } = useTranslation();
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA);
  const [lifeData, setLifeData] = useState(null);
  const [errorKey, setErrorKey] = useState('');
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );
  const [theme, setTheme] = useState(() => getThemePreference());
  const [accent, setAccent] = useState(() => getAccentPreference());
  const [language, setLanguage] = useState(() => getCurrentLanguage());
  const [notificationAction, setNotificationAction] = useState('');
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [preferCompactGrid, setPreferCompactGrid] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth <= 900 : false),
  );

  const dateInputRef = useRef(null);
  const customAgeRef = useRef(null);
  const dayRef = useRef(null);
  const monthRef = useRef(null);
  const yearRef = useRef(null);
  const quoteEntriesRaw = t('quotes.items', { returnObjects: true });
  const quoteEntries = Array.isArray(quoteEntriesRaw) ? quoteEntriesRaw : [];
  const currentQuote = quoteEntries[quoteIndex] ?? null;

  useEffect(() => {
    if (!isMobile && dateInputRef.current) {
      dateInputRef.current.focus();
    }

    try {
      const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!savedData) return;

      const parsedData = JSON.parse(savedData);
      if (!parsedData || typeof parsedData !== 'object') return;

      const result = calculateLifeCalendar({
        dob: parsedData.dob,
        gender: ['homme', 'femme', 'custom'].includes(parsedData.gender) ? parsedData.gender : 'homme',
        customLifeExpectancy: parsedData.customLifeExpectancy,
      });

      if (result.lifeData) {
        setFormData(result.normalizedData);
        setLifeData(result.lifeData);
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    } catch (error) {
      console.warn('Failed to read saved data:', error);
    }

    if (typeof Notification !== 'undefined') {
      setNotifPermission(Notification.permission);
    }
  }, []);

  useEffect(() => {
    setThemePreference(theme);
    syncThemeMeta(theme);
  }, [theme]);

  useEffect(() => {
    setAccentPreference(accent);
  }, [accent]);

  useEffect(() => {
    persistLanguage(language);
  }, [language]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(max-width: 900px)');
    const updateViewportPreference = () => setPreferCompactGrid(mediaQuery.matches);

    updateViewportPreference();

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateViewportPreference);
      return () => mediaQuery.removeEventListener('change', updateViewportPreference);
    }

    mediaQuery.addListener(updateViewportPreference);
    return () => mediaQuery.removeListener(updateViewportPreference);
  }, []);

  useEffect(() => {
    if (!quoteEntries.length) return;
    setQuoteIndex((current) => (
      current < quoteEntries.length ? current : pickRandomIndex(quoteEntries.length)
    ));
  }, [quoteEntries.length]);

  useEffect(() => {
    if (!quoteEntries.length) return;
    setQuoteIndex((current) => pickRandomIndex(quoteEntries.length, current));
  }, [i18n.resolvedLanguage, quoteEntries.length]);

  useEffect(() => {
    if (formData.gender === 'custom') {
      window.setTimeout(() => {
        customAgeRef.current?.focus();
      }, 0);
    }
  }, [formData.gender]);

  useEffect(() => {
    resyncPushSubscription();
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        resyncPushSubscription();
        if (typeof Notification !== 'undefined') {
          setNotifPermission(Notification.permission);
        }
      }
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const todayStr = getTodayLocalDateString();
  const dobSegments = getDobSegments(formData.dob);

  const handleInputChange = (event) => {
    const { name, value, type } = event.target;
    setErrorKey('');

    setFormData((current) => {
      if (type === 'number') {
        const parsed = parseInt(value, 10);
        return {
          ...current,
          [name]: Number.isFinite(parsed) ? clampInt(parsed, 1, 120) : '',
        };
      }

      return {
        ...current,
        [name]: value,
      };
    });
  };

  const updateDobSegment = (segment, value, maxLength) => {
    const nextValue = value.replace(/\D/g, '').slice(0, maxLength);
    setErrorKey('');

    setFormData((current) => {
      const nextSegments = {
        ...getDobSegments(current.dob),
        [segment]: nextValue,
      };

      return {
        ...current,
        dob: buildDobString(nextSegments),
      };
    });
  };

  const calculateWeeks = (event) => {
    event?.preventDefault();

    const result = calculateLifeCalendar(formData);
    if (result.errorKey) {
      setLifeData(null);
      setErrorKey(result.errorKey);
      return;
    }

    setErrorKey('');
    setFormData(result.normalizedData);
    setLifeData(result.lifeData);

    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(result.normalizedData));
    } catch (error) {
      console.warn('Failed to save data:', error);
    }
  };

  const resetApp = () => {
    setLifeData(null);
    setFormData(DEFAULT_FORM_DATA);
    setErrorKey('');
    localStorage.removeItem(LOCAL_STORAGE_KEY);

    window.setTimeout(() => {
      if (!isMobile) {
        dateInputRef.current?.focus();
      } else {
        dayRef.current?.focus();
      }
    }, 0);
  };

  const syncPrefsToBackend = async ({ silent = false } = {}) => {
    const manageBusyState = !silent;

    if (!('serviceWorker' in navigator)) {
      if (!silent) {
        alert(t('notifications.syncError', { error: t('notifications.unsupported') }));
      }
      return false;
    }

    if (manageBusyState) {
      setNotificationAction('sync');
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        if (!silent) {
          alert(t('notifications.missingSubscription'));
        }
        return false;
      }

      const response = await fetch('/api/push/prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          dob: formData.dob || null,
          gender: formData.gender || 'homme',
          customLifeExpectancy: formData.customLifeExpectancy || undefined,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Erreur sauvegarde préférences'));
      }

      if (!silent) {
        alert(t('notifications.syncSuccess'));
      }

      return true;
    } catch (error) {
      console.error('syncPrefsToBackend error:', error);
      if (!silent) {
        alert(t('notifications.syncError', { error: error?.message || String(error) }));
      }
      return false;
    } finally {
      if (manageBusyState) {
        setNotificationAction('');
      }
    }
  };

  const requestNotificationPermission = async () => {
    setNotificationAction('enable');

    try {
      await activateNotificationsFlow();
      setNotifPermission('granted');
      await syncPrefsToBackend({ silent: true });
      alert(t('notifications.activateSuccess'));
    } catch (error) {
      console.error('Activation notifications - erreur:', error);
      alert(t('notifications.activateError', { error: error?.message || String(error) }));
    } finally {
      if (typeof Notification !== 'undefined') {
        setNotifPermission(Notification.permission);
      }
      setNotificationAction('');
    }
  };

  const sendTestNotification = async () => {
    setNotificationAction('test');

    try {
      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'Échec envoi test'));
      }

      alert(t('notifications.testSuccess'));
    } catch (error) {
      console.error('sendTestNotification error:', error);
      alert(t('notifications.testError', { error: error?.message || String(error) }));
    } finally {
      setNotificationAction('');
    }
  };

  const toggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
  };

  const refreshQuote = () => {
    if (!quoteEntries.length) return;
    setQuoteIndex((current) => pickRandomIndex(quoteEntries.length, current));
  };

  return (
    <div className="App">
      <div className="background-orb orb-a" aria-hidden="true" />
      <div className="background-orb orb-b" aria-hidden="true" />

      <header>
        <div className="toolbar" aria-label={t('toolbar.label')}>
          <div className="control select-wrapper compact">
            <label className="visually-hidden" htmlFor="language-switcher">
              {t('toolbar.language')}
            </label>
            <select
              id="language-switcher"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button type="button" className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? t('toolbar.lightMode') : t('toolbar.darkMode')}
          </button>

          <div className="control select-wrapper compact">
            <label className="visually-hidden" htmlFor="accent-switcher">
              {t('toolbar.accent')}
            </label>
            <select
              id="accent-switcher"
              value={accent}
              onChange={(event) => setAccent(event.target.value)}
            >
              {ACCENT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {t(`toolbar.accent${option[0].toUpperCase()}${option.slice(1)}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="header-text">
          <h1>{t('title')}</h1>
          <p className="subtitle">{t('subtitle')}</p>
        </div>
      </header>

      {currentQuote ? (
        <section className="quote-panel" aria-label={t('quotes.title')}>
          <div className="quote-panel-header">
            <p className="quote-eyebrow">{t('quotes.title')}</p>
            <button type="button" className="quote-refresh" onClick={refreshQuote}>
              {t('quotes.refresh')}
            </button>
          </div>

          <blockquote className="quote-card">
            <p className="quote-text">{currentQuote.text}</p>
            <footer className="quote-author">{currentQuote.author}</footer>
          </blockquote>
        </section>
      ) : null}

      <main>
        {!lifeData ? (
          <form onSubmit={calculateWeeks} className="input-form">
            <div className="form-group">
              <label htmlFor="dob">{t('form.dobLabel')}</label>

              {isMobile ? (
                <div className="dob-segmented">
                  <input
                    ref={dayRef}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="bday-day"
                    name="dob-day"
                    aria-label={t('form.dayLabel')}
                    placeholder="JJ"
                    value={dobSegments.day}
                    onChange={(event) => {
                      updateDobSegment('day', event.target.value, 2);
                      if (event.target.value.replace(/\D/g, '').length === 2) {
                        monthRef.current?.focus();
                      }
                    }}
                  />
                  <span>/</span>
                  <input
                    ref={monthRef}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="bday-month"
                    name="dob-month"
                    aria-label={t('form.monthLabel')}
                    placeholder="MM"
                    value={dobSegments.month}
                    onChange={(event) => {
                      updateDobSegment('month', event.target.value, 2);
                      if (event.target.value.replace(/\D/g, '').length === 2) {
                        yearRef.current?.focus();
                      }
                    }}
                  />
                  <span>/</span>
                  <input
                    ref={yearRef}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="bday-year"
                    name="dob-year"
                    aria-label={t('form.yearLabel')}
                    placeholder="AAAA"
                    value={dobSegments.year}
                    onChange={(event) => updateDobSegment('year', event.target.value, 4)}
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

              {isMobile ? <p className="field-hint">{t('form.dobHint')}</p> : null}
            </div>

            <div className="form-group select-wrapper">
              <label htmlFor="gender">{t('form.genderLabel')}</label>
              <select id="gender" name="gender" value={formData.gender} onChange={handleInputChange}>
                <option value="homme">{t('form.genderMale', { years: LIFE_EXPECTANCY.homme })}</option>
                <option value="femme">{t('form.genderFemale', { years: LIFE_EXPECTANCY.femme })}</option>
                <option value="custom">{t('form.genderCustom')}</option>
              </select>
            </div>

            {formData.gender === 'custom' ? (
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
            ) : null}

            {errorKey ? (
              <p className="error-message" role="alert" aria-live="polite">
                {t(errorKey)}
              </p>
            ) : null}

            <button type="submit">{t('form.submitButton')}</button>
          </form>
        ) : (
          <div className="results-stack">
            <LifeGrid
              totalWeeks={lifeData.totalWeeks}
              pastWeeks={lifeData.pastWeeks}
              birthDate={lifeData.birthDate}
              preferCompactLayout={preferCompactGrid}
            />

            <button type="button" onClick={resetApp} className="reset-button">
              {t('resetButton')}
            </button>

            <div className="notification-panel">
              {notifPermission !== 'granted' ? (
                <button
                  type="button"
                  onClick={requestNotificationPermission}
                  className="notification-button"
                  disabled={notificationAction === 'enable'}
                >
                  {notificationAction === 'enable'
                    ? t('notifications.activating')
                    : t('notifications.enable')}
                </button>
              ) : (
                <>
                  <p className="notification-hint">{t('notifications.enabled')}</p>

                  <div className="notification-actions">
                    <button
                      type="button"
                      onClick={sendTestNotification}
                      className="reset-button"
                      disabled={notificationAction === 'test'}
                    >
                      {notificationAction === 'test'
                        ? t('notifications.testing')
                        : t('notifications.test')}
                    </button>

                    <button
                      type="button"
                      onClick={() => syncPrefsToBackend()}
                      className="reset-button"
                      disabled={notificationAction === 'sync'}
                    >
                      {notificationAction === 'sync'
                        ? t('notifications.syncing')
                        : t('notifications.sync')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      <footer>
        <p>{t('footer')}</p>
      </footer>
    </div>
  );
}

export default App;
