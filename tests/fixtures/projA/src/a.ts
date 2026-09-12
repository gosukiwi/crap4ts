export function simple(x: number): number {
  return x + 1;
}

export function risky(x: number): number {
  let r = 0;
  if (x > 0) {
    r += 1;
  } else {
    r += 2;
  }
  for (let i = 0; i < x; i++) {
    r += i;
  }
  while (r > 100) {
    r -= 10;
  }
  return x > 1 && x < 10 ? r : 0;
}
