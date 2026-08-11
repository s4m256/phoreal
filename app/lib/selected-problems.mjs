const SELECTED_PROBLEM_AREAS = new Map([
  ...[3148, 2850, 40, 3686, 3134, 2442, 4192, 4199, 4562, 3233].map((id) => [String(id), "Mecânica"]),
  ...[4222, 4223, 4558, 3448, 3794, 3868, 3703, 3486, 30, 3042, 320, 19, 3163, 2902].map((id) => [String(id), "Eletromagnetismo"]),
  ...[4557, 4191, 3851, 3732, 3487, 2848, 1928].map((id) => [String(id), "Termodinâmica"]),
]);

export function selectedProblemArea(sourceId) {
  return SELECTED_PROBLEM_AREAS.get(String(sourceId)) ?? null;
}

export function selectedProblemSourceIds() {
  return [...SELECTED_PROBLEM_AREAS.keys()];
}
