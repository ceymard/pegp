

import {
  Re, S, _, Either
} from '../src/rule'


const 
  NUM = Re(/[0-9]+(\.[0-9+])/).transform(res => parseFloat(res.string)),
  PLUS = S('+'),
  MINUS = S('-'),
  STAR = S('*'),
  SLASH = S('/'),
  LPAREN = S('('),
  RPAREN = S(')'),
  PAREN = Either(
    _(LPAREN, NUM, RPAREN).transform(([lp, add, rp]) => add),
    NUM
  ),
  MULT = _(PAREN, Either(STAR, SLASH).transform(a => a.string), PAREN)
    .transform(([lhs, op, rhs]) => lhs - rhs)

const ADD = _(MULT, Either(PLUS, MINUS).transform(a => a.string), MULT)
    .transform(([lhs, op, rhs]) => op === '+' ? lhs + rhs : lhs - rhs)
