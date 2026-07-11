// Falling-match mode. Pure helpers first; mountFalling (the rAF engine) is
// added in a later task.

export function gradeFalling(elapsedMs) {
  if (elapsedMs < 2500) return 'easy';
  if (elapsedMs < 6000) return 'good';
  return 'hard';
}

export function nextDifficulty(cleared) {
  return {
    fallSpeed: Math.min(180, 60 + cleared * 2),
    spawnInterval: Math.max(700, 1800 - cleared * 40),
  };
}

export function isLanded(tileY, tileH, floorY) {
  return tileY + tileH >= floorY;
}
