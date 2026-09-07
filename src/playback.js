import { FRAME_STEPS } from './constants.js';

/** Shared transport semantics for buttons, keyboard, charts and restored views. */
export function playbackAction(controller, action, value) {
  if (!controller) return;
  switch (action) {
    case 'play':
      controller.play();
      break;
    case 'stop':
      controller.stop();
      break;
    case 'toggle':
      if (controller.isPlaying()) controller.stop();
      else controller.play();
      break;
    case 'seek':
      controller.stop();
      controller.setTime(value);
      break;
    case 'reset':
      controller.stop();
      controller.setTime(controller.getTimelineRange().min);
      break;
    case 'mode':
    case 'changeMode':
      controller.setMode(value);
      break;
    case 'step': {
      if (!Number.isFinite(value) || value === 0) return;
      controller.stop();
      if (controller.getDataKind() === 'response') {
        controller.stepResponseFrame(value);
        return;
      }
      const period = controller.getPeriod();
      if (period <= 0) return;
      const next = controller.getTime() + period / FRAME_STEPS * Math.sign(value);
      controller.setTime(((next % period) + period) % period);
      break;
    }
  }
}
