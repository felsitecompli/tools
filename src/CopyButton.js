import React from 'react';

const CopyIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      fill="currentColor"
      d="M4 1.5h7A1.5 1.5 0 0 1 12.5 3v8H11V3H4V1.5zM2.5 4H3v8.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V4h.5A1.5 1.5 0 0 1 15 5.5v8a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 5 13.5v-8A1.5 1.5 0 0 1 6.5 4H7v-.5A1.5 1.5 0 0 1 8.5 2h-4A1.5 1.5 0 0 0 3 3.5V4h-.5z"
    />
  </svg>
);

const CheckIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path fill="currentColor" d="M6.2 11.6 3.4 8.8l.9-.9 1.9 1.9 5.5-5.5.9.9-6.4 6.4z" />
  </svg>
);

const CopyButton = ({ copied = false, onClick, className = '', title = 'Copy', disabled = false }) => (
  <button
    type="button"
    className={`git-parse__copy-btn${className ? ` ${className}` : ''}`}
    onClick={onClick}
    title={copied ? 'Copied' : title}
    aria-label={copied ? 'Copied' : title}
    disabled={disabled}
  >
    {copied ? <CheckIcon /> : <CopyIcon />}
  </button>
);

export default CopyButton;
