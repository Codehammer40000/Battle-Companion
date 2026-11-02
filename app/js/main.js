import { createInitialGuideState, guideReducer } from './guide/guideState.js';
import { renderGuide } from './guideRender.js';
import {
  applyMapCamera,
  patchSimChrome,
  syncMapInteractionRuntime,
} from './battleSim/battleSimRender.js';

function showBootError(err) {
  const root = document.getElementById('root');
  const msg = err && err.message ? err.message : String(err);
  const stack = err && err.stack ? '<pre style="font-size:11px;margin-top:1rem;white-space:pre-wrap;color:#a8a29e">' + err.stack + '</pre>' : '';
  if (root) {
    root.innerHTML =
      '<div style="padding:2rem;font-family:monospace;color:#f87171;min-height:100vh">' +
      '<h2 style="color:#fbbf24">Battle Map failed to start</h2>' +
      '<p>' + msg + '</p>' + stack +
      '<p style="color:#a8a29e;margin-top:1rem">Try running build.bat, then launch-offline.bat again.</p></div>';
  }
}

/** Camera-only actions: update SVG transform without remounting the app. */
const CAMERA_ACTIONS = new Set(['MAP_ZOOM', 'MAP_SET_CAMERA', 'MAP_RESET_CAMERA']);

/** Frequent chrome updates that can patch the DOM instead of full remount. */
const PATCH_ACTIONS = new Set([
  'ADJUST_SCORE',
  'SHOW_REMINDER',
  'CLOSE_REMINDER',
  'SPEND_STRATAGEM',
  'UNSPEND_STRATAGEM',
]);

try {
  let state = createInitialGuideState();
  state = guideReducer(state, { type: 'RESTORE' });

  let saveTimer = null;

  function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    state = guideReducer(state, { type: 'SAVE' });
  }

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      state = guideReducer(state, { type: 'SAVE' });
    }, 400);
  }

  window.addEventListener('beforeunload', () => {
    if (saveTimer) flushSave();
  });

  function dispatch(action) {
    if (action.type === 'SAVE') {
      flushSave();
      return;
    }

    state = guideReducer(state, action);

    if (action.type !== 'RESTORE') {
      scheduleSave();
    }

    const root = document.getElementById('root');
    if (!root) return;

    if (CAMERA_ACTIONS.has(action.type)) {
      applyMapCamera(root, state);
      syncMapInteractionRuntime(state, dispatch);
      return;
    }

    if (PATCH_ACTIONS.has(action.type) && patchSimChrome(root, state, dispatch, action)) {
      syncMapInteractionRuntime(state, dispatch);
      return;
    }

    renderGuide(root, state, dispatch);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => renderGuide(document.getElementById('root'), state, dispatch));
  } else {
    renderGuide(document.getElementById('root'), state, dispatch);
  }
} catch (err) {
  showBootError(err);
}
