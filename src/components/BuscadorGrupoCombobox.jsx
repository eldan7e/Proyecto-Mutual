import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronDown, Check, Phone, Users, AlertCircle, Loader2 } from 'lucide-react';

/**
 * Normaliza una cadena removiendo tildes, mayúsculas y caracteres especiales.
 */
function normalizar(texto) {
  if (!texto) return '';
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Buscador Inteligente de Grupo / Socio Titular
 * Permite buscar en tiempo real por número de grupo, nombre o apellido.
 */
export default function BuscadorGrupoCombobox({
  grupos = [],
  value = null,
  onChange,
  placeholder = 'Buscar por N° grupo, nombre o apellido...',
  disabled = false,
  required = false,
  autoFocus = false,
  style = {}
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Buscar el grupo actualmente seleccionado
  const selectedGrupo = useMemo(() => {
    if (value === null || value === undefined || value === '') return null;
    return grupos.find(g => Number(g.numero_grupo) === Number(value)) || null;
  }, [grupos, value]);

  // Sincronizar el texto del input cuando cambia la selección externa o al abrir
  useEffect(() => {
    if (selectedGrupo) {
      setQuery(`Grupo #${selectedGrupo.numero_grupo} - ${selectedGrupo.nombre}`);
    } else if (!value) {
      setQuery('');
    }
  }, [selectedGrupo, value]);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        // Si no hay nada seleccionado, limpiar el query; si hay selección, restaurar su etiqueta
        if (selectedGrupo) {
          setQuery(`Grupo #${selectedGrupo.numero_grupo} - ${selectedGrupo.nombre}`);
        } else {
          setQuery('');
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedGrupo]);

  // Filtrado y ranking inteligente de grupos
  const filteredGrupos = useMemo(() => {
    if (!grupos || grupos.length === 0) return [];

    const raw = normalizar(query);
    // Eliminar prefijos comunes como "grupo", "g", "#"
    const clean = raw.replace(/^grupo\s*#?|^g\s*#?|^#/, '').trim();

    // Si el usuario no ha escrito nada o el input coincide con la selección actual, mostrar todos ordenados
    const isShowingCurrentSelection = selectedGrupo && query === `Grupo #${selectedGrupo.numero_grupo} - ${selectedGrupo.nombre}`;
    if (!clean || isShowingCurrentSelection) {
      return grupos.slice(0, 50);
    }

    const tokens = clean.split(/\s+/).filter(Boolean);

    const matches = [];

    for (const g of grupos) {
      const numStr = String(g.numero_grupo || '');
      const nombreNorm = normalizar(g.nombre || '');
      const extras = (g.socios_adicionales || []).map(normalizar);
      const allText = `${numStr} ${nombreNorm} ${extras.join(' ')}`;

      // Verificar que todos los términos de búsqueda coincidan
      const allMatch = tokens.every(t => allText.includes(t));

      if (allMatch) {
        let score = 0;

        // 1. Coincidencia exacta o inicial por número de grupo
        if (numStr === clean) {
          score += 2000;
        } else if (numStr.startsWith(clean)) {
          score += 1000;
        } else if (numStr.includes(clean)) {
          score += 400;
        }

        // 2. Coincidencia por nombre / apellido
        if (nombreNorm.startsWith(clean)) {
          score += 500;
        } else if (nombreNorm.includes(clean)) {
          score += 200;
        }

        // 3. Coincidencia por socios secundarios
        for (const ext of extras) {
          if (ext.includes(clean)) {
            score += 100;
            break;
          }
        }

        matches.push({ g, score });
      }
    }

    // Ordenar de mayor a menor puntuación, y luego por número de grupo
    matches.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.g.numero_grupo || 0) - (b.g.numero_grupo || 0);
    });

    return matches.slice(0, 60).map(m => m.g);
  }, [grupos, query, selectedGrupo]);

  // Asegurar que highlightedIndex esté dentro de los límites
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredGrupos]);

  // Scroll automático hacia el elemento resaltado
  useEffect(() => {
    if (isOpen && listRef.current) {
      const activeEl = listRef.current.children[highlightedIndex];
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Seleccionar un grupo
  const handleSelect = (g) => {
    if (!g) return;
    onChange(g.numero_grupo, g);
    setQuery(`Grupo #${g.numero_grupo} - ${g.nombre}`);
    setIsOpen(false);
  };

  // Limpiar selección
  const handleClear = (e) => {
    e.stopPropagation();
    onChange(null, null);
    setQuery('');
    setIsOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  // Manejo de teclado
  const handleKeyDown = (e) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex(prev => Math.min(prev + 1, filteredGrupos.length - 1));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      } else {
        setHighlightedIndex(prev => Math.max(prev - 1, 0));
      }
    } else if (e.key === 'Enter') {
      if (isOpen && filteredGrupos.length > 0 && filteredGrupos[highlightedIndex]) {
        e.preventDefault();
        handleSelect(filteredGrupos[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      if (selectedGrupo) {
        setQuery(`Grupo #${selectedGrupo.numero_grupo} - ${selectedGrupo.nombre}`);
      }
    }
  };

  return (
    <div 
      ref={containerRef} 
      style={{ 
        position: 'relative', 
        width: '100%',
        ...style 
      }}
    >
      {/* Input oculto para validación obligatoria nativa de formularios HTML */}
      {required && (
        <input
          type="text"
          value={value || ''}
          required={required}
          onChange={() => {}}
          style={{
            position: 'absolute',
            opacity: 0,
            pointerEvents: 'none',
            top: '50%',
            left: '50%',
            width: '1px',
            height: '1px'
          }}
          tabIndex={-1}
        />
      )}

      {/* Contenedor del Campo de Búsqueda */}
      <div 
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          width: '100%'
        }}
      >
        {/* Icono de búsqueda / estado */}
        <div 
          style={{
            position: 'absolute',
            left: '12px',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            color: selectedGrupo ? '#10b981' : 'var(--text-secondary, #94a3b8)',
            zIndex: 2
          }}
        >
          {selectedGrupo ? <Check size={16} strokeWidth={2.5} /> : <Search size={16} />}
        </div>

        {/* Input de texto interactivo */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          disabled={disabled}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onFocus={(e) => {
            setIsOpen(true);
            e.target.select();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          className="form-input"
          style={{
            width: '100%',
            height: '42px',
            paddingLeft: '38px',
            paddingRight: (query || selectedGrupo) ? '64px' : '36px',
            fontSize: '13.5px',
            fontWeight: selectedGrupo ? 800 : 600,
            color: selectedGrupo ? 'var(--text-primary, #0f172a)' : 'inherit',
            borderColor: selectedGrupo ? '#10b981' : (isOpen ? 'var(--accent, #059669)' : undefined),
            background: selectedGrupo ? 'rgba(16, 185, 129, 0.03)' : 'var(--surface, #ffffff)',
            borderRadius: '10px',
            transition: 'all 0.15s ease'
          }}
        />

        {/* Botones de acción derecha (Limpiar + Toggle) */}
        <div 
          style={{
            position: 'absolute',
            right: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            zIndex: 2
          }}
        >
          {(query || selectedGrupo) && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              title="Borrar y buscar otro grupo"
              style={{
                background: 'rgba(0,0,0,0.06)',
                border: 'none',
                borderRadius: '50%',
                width: '22px',
                height: '22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: 'var(--text-secondary, #64748b)',
                transition: 'background 0.15s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.06)'}
            >
              <X size={13} />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (!disabled) {
                setIsOpen(prev => !prev);
                inputRef.current?.focus();
              }
            }}
            style={{
              background: 'transparent',
              border: 'none',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              cursor: disabled ? 'not-allowed' : 'pointer',
              color: 'var(--text-secondary, #94a3b8)'
            }}
          >
            <ChevronDown 
              size={16} 
              style={{ 
                transform: isOpen ? 'rotate(180deg)' : 'none', 
                transition: 'transform 0.2s ease' 
              }} 
            />
          </button>
        </div>
      </div>

      {/* Menú Flotante de Resultados */}
      {isOpen && !disabled && (
        <div
          ref={listRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: '290px',
            overflowY: 'auto',
            background: 'var(--surface, #ffffff)',
            border: '1px solid var(--border-light, #e2e8f0)',
            borderRadius: '12px',
            boxShadow: '0 12px 28px -4px rgba(0, 0, 0, 0.18), 0 6px 12px -2px rgba(0, 0, 0, 0.08)',
            zIndex: 9999,
            padding: '4px'
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {grupos.length === 0 ? (
            <div 
              style={{
                padding: '16px',
                textAlign: 'center',
                color: 'var(--text-secondary, #64748b)',
                fontSize: '12.5px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <Loader2 size={16} className="animate-spin" color="var(--accent, #059669)" />
              <span>Cargando lista de grupos...</span>
            </div>
          ) : filteredGrupos.length === 0 ? (
            <div 
              style={{
                padding: '16px',
                textAlign: 'center',
                color: 'var(--text-secondary, #64748b)',
                fontSize: '12.5px'
              }}
            >
              <AlertCircle size={20} style={{ margin: '0 auto 6px', color: '#f59e0b', opacity: 0.8 }} />
              <div>No se encontró ningún grupo o socio con <strong>"{query}"</strong></div>
              <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.8 }}>
                Pruebe buscando por número de grupo (ej: 104) o por apellido/nombre.
              </div>
            </div>
          ) : (
            filteredGrupos.map((g, index) => {
              const isSelected = selectedGrupo?.numero_grupo === g.numero_grupo;
              const isHighlighted = highlightedIndex === index;

              return (
                <div
                  key={g.numero_grupo}
                  onClick={() => handleSelect(g)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    background: isSelected 
                      ? 'rgba(16, 185, 129, 0.12)' 
                      : (isHighlighted ? 'rgba(0, 0, 0, 0.04)' : 'transparent'),
                    border: isSelected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                    transition: 'background 0.1s ease',
                    marginBottom: '2px',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                    {/* Badge de Número de Grupo */}
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: 900,
                        background: isSelected ? '#10b981' : '#f1f5f9',
                        color: isSelected ? '#ffffff' : '#334155',
                        border: isSelected ? 'none' : '1px solid #cbd5e1',
                        letterSpacing: '0.3px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Grupo #{g.numero_grupo}
                    </span>

                    {/* Nombre y detalles */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div 
                        style={{
                          fontSize: '13px',
                          fontWeight: isSelected ? 800 : 700,
                          color: isSelected ? '#047857' : 'var(--text-primary, #1e293b)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {g.nombre}
                      </div>

                      {/* Socios secundarios asociados al grupo */}
                      {g.socios_adicionales && g.socios_adicionales.length > 0 && (
                        <div 
                          style={{
                            fontSize: '10.5px',
                            color: 'var(--text-secondary, #64748b)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            marginTop: '2px'
                          }}
                        >
                          <Users size={10} style={{ opacity: 0.7 }} />
                          <span>
                            {g.socios_adicionales.slice(0, 2).join(', ')}
                            {g.socios_adicionales.length > 2 ? ` (+${g.socios_adicionales.length - 2})` : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Líneas activas / Checkmark */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {g.total_lineas > 0 && (
                      <span 
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-secondary, #64748b)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          fontWeight: 600
                        }}
                        title={`${g.total_lineas} línea(s) activa(s)`}
                      >
                        <Phone size={10} style={{ opacity: 0.7 }} />
                        {g.total_lineas}
                      </span>
                    )}

                    {isSelected && (
                      <Check size={16} color="#10b981" strokeWidth={2.5} />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
