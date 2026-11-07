import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

export interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, error, hint, required, children, className = '' }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}{required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-soft">{hint}</p>}
      {error && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

const control = 'w-full min-h-11 rounded-lg border bg-white px-3 text-base text-ink placeholder:text-ink-soft/60 focus-visible:border-pitch disabled:bg-chalk disabled:text-ink-soft';
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
      <input id={fid} required={required} aria-invalid={!!error} className={`${control} ${error ? bad : ok} ${className}`} {...rest} />
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
      <select id={fid} required={required} aria-invalid={!!error} className={`${control} ${error ? bad : ok} ${className}`} {...rest}>
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
      <textarea id={fid} rows={rows} required={required} aria-invalid={!!error} className={`${control} py-2 ${error ? bad : ok} ${className}`} {...rest} />
    </Field>
  );
}
