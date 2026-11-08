import { useEffect, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

/** Id of the error message for a control, so the control can point at it with aria-describedby. */
const errorId = (id: string) => `${id}-error`;
const hintId = (id: string) => `${id}-hint`;
const describedBy = (id: string, error?: string | null, hint?: string) => (error ? errorId(id) : hint ? hintId(id) : undefined);

/** Moves focus to the first field marked invalid. Run it after the render that shows the errors. */
export function focusFirstInvalid(): void {
  const el = document.querySelector<HTMLElement>('[role="dialog"] [aria-invalid="true"]') ?? document.querySelector<HTMLElement>('[aria-invalid="true"]');
  el?.focus();
}

/** Call focusFirstInvalid each time `tick` goes up (bump it when a submit fails validation). */
export function useFocusFirstInvalid(tick: number): void {
  useEffect(() => { if (tick > 0) focusFirstInvalid(); }, [tick]);
}

export function Field({ label, htmlFor, error, hint, required, children, className = '' }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-xs font-bold uppercase tracking-wide text-ink-soft">
        {label}{required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p id={htmlFor && hintId(htmlFor)} className="text-xs text-ink-soft">{hint}</p>}
      {error && <p id={htmlFor && errorId(htmlFor)} role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

const control = 'w-full min-h-11 rounded-md border bg-white px-3 text-base text-ink placeholder:text-ink-mute focus-visible:border-pitch disabled:bg-chalk disabled:text-ink-soft';
const ok = 'border-line';
const bad = 'border-danger';

interface Shared {
  label: string;
  error?: string | null;
  hint?: string;
  wrapperClassName?: string;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, Shared {}
export function Input({ label, error, hint, wrapperClassName, className = '', id, required, ...rest }: InputProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} htmlFor={fid} error={error} hint={hint} required={required} className={wrapperClassName}>
      <input id={fid} required={required} aria-invalid={!!error} aria-describedby={describedBy(fid, error, hint)} className={`${control} ${error ? bad : ok} ${className}`} {...rest} />
    </Field>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, Shared {
  options?: ReadonlyArray<{ value: string; label: string }>;
  placeholder?: string;
}
export function Select({ label, error, hint, wrapperClassName, className = '', id, required, options, placeholder, children, ...rest }: SelectProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} htmlFor={fid} error={error} hint={hint} required={required} className={wrapperClassName}>
      <select id={fid} required={required} aria-invalid={!!error} aria-describedby={describedBy(fid, error, hint)} className={`${control} ${error ? bad : ok} ${className}`} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        {children}
      </select>
    </Field>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, Shared {}
export function Textarea({ label, error, hint, wrapperClassName, className = '', id, required, rows = 3, ...rest }: TextareaProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Field label={label} htmlFor={fid} error={error} hint={hint} required={required} className={wrapperClassName}>
      <textarea id={fid} rows={rows} required={required} aria-invalid={!!error} aria-describedby={describedBy(fid, error, hint)} className={`${control} py-2 ${error ? bad : ok} ${className}`} {...rest} />
    </Field>
  );
}
