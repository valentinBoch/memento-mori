// frontend/src/App.jsx
import React, { useState, useEffect, useRef } from 'react'; // NEW: Import useRef
import { useTranslation } from 'react-i18next';
import LifeGrid from './components/LifeGrid';
import './App.css';

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

  // NEW: Create a ref for the date input
  const dateInputRef = useRef(null);

  // On component mount, try to load saved data and focus the input
  useEffect(() => {
    // Focus the date input field when the form is shown
    if (dateInputRef.current) {
      dateInputRef.current.focus();
    }
    
    const savedData = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedData) {
      const parsedData = JSON.parse(savedData);
      setFormData(parsedData);
      calculateWeeks(null, parsedData); 
    }
  }, []); // Empty dependency array ensures this runs only once

  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    setFormData({ 
      ...formData, 
      [name]: type === 'number' ? parseInt(value, 10) : value 
    });
  };

  const calculateWeeks = (e, savedFormData = null) => {
    if (e) e.preventDefault();
    
    const dataToProcess = savedFormData || formData;

    if (!dataToProcess.dob) {
      setError(t('error.noDob'));
      return;
    }

    const birthDate = new Date(dataToProcess.dob);
    const today = new Date();

    if (birthDate > today) {
      setError(t('error.futureDob'));
      return;
    }

    // MODIFIED: Use custom life expectancy if gender is 'custom'
    const lifeExpectancyYears = dataToProcess.gender === 'custom'
      ? dataToProcess.customLifeExpectancy
      : LIFE_EXPECTANCY[dataToProcess.gender];

    const endDate = new Date(birthDate);
    endDate.setFullYear(birthDate.getFullYear() + lifeExpectancyYears);

    const MS_IN_WEEK = 1000 * 60 * 60 * 24 * 7;
    const totalWeeks = Math.floor((endDate - birthDate) / MS_IN_WEEK);
    const pastWeeks = Math.floor((today - birthDate) / MS_IN_WEEK);
    
    setError('');
    setLifeData({ totalWeeks, pastWeeks, birthDate });

    if (!savedFormData) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToProcess));
    }
  };

  const resetApp = () => {
    setLifeData(null);
    setFormData({ dob: '', gender: 'homme', customLifeExpectancy: 80 });
    setError('');
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    
    // NEW: We need to re-focus the input after a reset
    // A timeout ensures the element is visible before we try to focus it
    setTimeout(() => {
        if(dateInputRef.current) {
            dateInputRef.current.focus();
        }
    }, 0);
  }

  return (
    <div className="App">
      <header>
        <h1>{t('title')}</h1>
        <p className="subtitle">{t('subtitle')}</p>
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
                />
              </div>
            )}
            
            {error && <p className="error-message">{error}</p>}
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