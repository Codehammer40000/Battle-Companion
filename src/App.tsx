import { useReducer } from 'react';
import { BattlefieldCanvas } from './components/BattlefieldCanvas';
import { ControlPanel } from './components/ControlPanel';
import { GameLog } from './components/GameLog';
import { PhaseTracker } from './components/PhaseTracker';
import { createInitialState, gameReducer } from './engine/gameReducer';
import './App.css';

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, undefined, createInitialState);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Warhammer 40,000</h1>
          <p className="subtitle">Tabletop Companion — Core Rules Proof of Concept</p>
        </div>
        {!state.gameStarted && (
          <button type="button" className="start-btn" onClick={() => dispatch({ type: 'START_GAME' })}>
            Begin Battle
          </button>
        )}
        {state.phase === 'game_over' && (
          <span className="game-over">Battle Complete</span>
        )}
      </header>

      <PhaseTracker state={state} />

      <main className="app-main">
        <BattlefieldCanvas
          state={state}
          onSelectUnit={(id) => dispatch({ type: 'SELECT_UNIT', unitId: id })}
          onSelectModel={(id) => dispatch({ type: 'SELECT_MODEL', modelId: id })}
          onMoveModel={(modelId, position) =>
            dispatch({ type: 'MOVE_MODEL', modelId, position })
          }
        />

        <aside className="sidebar">
          <ControlPanel
            state={state}
            onSelectUnit={(id) => dispatch({ type: 'SELECT_UNIT', unitId: id })}
            onSelectTarget={(id) => dispatch({ type: 'SELECT_TARGET', unitId: id })}
            onSetMoveType={(type) => dispatch({ type: 'SET_MOVE_TYPE', moveType: type })}
            onRemainStationary={() => dispatch({ type: 'REMAIN_STATIONARY' })}
            onRollAdvance={() => dispatch({ type: 'ROLL_ADVANCE' })}
            onDeclareCharge={(id) => dispatch({ type: 'DECLARE_CHARGE', targetUnitId: id })}
            onRollCharge={() => dispatch({ type: 'ROLL_CHARGE' })}
            onShoot={(id) => dispatch({ type: 'SHOOT', weaponId: id })}
            onFight={(id) => dispatch({ type: 'FIGHT', weaponId: id })}
            onAdvancePhase={() => dispatch({ type: 'ADVANCE_PHASE' })}
            onToggleLos={() => dispatch({ type: 'TOGGLE_LOS' })}
          />
          <GameLog entries={state.log} />
        </aside>
      </main>

      <footer className="app-footer">
        Based on Warhammer 40,000 Core Rules &amp; Event Companion · 44&quot;×60&quot; battlefield · 5 battle rounds
      </footer>
    </div>
  );
}
