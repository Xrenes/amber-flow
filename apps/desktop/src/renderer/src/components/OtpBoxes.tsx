import React, { useEffect, useRef } from 'react';
import styles from '../pages/LoginPage.module.css';

interface OtpBoxesProps {
  values: string[];
  onChange: (values: string[]) => void;
  onComplete?: () => void;
}

export default function OtpBoxes({ values, onChange, onComplete }: OtpBoxesProps) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  function setDigit(index: number, digit: string) {
    const next = [...values];
    next[index] = digit;
    onChange(next);
    if (next.every((d) => d)) onComplete?.();
  }

  function handleInput(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/\D/g, '').slice(-1);
    setDigit(index, val);
    if (val && index < values.length - 1) inputRefs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !values[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      setDigit(index - 1, '');
    }
  }

  function handlePaste(index: number, e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    const next = [...values];
    for (let j = 0; j < values.length; j++) next[j] = pasted[j] || '';
    onChange(next);
    if (next.every((d) => d)) onComplete?.();
    const last = Math.min(pasted.length, values.length) - 1;
    if (last >= 0) inputRefs.current[last]?.focus();
  }

  return (
    <div className={styles.otpBoxes}>
      {values.map((digit, i) => (
        <input
          key={i}
          ref={(el) => (inputRefs.current[i] = el)}
          className={styles.otpDigit}
          maxLength={1}
          inputMode="numeric"
          pattern="[0-9]"
          value={digit}
          onChange={(e) => handleInput(i, e)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
        />
      ))}
    </div>
  );
}
