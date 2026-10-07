import { describe, expect, it } from 'vitest';

import type { OrderMeDto } from '../../api/dto';
import { orderView } from './orderView';

const ME = { seat: 'dual' } as OrderMeDto;

describe('czyimi oczami pokazać kartę zlecenia', () => {
  it('z „Zlecone" prowadzący widzi prowadzenie, nawet gdy zlecenie trafiło też do niego', () => {
    expect(orderView({ leads: true, recipient: ME }, 'zlecone')).toBe('leader');
  });

  it('z „Do mnie" albo z linku bez połowy - adresat, bo zlecenie pyta wtedy jego', () => {
    expect(orderView({ leads: true, recipient: ME }, 'do-mnie')).toBe('recipient');
    expect(orderView({ leads: true, recipient: ME }, null)).toBe('recipient');
  });

  it('sam prowadzący zawsze prowadzi; nikt - nic', () => {
    expect(orderView({ leads: true, recipient: null }, 'do-mnie')).toBe('leader');
    expect(orderView({ leads: false, recipient: null }, 'zlecone')).toBe('none');
  });
});
