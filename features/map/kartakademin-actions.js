import { serializeMask } from './kartakademin-mask.js';

export const FREE_SIGHT_RESET_CONFIRMATION = 'Vill du ta bort all markerad fri sikt på den här kartan? Hela kartan kommer att återgå till Solid. Ljuskällor, rum och andra kartlager påverkas inte.';
export const FREE_SIGHT_RESET_LABEL = 'Nollställ fri sikt';

export async function resetFreeSight(mask, history, config, confirm) {
  if (!await confirm()) return false;
  const before = mask.cells.slice();
  mask.cells.fill(0);
  history.record(before);
  config.freeSight = serializeMask(mask);
  return true;
}

export function removalConfirmation(mode, tool) {
  if (mode === 'lights' && tool === 'light') return {
    message: 'Vill du ta bort den valda ljuskällan? Fri sikt, rum och andra kartlager påverkas inte.',
    actionLabel: 'Ta bort ljuskälla',
  };
  if (mode === 'sight' && tool === 'geometry') return {
    message: 'Vill du ta bort den valda hindergeometrin? Fri sikt, ljuskällor, rum och andra kartlager påverkas inte.',
    actionLabel: 'Ta bort hindergeometri',
  };
  if (mode === 'lights' && tool === 'position') return {
    message: 'Vill du ta bort den valda rollpersonens kartposition? Rollpersonen och övriga kartdata påverkas inte.',
    actionLabel: 'Ta bort kartposition',
  };
  return null;
}
