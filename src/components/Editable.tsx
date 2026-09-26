import { useEffect, useRef, useState } from 'react';
import { Prose } from './bits';

/** Text that renders as prose and can be edited in place (✎). Empty + placeholder shows a hint. */
export function Editable({ value, onSave, placeholder, className, inline, rows = 6 }: {
  value?: string;
  onSave: (v: string) => void;
  placeholder?: string;
  className?: string;
  inline?: boolean;
  rows?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (!editing) setDraft(value ?? ''); }, [value, editing]);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (editing) {
    const save = () => { onSave(draft.trim()); setEditing(false); };
    return (
      <div className={`editable editing ${className ?? ''}`}>
        {inline
          ? <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} autoFocus />
          : <textarea ref={ref} rows={rows} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save(); }} />}
        <div className="form-actions">
          <button className="btn small primary" onClick={save}>Save</button>
          <button className="btn small ghost" onClick={() => setEditing(false)}>Cancel</button>
          {!inline && <span className="muted small">Ctrl+Enter to save · Esc to cancel</span>}
        </div>
      </div>
    );
  }
  return (
    <div className={`editable ${className ?? ''} ${inline ? 'inline' : ''}`}>
      {value ? (inline ? <span>{value}</span> : <Prose text={value} />) : placeholder ? <span className="muted small placeholder">{placeholder}</span> : null}
      <button className="btn icon ghost edit-btn no-print" onClick={() => setEditing(true)} title="Edit text" aria-label="Edit text">✎</button>
    </div>
  );
}
