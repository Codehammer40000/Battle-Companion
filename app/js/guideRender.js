/**
 * App shell entry — Battle Map only (Companion UI removed in Phase C).
 */
import { renderBattleSim } from './battleSim/battleSimRender.js';

export function renderGuide(root, state, dispatch) {
  renderBattleSim(root, state, dispatch);
}
