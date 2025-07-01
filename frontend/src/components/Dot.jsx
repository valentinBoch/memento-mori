// frontend/src/components/Dot.jsx

import React from 'react';

const Dot = ({ cx, cy, r, className, tooltipText }) => {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={r}
      className={className}
    >
      <title>{tooltipText}</title>
    </circle>
  );
};

export default Dot;