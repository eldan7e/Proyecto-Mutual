import { useState, useEffect } from 'react';

export default function EditableAbonoCell({ consumo_id, initialValue, isPeriodoLiquidado, onSave }) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  if (isEditing) {
    return (
      <input
        autoFocus
        type="number"
        value={value}
        onChange={e => setValue(e.target.value)}
        onBlur={() => {
          setIsEditing(false);
          if (Number(value) !== initialValue) {
            onSave(consumo_id, Number(value));
          }
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            setIsEditing(false);
            if (Number(value) !== initialValue) {
              onSave(consumo_id, Number(value));
            }
          } else if (e.key === 'Escape') {
            setIsEditing(false);
            setValue(initialValue);
          }
        }}
        className="premium-input"
        style={{ width: '90px', textAlign: 'right', fontWeight: 700, padding: '4px', height: 'auto', fontSize: '14px', float: 'right' }}
      />
    );
  }

  return (
    <div 
      style={{ fontWeight: 700, cursor: isPeriodoLiquidado ? 'default' : 'pointer' }} 
      title={!isPeriodoLiquidado ? "Doble clic para editar" : ""}
      onDoubleClick={() => {
        if (!isPeriodoLiquidado) {
          setIsEditing(true);
        }
      }}
    >
      ${(initialValue || 0).toLocaleString('es-AR')}
    </div>
  );
}
