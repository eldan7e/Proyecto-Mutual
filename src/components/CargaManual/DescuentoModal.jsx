import React, { useState, useEffect } from 'react';
import { Tag, Calendar, Check, X, Percent, DollarSign, PlusCircle, MinusCircle, Trash2 } from 'lucide-react';
import Modal from '../Modal';

export default function DescuentoModal({ isOpen, onClose, row, onApply }) {
  const [tipoAjuste, setTipoAjuste] = useState('DESCUENTO'); // 'DESCUENTO' | 'CARGO'
  const [esPorcentaje, setEsPorcentaje] = useState(true);
  const [valor, setValor] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [esDuradero, setEsDuradero] = useState(true);
  const [cuotas, setCuotas] = useState(12);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (row && isOpen) {
      const ad = row.adicionales && row.adicionales.length > 0 ? row.adicionales[0] : null;
      const dPct = row.currentDiscountPct !== undefined ? Number(row.currentDiscountPct) : Number(row.desc_adicionales || 0);
      const bMan = Number(row.bonifManual || 0);

      const isPct = ad ? (ad.tipo === 'DESCUENTO' || ad.tipo === 'CARGO_PCT') : (dPct !== 0 || bMan === 0);
      const isDesc = ad ? (ad.tipo === 'DESCUENTO') : (dPct >= 0 && bMan >= 0);

      let v = '';
      if (ad && ad.valor) {
        v = String(ad.valor);
      } else if (dPct !== 0) {
        v = String(Math.abs(dPct));
      } else if (bMan !== 0) {
        v = String(Math.abs(bMan));
      } else {
        v = '10'; // default sugerido cuando es nuevo
      }

      setTipoAjuste(isDesc ? 'DESCUENTO' : 'CARGO');
      setEsPorcentaje(isPct);
      setValor(v);
      setDescripcion(ad?.descripcion || '');
      setEsDuradero(ad ? (ad.total_cuotas > 1) : true);
      setCuotas(ad?.total_cuotas || 12);
    }
  }, [row, isOpen]);

  if (!isOpen || !row) return null;

  const isDescuento = tipoAjuste === 'DESCUENTO';
  const mainColor = isDescuento ? '#16a34a' : '#c2410c';
  const mainBg = isDescuento ? 'rgba(16, 185, 129, 0.1)' : 'rgba(249, 115, 22, 0.1)';

  const hasExistingDiscount = (row.currentDiscountPct && Number(row.currentDiscountPct) !== 0) ||
    (row.bonifManual && Number(row.bonifManual) !== 0) ||
    (row.adicionales && row.adicionales.length > 0) ||
    (row.desc_adicionales && Number(row.desc_adicionales) !== 0);

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      await onApply({
        linea: row.numero_linea || row.linea,
        socioId: row.socioId || row.lineas?.socio_id,
        consumoId: row.consumo_id || row.consumoId,
        action: 'DELETE'
      });
      onClose();
    } catch (err) {
      console.error("Error al eliminar descuento/cargo:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!valor || isNaN(Number(valor)) || Number(valor) <= 0) return;
    setIsSubmitting(true);
    try {
      let finalTipo = tipoAjuste;
      if (!isDescuento && esPorcentaje) {
        finalTipo = 'CARGO_PCT';
      }

      await onApply({
        linea: row.numero_linea || row.linea,
        socioId: row.socioId || row.lineas?.socio_id,
        consumoId: row.consumo_id || row.consumoId,
        tipo: finalTipo,
        valor: Number(valor),
        esPorcentaje,
        esDuradero,
        cuotas: esDuradero ? Number(cuotas) : 1,
        descripcion: descripcion || `${isDescuento ? 'Descuento' : 'Cargo'} ${valor}${esPorcentaje ? '%' : '$'}`
      });
      onClose();
    } catch (err) {
      console.error("Error al aplicar descuento/cargo:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Aplicar Descuento / Cargo — Línea ${row.numero_linea || row.linea}`}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px' }}>
        <div style={{ background: 'var(--surface-light)', padding: '12px 16px', borderRadius: '10px', fontSize: '13px', border: '1px solid var(--border-light)' }}>
          <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>
            Socio: {row.socioNombre || row.lineas?.socios?.nombre_completo || 'Sin socio'}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '2px' }}>
            Plan: {row.planOficial || row.plan || row.lineas?.planes_abonos?.nombre_plan || 'S/D'} • Abono actual: ${Number(row.abono || row.calculado?.baseAb || 0).toLocaleString('es-AR')}
          </div>
        </div>

        {/* Selección Tipo de Ajuste: Descuento (-) vs Cargo Adicional (+) */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Tipo de Ajuste
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={() => { setTipoAjuste('DESCUENTO'); if (valor === '') setValor('80'); }}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: `2px solid ${isDescuento ? '#16a34a' : 'var(--border-light)'}`,
                background: isDescuento ? 'rgba(22, 163, 74, 0.1)' : 'var(--surface)',
                color: isDescuento ? '#16a34a' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <MinusCircle size={16} /> Descuento (-)
            </button>

            <button
              type="button"
              onClick={() => { setTipoAjuste('CARGO'); if (valor === '80') setValor(''); }}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: `2px solid ${!isDescuento ? '#c2410c' : 'var(--border-light)'}`,
                background: !isDescuento ? 'rgba(249, 115, 22, 0.1)' : 'var(--surface)',
                color: !isDescuento ? '#c2410c' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              <PlusCircle size={16} /> Cargo Adicional (+)
            </button>
          </div>
        </div>

        {/* Modos: Porcentaje vs Monto Fijo */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={() => { setEsPorcentaje(true); }}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: `2px solid ${esPorcentaje ? mainColor : 'var(--border-light)'}`,
              background: esPorcentaje ? mainBg : 'var(--surface)',
              color: esPorcentaje ? mainColor : 'var(--text-secondary)',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Percent size={16} /> Porcentaje (%)
          </button>

          <button
            type="button"
            onClick={() => { setEsPorcentaje(false); }}
            style={{
              flex: 1,
              padding: '10px',
              borderRadius: '8px',
              border: `2px solid ${!esPorcentaje ? mainColor : 'var(--border-light)'}`,
              background: !esPorcentaje ? mainBg : 'var(--surface)',
              color: !esPorcentaje ? mainColor : 'var(--text-secondary)',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <DollarSign size={16} /> Monto Fijo ($)
          </button>
        </div>

        {/* Input de Valor */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            {isDescuento 
              ? (esPorcentaje ? 'Porcentaje de Descuento (%)' : 'Monto del Descuento ($)')
              : (esPorcentaje ? 'Porcentaje de Recargo Adicional (%)' : 'Monto del Cargo Adicional ($)')
            }
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max={esPorcentaje ? "100" : undefined}
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={esPorcentaje ? "Ej: 80" : "Ej: 1500"}
            required
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: `1px solid ${mainColor}`,
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              fontSize: '15px',
              fontWeight: 800,
              outline: 'none'
            }}
          />
        </div>

        {/* Descripción */}
        <div>
          <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Descripción / Motivo
          </label>
          <input
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder={isDescuento ? "Ej: Descuento acordado 80% operadora" : "Ej: Cargo por equipo / servicio"}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: '8px',
              border: '1px solid var(--border-light)',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              outline: 'none'
            }}
          />
        </div>

        {/* Duración del Descuento / Cargo */}
        <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '12px', marginTop: '4px' }}>
          <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
            Duración de la Aplicación en Auditoría
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
              <input
                type="radio"
                name="duracion"
                checked={!esDuradero}
                onChange={() => setEsDuradero(false)}
              />
              <span style={{ color: 'var(--text-primary)' }}>
                Solo período en curso (Aplica una sola vez en la auditoría/liquidación actual)
              </span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 700 }}>
              <input
                type="radio"
                name="duracion"
                checked={esDuradero}
                onChange={() => setEsDuradero(true)}
              />
              <span style={{ color: 'var(--text-primary)' }}>
                Duradero de más de 1 período (Registra en <strong>Descuentos y Cargos</strong>)
              </span>
            </label>

            {esDuradero && (
              <div style={{ marginLeft: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Cantidad de meses / cuotas:</span>
                <input
                  type="number"
                  min="2"
                  max="60"
                  value={cuotas}
                  onChange={(e) => setCuotas(e.target.value)}
                  style={{
                    width: '70px',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    fontSize: '13px',
                    fontWeight: 800
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Botones del Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginTop: '12px' }}>
          {hasExistingDiscount ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isSubmitting}
              className="air-btn"
              style={{
                background: '#fee2e2',
                color: '#dc2626',
                border: '1px solid #fca5a5',
                fontWeight: 800,
                fontSize: '13px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              <Trash2 size={16} /> Eliminar Descuento
            </button>
          ) : <div />}

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              className="air-btn"
              style={{
                background: 'var(--surface-light, #f1f5f9)',
                border: '1px solid var(--border-light, #cbd5e1)',
                color: 'var(--text-primary, #334155)',
                fontWeight: 700,
                fontSize: '13px',
                padding: '10px 18px',
                borderRadius: '10px',
                cursor: 'pointer'
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="air-btn"
              style={{
                background: mainColor,
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '13px',
                padding: '10px 20px',
                borderRadius: '10px',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
              }}
            >
              {isSubmitting ? 'Guardando...' : `Guardar ${isDescuento ? 'Descuento' : 'Cargo'}`}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
