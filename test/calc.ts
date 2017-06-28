

import {
  _, Either, Forward, Rule, ZeroOrMore, Language, TokenList
} from '../src'

const t = new TokenList()
t.skip(/[\s\t\n\r ]+/)

const
  NUM = t.add(/[0-9]+(\.[0-9+])?/),

  PLUS = t.add('+'),
  MINUS = t.add('-'),
  STAR = t.add('*'),
  SLASH = t.add('/'),
  LPAREN = t.add('('),
  RPAREN = t.add(')'),

  FORWARD_ADD: Rule<number> = Forward(() => ADD),

  PAREN = Either(
    _(LPAREN, FORWARD_ADD, RPAREN).tf(([lp, add, rp]) => add),
    NUM.tf(tk => parseFloat(tk.text))
  ),

  MULT =
    _(PAREN, ZeroOrMore(_(Either(STAR, SLASH), PAREN)))
                          .tf(([first, mults]) =>
                            mults.reduce((lhs, [op, rhs]) => op.text === '*' ? lhs * rhs : lhs / rhs, first)
                          ),

  ADD =
    _(MULT, ZeroOrMore(_(Either(PLUS, MINUS), MULT)))
                          .tf(([first, adds]) => {
                            return adds.reduce((acc, [op, rhs]) => op.text === '+' ? acc + rhs : acc - rhs, first)
                          }),

  CALC = Language(ADD, t)

console.log(CALC.parse('  2 * (2 +   1)   + 10 / 2    '))
