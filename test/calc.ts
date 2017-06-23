

import {
  S, _, Either, Forward, Rule, ZeroOrMore
} from '../src/rule'

import {
  Tokenizer
} from '../src/tokenizer'


const FORWARD_ADD: Rule<number> = Forward(() => ADD)

const 
  NUM = S(/[0-9]+(\.[0-9+])/).tf(str => parseFloat(str)),

  PLUS = S('+'),
  MINUS = S('-'),
  STAR = S('*'),
  SLASH = S('/'),
  LPAREN = S('('),
  RPAREN = S(')'),

  PAREN = Either(
    _(LPAREN, FORWARD_ADD, RPAREN).tf(([lp, add, rp]) => add),
    NUM
  ),

  MULT = _(PAREN, ZeroOrMore(_(Either(STAR, SLASH), PAREN)))
    .tf(([first, mults]) => 
      mults.reduce((lhs, [op, rhs]) => op === '*' ? lhs * rhs : lhs / rhs, first)
    ),

  ADD = _(MULT, ZeroOrMore(_(Either(PLUS, MINUS), MULT)))
    .tf(([first, adds]) => 
      adds.reduce((acc, [op, rhs]) => op === '+' ? acc + rhs : acc - rhs, first)
    )

ADD.exec(
  Tokenizer.create(/\w/)
  .stream(`
    1 + 2
  `, /\s|\n/)
)