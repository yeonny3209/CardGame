import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '../src/cards/pool';

const NUMS = '①②③④⑤';

function hasFinalConsonant(name: string): boolean {
  const ch = name.charCodeAt(name.length - 1);
  return ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0;
}

describe('card text format (①: ②: style)', () => {
  for (const c of ALL_CARDS) {
    it(c.name, () => {
      if (c.effects.length === 0) {
        expect(c.text).not.toMatch(/[①-⑩]/);
        return;
      }
      const lines = c.text.split('\n');
      const numbered = lines.filter((l) => /^[①-⑩]: /.test(l));
      expect(numbered.length, '효과가 "①: " 형식으로 시작해야 합니다').toBeGreaterThan(0);
      numbered.forEach((l, i) => expect(l[0]).toBe(NUMS[i]));
      // Anything before the first ① is a header line: materials, "…에 필요", or the activation limit.
      expect(lines.findIndex((l) => /^①: /.test(l))).toBeLessThanOrEqual(2);
      expect(c.text).not.toMatch(/프리 체인|이 효과는 1턴에 1번만|의 이 효과는|리버스:|\(타이밍/);

      // Once-per-turn wording must match how the engine limits the effect.
      if (c.effects.some((e) => e.type === 'activate' && e.opt === 'hard')) {
        const particle = hasFinalConsonant(c.name) ? '은' : '는';
        expect(c.text).toContain(`「${c.name}」${particle} 1턴에 1장밖에 발동할 수 없다.`);
      }
      if (c.effects.some((e) => e.type !== 'activate' && e.opt === 'hard')) {
        expect(c.text).toMatch(/1턴에 1번밖에 (사용할|할) 수 없다/);
      }
      if (c.effects.some((e) => e.opt === 'soft')) expect(c.text).toContain('1턴에 1번, ');
      if (c.effects.some((e) => e.type === 'quick' && e.damageStep)) expect(c.text).toContain('데미지 스텝에도 발동할 수 있다');
      if (c.effects.some((e) => e.type === 'quick' && !e.range)) expect(c.text).toMatch(/상대 턴/);
    });
  }
});
