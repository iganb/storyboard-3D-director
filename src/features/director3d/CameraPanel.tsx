import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDirector3DStore, type CameraRig } from '@/stores/director3dStore';
import { Camera, Trash2, GripHorizontal, ChevronDown, ChevronRight } from 'lucide-react';

interface CameraPanelProps {
  cameraRigs: CameraRig[];
  activeRigId: string | null;
  onSelectRig: (rig: CameraRig) => void;
}

export function CameraPanel({ cameraRigs, activeRigId, onSelectRig }: CameraPanelProps) {
  const { t } = useTranslation();
  const removeCameraRig = useDirector3DStore((s) => s.removeCameraRig);
  const renameCameraRig = useDirector3DStore((s) => s.renameCameraRig);
  const updateRig = useDirector3DStore((s) => s.updateRig);
  const reorderCameraRigs = useDirector3DStore((s) => s.reorderCameraRigs);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);

  const handleRenameSubmit = useCallback(
    (id: string, value: string) => {
      const trimmed = value.trim();
      if (trimmed) {
        renameCameraRig(id, trimmed);
      }
      setEditingId(null);
    },
    [renameCameraRig],
  );

  return (
    <div className="w-56 bg-surface-dark border-l border-border-dark flex flex-col overflow-hidden">
      <div className="h-9 flex items-center px-3 border-b border-border-dark">
        <Camera className="w-3.5 h-3.5 text-text-muted mr-2" />
        <span className="text-xs font-semibold text-text-dark">
          {t('director3d.cameraRigs')}
        </span>
        <span className="ml-auto text-xs text-text-muted">
          {cameraRigs.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {cameraRigs.length === 0 ? (
          <div className="text-xs text-text-muted text-center mt-8 px-2">
            {t('director3d.noCameraRigs')}
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {cameraRigs.map((rig, index) => {
              const isActive = activeRigId === rig.id;
              const isExpanded = expandedId === rig.id;
              const isDragging = dragFromIndex === index;

              return (
                <div
                  key={rig.id}
                  className={`group rounded transition-colors ${
                    isDragging ? 'opacity-50' : ''
                  } ${
                    isActive
                      ? 'bg-accent/15 ring-1 ring-accent/30'
                      : 'hover:bg-bg-dark/60'
                  }`}
                  draggable
                  onDragStart={(event) => {
                    setDragFromIndex(index);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(index));
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    if (dragFromIndex !== null && dragFromIndex !== index) {
                      reorderCameraRigs(dragFromIndex, index);
                      setDragFromIndex(index);
                    }
                  }}
                  onDragEnd={() => {
                    setDragFromIndex(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragFromIndex(null);
                  }}
                >
                  <div
                    className="p-2 cursor-pointer"
                    onClick={() => onSelectRig(rig)}
                  >
                    <div className="flex items-center gap-2">
                      <GripHorizontal className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0 cursor-grab active:cursor-grabbing" />
                      <Camera
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isActive ? 'text-accent' : 'text-text-muted'
                        }`}
                      />

                      {editingId === rig.id ? (
                        <input
                          autoFocus
                          defaultValue={rig.name}
                          className="h-5 flex-1 rounded border border-accent bg-bg-dark px-1 text-[10px] text-text-dark outline-none"
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              handleRenameSubmit(rig.id, event.currentTarget.value);
                            } else if (event.key === 'Escape') {
                              setEditingId(null);
                            }
                          }}
                          onBlur={(event) => {
                            handleRenameSubmit(rig.id, event.target.value);
                          }}
                          onClick={(event) => event.stopPropagation()}
                          onMouseDown={(event) => event.stopPropagation()}
                        />
                      ) : (
                        <span
                          className="text-xs text-text-dark truncate flex-1 cursor-text"
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            setEditingId(rig.id);
                          }}
                          title={t('director3d.renameCamera')}
                        >
                          {rig.name}
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedId(isExpanded ? null : rig.id);
                        }}
                        className="p-0.5 hover:bg-bg-dark/50 rounded transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 text-text-muted" />
                        ) : (
                          <ChevronRight className="w-3 h-3 text-text-muted" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeCameraRig(rig.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-500/20 rounded transition-all"
                        title={t('common.delete')}
                      >
                        <Trash2 className="w-3 h-3 text-text-muted hover:text-red-400" />
                      </button>
                    </div>

                    <div className="mt-1 flex items-center gap-2 text-[10px] text-text-muted pl-5">
                      <span>
                        {t('director3d.fov')}: {Math.round(rig.fov)}°
                      </span>
                      <span>
                        {rig.position.x.toFixed(1)},{rig.position.z.toFixed(1)}
                      </span>
                    </div>

                    {isExpanded && (
                      <div
                        className="mt-2 pl-5 space-y-1.5"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <div className="text-[10px] text-text-muted">
                          <div>pos: {rig.position.x.toFixed(1)}, {rig.position.y.toFixed(1)}, {rig.position.z.toFixed(1)}</div>
                          <div>target: {rig.target.x.toFixed(1)}, {rig.target.y.toFixed(1)}, {rig.target.z.toFixed(1)}</div>
                        </div>
                        <label className="flex items-center gap-2 text-[10px] text-text-muted">
                          <span>{t('director3d.fov')}</span>
                          <input
                            type="range"
                            min={10}
                            max={120}
                            value={Math.round(rig.fov)}
                            onChange={(event) => {
                              updateRig(rig.id, { fov: Number(event.target.value) });
                            }}
                            className="h-3 flex-1"
                          />
                          <span className="w-8 text-right">{Math.round(rig.fov)}°</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
