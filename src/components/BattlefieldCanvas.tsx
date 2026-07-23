import { useMemo } from 'react';
import type { GameState } from '../types/game';
import { BATTLEFIELD_HEIGHT, BATTLEFIELD_WIDTH, PIXELS_PER_INCH } from '../types/game';
import { getLosPreview } from '../engine/los';

interface Props {
  state: GameState;
  onSelectUnit: (unitId: string) => void;
  onSelectModel: (modelId: string) => void;
  onMoveModel: (modelId: string, position: { x: number; y: number }) => void;
}

const SCALE = PIXELS_PER_INCH;

function toPx(inches: number): number {
  return inches * SCALE;
}

export function BattlefieldCanvas({
  state,
  onSelectUnit,
  onSelectModel,
  onMoveModel,
}: Props) {
  const width = toPx(BATTLEFIELD_WIDTH);
  const height = toPx(BATTLEFIELD_HEIGHT);

  const losLine = useMemo(() => {
    if (!state.showLos || !state.selectedUnitId || !state.selectedTargetUnitId) return null;
    const shooter = state.units.find((u) => u.id === state.selectedUnitId);
    const target = state.units.find((u) => u.id === state.selectedTargetUnitId);
    if (!shooter || !target) return null;
    const sModel = shooter.models.find((m) => m.woundsRemaining > 0);
    const tModel = target.models.find((m) => m.woundsRemaining > 0);
    if (!sModel || !tModel) return null;
    return getLosPreview(
      sModel,
      tModel,
      shooter,
      target,
      state.battlefield.terrainAreas,
      state.battlefield.terrainFeatures,
      state.units,
    );
  }, [state]);

  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / SCALE;
    const y = (e.clientY - rect.top) / SCALE;

    if (state.selectedModelId && (state.phase === 'movement' || state.phase === 'charge')) {
      onMoveModel(state.selectedModelId, { x, y });
      return;
    }

    for (const unit of state.units) {
      for (const model of unit.models) {
        if (model.woundsRemaining <= 0) continue;
        const dx = x - model.position.x;
        const dy = y - model.position.y;
        if (Math.sqrt(dx * dx + dy * dy) <= model.baseRadius) {
          onSelectUnit(unit.id);
          onSelectModel(model.id);
          return;
        }
      }
    }
  };

  return (
    <div className="battlefield-wrapper">
      <svg
        className="battlefield-canvas"
        viewBox={`0 0 ${width} ${height}`}
        onClick={handleCanvasClick}
      >
        <defs>
          <pattern id="grid" width={toPx(1)} height={toPx(1)} patternUnits="userSpaceOnUse">
            <path
              d={`M ${toPx(1)} 0 L 0 0 0 ${toPx(1)}`}
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>

        <rect width={width} height={height} fill="#1a1410" />
        <rect width={width} height={height} fill="url(#grid)" />

        {state.battlefield.deploymentZones.map((zone) => (
          <rect
            key={zone.role}
            x={toPx(zone.bounds.x)}
            y={toPx(zone.bounds.y)}
            width={toPx(zone.bounds.w)}
            height={toPx(zone.bounds.h)}
            fill={zone.role === 'attacker' ? 'rgba(59,130,246,0.08)' : 'rgba(239,68,68,0.08)'}
            stroke={zone.role === 'attacker' ? 'rgba(59,130,246,0.3)' : 'rgba(239,68,68,0.3)'}
            strokeWidth={1}
            strokeDasharray="6 4"
          />
        ))}

        <text x={toPx(2)} y={toPx(6)} fill="rgba(147,197,253,0.6)" fontSize={10} fontFamily="Inter">
          ATTACKER DEPLOYMENT
        </text>
        <text x={toPx(2)} y={toPx(56)} fill="rgba(252,165,165,0.6)" fontSize={10} fontFamily="Inter">
          DEFENDER DEPLOYMENT
        </text>
        <text x={toPx(18)} y={toPx(30)} fill="rgba(255,255,255,0.15)" fontSize={12} fontFamily="Cinzel">
          NO MAN&apos;S LAND
        </text>

        {state.battlefield.terrainAreas.map((area) => (
          <g key={area.id}>
            <rect
              x={toPx(area.bounds.x)}
              y={toPx(area.bounds.y)}
              width={toPx(area.bounds.w)}
              height={toPx(area.bounds.h)}
              fill={
                area.isObjective
                  ? 'rgba(234,179,8,0.12)'
                  : area.category === 'dense'
                    ? 'rgba(34,197,94,0.1)'
                    : 'rgba(250,204,21,0.08)'
              }
              stroke={
                area.isObjective
                  ? 'rgba(234,179,8,0.5)'
                  : area.category === 'dense'
                    ? 'rgba(34,197,94,0.35)'
                    : 'rgba(250,204,21,0.3)'
              }
              strokeWidth={area.isObjective ? 2 : 1}
              rx={2}
            />
            {area.label && (
              <text
                x={toPx(area.bounds.x + area.bounds.w / 2)}
                y={toPx(area.bounds.y + area.bounds.h / 2)}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="rgba(255,255,255,0.35)"
                fontSize={8}
                fontFamily="Inter"
              >
                {area.label}
              </text>
            )}
          </g>
        ))}

        {state.battlefield.terrainFeatures
          .filter((f) => f.solid)
          .map((f) => (
            <rect
              key={f.id}
              x={toPx(f.bounds.x)}
              y={toPx(f.bounds.y)}
              width={toPx(f.bounds.w)}
              height={toPx(f.bounds.h)}
              fill="rgba(0,0,0,0.35)"
              stroke="rgba(34,197,94,0.5)"
              strokeWidth={1}
            />
          ))}

        {losLine && (
          <line
            x1={toPx(losLine.from.x)}
            y1={toPx(losLine.from.y)}
            x2={toPx(losLine.to.x)}
            y2={toPx(losLine.to.y)}
            stroke={losLine.visible ? '#4ade80' : '#ef4444'}
            strokeWidth={2}
            strokeDasharray={losLine.visible ? 'none' : '6 4'}
            opacity={0.9}
          />
        )}

        {state.units.map((unit) =>
          unit.models.map((model) => {
            if (model.woundsRemaining <= 0) return null;
            const isSelected =
              state.selectedUnitId === unit.id || state.selectedModelId === model.id;
            const color = unit.player === 'player1' ? '#3b82f6' : '#22c55e';
            const r = toPx(model.baseRadius);
            return (
              <g key={model.id}>
                <circle
                  cx={toPx(model.position.x)}
                  cy={toPx(model.position.y)}
                  r={r}
                  fill={color}
                  fillOpacity={0.35}
                  stroke={isSelected ? '#fbbf24' : color}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                />
                <text
                  x={toPx(model.position.x)}
                  y={toPx(model.position.y)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize={7}
                  fontFamily="Inter"
                  fontWeight={600}
                  pointerEvents="none"
                >
                  {model.isCharacter ? '★' : '●'}
                </text>
              </g>
            );
          }),
        )}
      </svg>
      <div className="battlefield-scale">44&quot; × 60&quot; · 1&quot; = {SCALE}px</div>
    </div>
  );
}
