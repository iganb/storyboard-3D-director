import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { User, Trash2, Move, Rotate3D, Maximize2, Undo2, Lock, Unlock } from 'lucide-react';
import { useDirector3DStore } from '@/stores/director3dStore';
import { CHARACTER_PALETTE, getShapeDef } from './shapes';

interface NumberFieldProps {
  label: string;
  value: number;
  step?: number;
  onChange: (val: number) => void;
  onReset?: () => void;
}

function NumberField({ label, value, step = 0.1, onChange, onReset }: NumberFieldProps) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-text-muted w-3 text-right shrink-0">{label}</span>
      <input
        type="number"
        value={Number(value.toFixed(2))}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full h-6 px-1.5 text-[11px] bg-bg-dark rounded border border-border-dark text-text-dark outline-none focus:border-accent/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="p-0.5 rounded hover:bg-bg-dark text-text-muted hover:text-accent transition-colors shrink-0"
          title="Reset"
        >
          <Undo2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

export function CharacterPanel() {
  const { t } = useTranslation();
  const selectedObjectIds = useDirector3DStore((s) => s.selectedObjectIds);
  const sceneObjects = useDirector3DStore((s) => s.sceneObjects);
  const updateObjectTransform = useDirector3DStore((s) => s.updateObjectTransform);
  const resetObjectAxis = useDirector3DStore((s) => s.resetObjectAxis);
  const removeSceneObject = useDirector3DStore((s) => s.removeSceneObject);

  const selected = sceneObjects.find((o) => o.id === selectedObjectIds[0]);

  const handlePositionChange = useCallback(
    (axis: 'x' | 'y' | 'z', val: number) => {
      if (!selected) return;
      updateObjectTransform(selected.id, {
        position: { ...selected.position, [axis]: val },
      });
    },
    [selected, updateObjectTransform],
  );

  const handleRotationChange = useCallback(
    (axis: 'x' | 'y' | 'z', val: number) => {
      if (!selected) return;
      updateObjectTransform(selected.id, {
        rotation: { ...selected.rotation, [axis]: val },
      });
    },
    [selected, updateObjectTransform],
  );

  const [scaleUniform, setScaleUniform] = useState(true);

  const handleBatchColorChange = useCallback(
    (hex: string) => {
      useDirector3DStore.setState((state) => ({
        sceneObjects: state.sceneObjects.map((o) =>
          state.selectedObjectIds.includes(o.id) ? { ...o, color: hex } : o
        ),
      }));
    },
    [],
  );

  const handleBatchDelete = useCallback(() => {
    for (const id of selectedObjectIds) {
      removeSceneObject(id);
    }
  }, [selectedObjectIds, removeSceneObject]);

  // Multi-select (2+ objects)
  if (selectedObjectIds.length > 1) {
    return (
      <div className="w-56 bg-surface-dark border-l border-border-dark flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-9 flex items-center px-3 border-b border-border-dark">
          <User className="w-3.5 h-3.5 text-accent mr-2" />
          <span className="text-xs font-semibold text-text-dark truncate flex-1">
            {t('director3d.multiSelected', { count: selectedObjectIds.length })}
          </span>
          <button
            type="button"
            onClick={handleBatchDelete}
            className="p-0.5 hover:bg-red-500/20 rounded transition-colors"
            title={t('common.delete')}
          >
            <Trash2 className="w-3 h-3 text-text-muted hover:text-red-400" />
          </button>
        </div>

        {/* Batch color */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-1.5 block">
              {t('director3d.color')}
            </label>
            <div className="flex gap-1">
              {CHARACTER_PALETTE.map((c) => {
                const hex = c.color.toString(16).padStart(6, '0');
                return (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => handleBatchColorChange(hex)}
                    className="w-6 h-6 rounded-sm border border-border-dark hover:scale-110 transition-transform"
                    style={{ backgroundColor: `#${hex}` }}
                  />
                );
              })}
            </div>
          </div>
          <p className="text-[10px] text-text-muted leading-relaxed">
            {t('director3d.multiSelectHint')}
          </p>
        </div>
      </div>
    );
  }

  // No selection
  if (!selected) {
    return (
      <div className="w-56 bg-surface-dark border-l border-border-dark flex flex-col overflow-hidden">
        <div className="h-9 flex items-center px-3 border-b border-border-dark">
          <User className="w-3.5 h-3.5 text-text-muted mr-2" />
          <span className="text-xs font-semibold text-text-dark">
            {t('director3d.character')}
          </span>
        </div>
        <div className="flex-1 flex items-center justify-center text-[11px] text-text-muted px-4 text-center">
          {t('director3d.noSelection')}
        </div>
      </div>
    );
  }

  return (
    <div className="w-56 bg-surface-dark border-l border-border-dark flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-9 flex items-center px-3 border-b border-border-dark">
        <User className="w-3.5 h-3.5 text-accent mr-2" />
        <span className="text-xs font-semibold text-text-dark truncate flex-1">
          {selected.label}
        </span>
        <span className="text-[10px] text-text-muted mr-2">
          {getShapeDef(selected.type)?.labelKey ? t(getShapeDef(selected.type)!.labelKey) : selected.type}
        </span>
        <button
          type="button"
          onClick={() => removeSceneObject(selected.id)}
          className="p-0.5 hover:bg-red-500/20 rounded transition-colors"
          title={t('common.delete')}
        >
          <Trash2 className="w-3 h-3 text-text-muted hover:text-red-400" />
        </button>
      </div>

      {/* Properties */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Color */}
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-1.5 block">
            {t('director3d.color')}
          </label>
          <div className="flex gap-1">
            {CHARACTER_PALETTE.map((c) => {
              const hex = c.color.toString(16).padStart(6, '0');
              const isActive = (selected.color ?? '4a90d9') === hex;
              return (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => handleBatchColorChange(hex)}
                  className="w-6 h-6 rounded-sm border border-border-dark hover:scale-110 transition-transform"
                  style={{
                    backgroundColor: `#${hex}`,
                    outline: isActive ? '2px solid var(--accent, rgb(59 130 246))' : undefined,
                    outlineOffset: '1px',
                  }}
                />
              );
            })}
          </div>
        </div>

        {/* Position */}
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-1.5 flex items-center gap-1">
            <Move className="w-3 h-3" />
            {t('director3d.position')}
          </label>
          <div className="space-y-1">
            <NumberField label="X" value={selected.position.x} onChange={(v) => handlePositionChange('x', v)} onReset={() => resetObjectAxis(selected.id, 'position', 'x')} />
            <NumberField label="Y" value={selected.position.y} onChange={(v) => handlePositionChange('y', v)} onReset={() => resetObjectAxis(selected.id, 'position', 'y')} />
            <NumberField label="Z" value={selected.position.z} onChange={(v) => handlePositionChange('z', v)} onReset={() => resetObjectAxis(selected.id, 'position', 'z')} />
          </div>
        </div>

        {/* Rotation */}
        <div>
          <label className="text-[10px] text-text-muted uppercase tracking-wider font-medium mb-1.5 flex items-center gap-1">
            <Rotate3D className="w-3 h-3" />
            {t('director3d.rotation')}
          </label>
          <div className="space-y-1">
            <NumberField label="X" value={selected.rotation.x} onChange={(v) => handleRotationChange('x', v)} onReset={() => resetObjectAxis(selected.id, 'rotation', 'x')} />
            <NumberField label="Y" value={selected.rotation.y} onChange={(v) => handleRotationChange('y', v)} onReset={() => resetObjectAxis(selected.id, 'rotation', 'y')} />
            <NumberField label="Z" value={selected.rotation.z} onChange={(v) => handleRotationChange('z', v)} onReset={() => resetObjectAxis(selected.id, 'rotation', 'z')} />
          </div>
        </div>

        {/* Scale */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] text-text-muted uppercase tracking-wider font-medium flex items-center gap-1">
              <Maximize2 className="w-3 h-3" />
              {t('director3d.scale')}
            </label>
            <button
              type="button"
              onClick={() => setScaleUniform(!scaleUniform)}
              className="p-0.5 rounded hover:bg-bg-dark text-text-muted hover:text-accent transition-colors"
              title={scaleUniform ? t('director3d.nonUniformScale') : t('director3d.uniformScale')}
            >
              {scaleUniform ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            </button>
          </div>
          {scaleUniform ? (
            <NumberField label="S" value={selected.scale.x} step={0.05} onChange={(v) => {
              const val = Math.max(0.01, v);
              updateObjectTransform(selected.id, {
                scale: { x: val, y: val, z: val },
              });
            }} onReset={() => {
              if (selected.initialScale) {
                const s = selected.initialScale;
                updateObjectTransform(selected.id, { scale: { x: s.x, y: s.y, z: s.z } });
              }
            }} />
          ) : (
            <div className="space-y-1">
              <NumberField label="X" value={selected.scale.x} step={0.05} onChange={(v) => {
                updateObjectTransform(selected.id, {
                  scale: { ...selected.scale, x: Math.max(0.01, v) },
                });
              }} onReset={() => {
                if (selected.initialScale) {
                  updateObjectTransform(selected.id, { scale: { ...selected.scale, x: selected.initialScale.x } });
                }
              }} />
              <NumberField label="Y" value={selected.scale.y} step={0.05} onChange={(v) => {
                updateObjectTransform(selected.id, {
                  scale: { ...selected.scale, y: Math.max(0.01, v) },
                });
              }} onReset={() => {
                if (selected.initialScale) {
                  updateObjectTransform(selected.id, { scale: { ...selected.scale, y: selected.initialScale.y } });
                }
              }} />
              <NumberField label="Z" value={selected.scale.z} step={0.05} onChange={(v) => {
                updateObjectTransform(selected.id, {
                  scale: { ...selected.scale, z: Math.max(0.01, v) },
                });
              }} onReset={() => {
                if (selected.initialScale) {
                  updateObjectTransform(selected.id, { scale: { ...selected.scale, z: selected.initialScale.z } });
                }
              }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
