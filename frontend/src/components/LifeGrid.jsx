// frontend/src/components/LifeGrid.jsx
import React, { useMemo, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';

// SVG grid geometry constants
const WEEKS_PER_ROW = 52;
const DOT_RADIUS = 5;
const GAP = 3;
const DOT_DIAMETER_WITH_GAP = (DOT_RADIUS * 2) + GAP;

// The number of years after which the layout splits into two columns
const YEARS_THRESHOLD_FOR_SPLIT = 55;

const LifeGrid = ({ totalWeeks, pastWeeks, birthDate }) => {
  const { t, i18n } = useTranslation();

  // Precompute and memoize arrays/derived values to avoid heavy work on each render
  const weeksArray = useMemo(() => Array.from({ length: totalWeeks }, (_, i) => i), [totalWeeks]);
  const totalRows = useMemo(() => Math.ceil(totalWeeks / WEEKS_PER_ROW), [totalWeeks]);

  // Decide whether to use a single or a split (two-column) layout
  const layout = useMemo(() => {
    const useSplitLayout = totalRows > YEARS_THRESHOLD_FOR_SPLIT;

    if (useSplitLayout) {
      const splitIndex = Math.floor(totalWeeks / 2);
      const leftBlockWeeks = splitIndex;
      const rightBlockWeeks = totalWeeks - splitIndex;

      const leftRows = Math.ceil(leftBlockWeeks / WEEKS_PER_ROW);
      const rightRows = Math.ceil(rightBlockWeeks / WEEKS_PER_ROW);

      const blockWidth = WEEKS_PER_ROW * DOT_DIAMETER_WITH_GAP - GAP;
      const bigGapBetweenBlocks = DOT_DIAMETER_WITH_GAP * 4;

      const svgWidth = (blockWidth * 2) + bigGapBetweenBlocks;
      const svgHeight = Math.max(leftRows, rightRows) * DOT_DIAMETER_WITH_GAP - GAP;

      return { useSplitLayout, splitIndex, blockWidth, bigGapBetweenBlocks, svgWidth, svgHeight };
    }

    const svgWidth = WEEKS_PER_ROW * DOT_DIAMETER_WITH_GAP - GAP;
    const svgHeight = totalRows * DOT_DIAMETER_WITH_GAP - GAP;
    return { useSplitLayout: false, splitIndex: null, blockWidth: null, bigGapBetweenBlocks: null, svgWidth, svgHeight };
  }, [totalRows, totalWeeks]);

  const viewBox = `0 0 ${layout.svgWidth} ${layout.svgHeight}`;
  const percentageLived = ((pastWeeks / totalWeeks) * 100).toFixed(1);

  // Reuse a single date formatter and precomputed birth timestamp
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long' }), [i18n.language]);
  const birthMs = useMemo(() => (new Date(birthDate)).getTime(), [birthDate]);
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

  const getWeekDate = useCallback((weekIndex) => {
    const d = new Date(birthMs + weekIndex * MS_PER_WEEK);
    return dateFormatter.format(d);
  }, [birthMs, dateFormatter]);

  return (
    <div className="life-grid-container">
      <div className="stats">
        <p><span>{t('stats.percentageLived', { percentage: percentageLived })}</span></p>
        <p><span>{t('stats.weeksLived', { count: pastWeeks })}</span></p>
        <p><span>{t('stats.weeksLeft', { count: totalWeeks - pastWeeks })}</span></p>
      </div>

      <svg className="life-grid-svg" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        {weeksArray.map((weekIndex) => {
          let row, col, cx, cy;

          if (layout.useSplitLayout) {
            const leftWeeks = layout.splitIndex !== null ? layout.splitIndex : Math.floor(totalWeeks / 2);
            const isRight = weekIndex >= leftWeeks;
            const blockIndex = isRight ? (weekIndex - leftWeeks) : weekIndex;

            row = Math.floor(blockIndex / WEEKS_PER_ROW);
            col = blockIndex % WEEKS_PER_ROW;

            const xOffset = isRight ? (layout.blockWidth + layout.bigGapBetweenBlocks) : 0;
            cx = col * DOT_DIAMETER_WITH_GAP + DOT_RADIUS + xOffset;
            cy = row * DOT_DIAMETER_WITH_GAP + DOT_RADIUS;
          } else {
            row = Math.floor(weekIndex / WEEKS_PER_ROW);
            col = weekIndex % WEEKS_PER_ROW;
            cx = col * DOT_DIAMETER_WITH_GAP + DOT_RADIUS;
            cy = row * DOT_DIAMETER_WITH_GAP + DOT_RADIUS;
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
            <g key={weekIndex}>
              <circle cx={cx} cy={cy} r={DOT_RADIUS} className={className} />
              <title>{t('tooltip.weekOf', { date: getWeekDate(weekIndex) })}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default memo(LifeGrid);