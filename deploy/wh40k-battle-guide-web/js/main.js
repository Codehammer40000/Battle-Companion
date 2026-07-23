import { createInitialGuideState, guideReducer } from './guide/guideState.js';
import { renderGuide } from './guideRender.js';

function showBootError(err) {
  const root = document.getElementById('root');
  const msg = err && err.message ? err.message : String(err);
  const stack = err && err.stack ? '<pre style="font-size:11px;margin-top:1rem;white-space:pre-wrap;color:#a8a29e">' + err.stack + '</pre>' : '';
  if (root) {
    root.innerHTML =
      '<div style="padding:2rem;font-family:monospace;color:#f87171;min-height:100vh">' +
      '<h2 style="color:#fbbf24">Battle Companion failed to start</h2>' +
      '<p>' + msg + '</p>' + stack +
      '<p style="color:#a8a29e;margin-top:1rem">Try running build.bat, then launch-offline.bat again.</p></div>';
  }
}

try {
  let state = createInitialGuideState();
  state = guideReducer(state, { type: 'RESTORE' });

  function dispatch(action) {
    state = guideReducer(state, action);
    if (action.type !== 'RESTORE') {
      state = guideReducer(state, { type: 'SAVE' });
    }
    renderGuide(document.getElementById('root'), state, dispatch);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => renderGuide(document.getElementById('root'), state, dispatch));
  } else {
    renderGuide(document.getElementById('root'), state, dispatch);
  }
} catch (err) {
  showBootError(err);
}
