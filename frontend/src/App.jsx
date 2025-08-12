// frontend/src/App.jsx
import React, { useState, useEffect, useRef } from 'react'; // NEW: Import useRef
import { useTranslation } from 'react-i18next';
import LifeGrid from './components/LifeGrid';
import './App.css';
import { setLanguage, getCurrentLanguage, setThemePreference, getThemePreference, setAccentPreference, getAccentPreference } from './i18n';

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

  // UI preferences (language, theme, accent)
  const [language, setLangState] = useState(getCurrentLanguage());
  const [theme, setTheme] = useState(getThemePreference());
  const [accent, setAccent] = useState(getAccentPreference());

  // Helpers
  const getTodayLocalDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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
    // Apply saved UI prefs
    try {
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.setAttribute('data-accent', accent);
      setLanguage(language);
    } catch (e) {
      console.warn('Failed to apply UI prefs:', e);
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

  // Persist/apply theme changes
  useEffect(() => {
    setThemePreference(theme);
  }, [theme]);

  // Persist/apply accent changes
  useEffect(() => {
    setAccentPreference(accent);
  }, [accent]);

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

  // UI controls handlers
  const onChangeLang = (e) => {
    const lng = e.target.value;
    setLangState(lng);
    setLanguage(lng);
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  const onChangeAccent = (e) => {
    const val = e.target.value;
    setAccent(val);
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
          <div className="control">
            <label htmlFor="lang-select" className="visually-hidden">Langue</label>
            <select id="lang-select" value={language} onChange={onChangeLang}>
              <option value="fr">Français</option>
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="it">Italiano</option>
              <option value="de">Deutsch</option>
            </select>
          </div>
          <div className="control">
            <label htmlFor="accent-select" className="visually-hidden">Accent</label>
            <select id="accent-select" value={accent} onChange={onChangeAccent}>
              <option value="amber">Amber</option>
              <option value="teal">Teal</option>
              <option value="indigo">Indigo</option>
            </select>
          </div>
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}>
            {theme === 'dark' ? '☾ ' + (t('theme.dark', { defaultValue: 'Sombre' })) : '☀︎ ' + (t('theme.light', { defaultValue: 'Clair' }))}
          </button>
        </div>
      </header>

      <main>
        {!lifeData ? (
          <form onSubmit={calculateWeeks} className="input-form">
            <div className="form-group">
              <label htmlFor="dob">{t('form.dobLabel')}</label>
              <input
                type="date"
                id="dob"
                name="dob"
                value={formData.dob}
                onChange={handleInputChange}
                required
                max={todayStr}
                ref={dateInputRef} // NEW: Attach the ref here
              />
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
