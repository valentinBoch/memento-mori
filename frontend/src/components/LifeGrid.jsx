// frontend/src/components/LifeGrid.jsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import Dot from './Dot';

// SVG grid geometry constants
const WEEKS_PER_ROW = 52;
const DOT_RADIUS = 5;
const GAP = 3;
const DOT_DIAMETER_WITH_GAP = (DOT_RADIUS * 2) + GAP;

// The number of years after which the layout splits into two columns
const YEARS_THRESHOLD_FOR_SPLIT = 55;

const LifeGrid = ({ totalWeeks, pastWeeks, birthDate }) => {
  const { t, i18n } = useTranslation();
  const weeksArray = Array.from({ length: totalWeeks }, (_, i) => i);
  const totalRows = Math.ceil(totalWeeks / WEEKS_PER_ROW);

  // Decide whether to use a single or a split (two-column) layout
  const useSplitLayout = totalRows > YEARS_THRESHOLD_FOR_SPLIT;
  
  let svgWidth, svgHeight, viewBox;

  if (useSplitLayout) {
    // Two-column layout calculations
    const yearsPerBlock = Math.ceil(totalRows / 2);
    const blockWidth = WEEKS_PER_ROW * DOT_DIAMETER_WITH_GAP - GAP;
    const bigGapBetweenBlocks = DOT_DIAMETER_WITH_GAP * 4;
    svgWidth = (blockWidth * 2) + bigGapBetweenBlocks;
    svgHeight = yearsPerBlock * DOT_DIAMETER_WITH_GAP - GAP;
  } else {
    // Single-column layout calculations
    svgWidth = WEEKS_PER_ROW * DOT_DIAMETER_WITH_GAP - GAP;
    svgHeight = totalRows * DOT_DIAMETER_WITH_GAP - GAP;
  }
  viewBox = `0 0 ${svgWidth} ${svgHeight}`;

  const percentageLived = ((pastWeeks / totalWeeks) * 100).toFixed(1);

  // Formats the date for the tooltip according to the current language
  const getWeekDate = (weekIndex) => {
    const date = new Date(birthDate);
    date.setDate(date.getDate() + weekIndex * 7);
    return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }).format(date);
  };

  return (
    <div className="life-grid-container">
      <div className="stats">
        <p><span>{t('stats.percentageLived', { percentage: percentageLived })}</span></p>
        <p><span>{t('stats.weeksLived', { count: pastWeeks })}</span></p>
        <p><span>{t('stats.weeksLeft', { count: totalWeeks - pastWeeks })}</span></p>
      </div>

      <svg className="life-grid-svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        {weeksArray.map(weekIndex => {
          let row, col, cx, cy;
          const currentYear = Math.floor(weekIndex / WEEKS_PER_ROW);

          if (useSplitLayout) {
            const yearsPerBlock = Math.ceil(totalRows / 2);
            const blockWidth = WEEKS_PER_ROW * DOT_DIAMETER_WITH_GAP - GAP;
            const bigGapBetweenBlocks = DOT_DIAMETER_WITH_GAP * 4;
            if (currentYear < yearsPerBlock) {
              row = currentYear; col = weekIndex % WEEKS_PER_ROW; cx = col * DOT_DIAMETER_WITH_GAP + DOT_RADIUS;
            } else {
              row = currentYear - yearsPerBlock; col = weekIndex % WEEKS_PER_ROW; cx = (col * DOT_DIAMETER_WITH_GAP + DOT_RADIUS) + blockWidth + bigGapBetweenBlocks;
            }
            cy = row * DOT_DIAMETER_WITH_GAP + DOT_RADIUS;
          } else {
            row = currentYear; col = weekIndex % WEEKS_PER_ROW; cx = col * DOT_DIAMETER_WITH_GAP + DOT_RADIUS; cy = row * DOT_DIAMETER_WITH_GAP + DOT_RADIUS;
          }
          
          const isPast = weekIndex < pastWeeks;
          const isCurrent = weekIndex === pastWeeks;

          // Assign a single, mutually exclusive class for styling
          let className = 'dot';
          if (isCurrent) {
            className += ' current';
          } else if (isPast) {
            className += ' past';
          } else {
            className += ' future';
          }

          return (
            <Dot 
              key={weekIndex} 
              cx={cx} cy={cy} 
              r={DOT_RADIUS} 
              className={className} 
              tooltipText={t('tooltip.weekOf', { date: getWeekDate(weekIndex) })}
            />
          );
        })}
      </svg>
    </div>
  );
};

export default LifeGrid;