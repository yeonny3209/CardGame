import { describe, expect, it } from 'vitest';
import { find, optionIndex, scenario } from './harness';

const uidOf = (duel: { cards: { uid: number; def: { id: string } }[] }, id: string) => duel.cards.find((c) => c.def.id === id)!.uid;

describe('Tidecall Mermaid', () => {
  it('its own effect Special Summons from the hand and the Mermaid stays on the field', async () => {
    const { duel, run } = scenario(0, [{ hand: ['tide_mermaid', 'tide_diver'] }, {}], [
      (req, d) => {
        if (req.type === 'action') {
          const i = optionIndex(req, (o) => o.kind === 'normalSummon' && o.uid === uidOf(d, 'tide_mermaid'));
          return i >= 0 ? i : undefined;
        }
        if (req.type === 'yesno') return true;
        return undefined;
      },
      () => undefined,
    ]);
    await run(1);
    expect(find(duel, 'tide_mermaid', 0)[0].location).toBe('mzone');
    expect(find(duel, 'tide_diver', 0)[0].location).toBe('mzone');
    expect(duel.players[0].gy).toHaveLength(0);
  });

  it('an Xyz Monster using its material as a cost sends it to the GY, and the log names the card', async () => {
    const { duel, run } = scenario(
      0,
      [
        { field: [{ id: 'tide_mermaid', loc: 'mzone' }, { id: 'tide_diver', loc: 'mzone' }], extra: ['tide_leviathan'] },
        { field: [{ id: 'gen_ogre', loc: 'mzone' }] },
      ],
      [
        (req, d) => {
          if (req.type === 'action') {
            let i = optionIndex(req, (o) => o.kind === 'extraSummon');
            if (i < 0) i = optionIndex(req, (o) => o.kind === 'activate' && o.uid === uidOf(d, 'tide_leviathan'));
            return i >= 0 ? i : undefined;
          }
          if (req.type === 'select' && req.purpose === 'material') return req.min === 0 ? [] : [req.candidates[0]];
          if (req.type === 'select' && req.purpose === 'cost') return [uidOf(d, 'tide_mermaid')];
          return undefined;
        },
        () => undefined,
      ],
    );
    await run(1);
    const leviathan = find(duel, 'tide_leviathan', 0)[0];
    expect(leviathan.location).toBe('mzone');
    expect(find(duel, 'tide_mermaid', 0)[0].location).toBe('gy');
    expect(leviathan.overlay.map((u) => duel.card(u).def.id)).toEqual(['tide_diver']);
    expect(duel.log.some((l) => l.text.includes('「타이드콜 머메이드」') && l.text.includes('떼어내') && l.text.includes('묘지'))).toBe(true);
  });
});
