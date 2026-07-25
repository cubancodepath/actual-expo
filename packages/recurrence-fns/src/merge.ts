/**
 * K-way merge of already-sorted date generators, dropping duplicate instants.
 * A Schedule built from two rrules that happen to land on the same day yields
 * that day once, which is what rschedule does.
 */
function* merge(generators: Generator<Date>[], ascending: boolean): Generator<Date> {
  const iterators = generators.map((gen) => gen[Symbol.iterator]());
  const peeked = iterators.map((it) => it.next());

  for (;;) {
    let bestIndex = -1;
    let best = 0;

    for (let i = 0; i < peeked.length; i++) {
      const current = peeked[i];
      if (current.done) continue;
      const time = current.value.getTime();
      if (bestIndex === -1 || (ascending ? time < best : time > best)) {
        bestIndex = i;
        best = time;
      }
    }
    if (bestIndex === -1) return;

    yield peeked[bestIndex].value as Date;

    // Advance every generator sitting on this instant, not just the winner.
    for (let i = 0; i < peeked.length; i++) {
      const current = peeked[i];
      if (!current.done && current.value.getTime() === best) {
        peeked[i] = iterators[i].next();
      }
    }
  }
}

export function mergeAscending(generators: Generator<Date>[]): Generator<Date> {
  return merge(generators, true);
}

export function mergeDescending(generators: Generator<Date>[]): Generator<Date> {
  return merge(generators, false);
}
