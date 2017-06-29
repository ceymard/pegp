

import {
  SequenceOf, Either, Forward, Rule, ZeroOrMore, Language, TokenList
} from '../src'

const t = new TokenList()
t.skip(/[\s\t\n\r ]+/)

const
  t_num = t.add(/[0-9]+(\.[0-9+])?/),
  t_plus = t.add('+'),
  t_minus = t.add('-'),
  t_star = t.add('*'),
  t_slash = t.add('/'),
  t_lparen = t.add('('),
  t_rparen = t.add(')'),

  paren = Either(
    SequenceOf(t_lparen, Forward(() => add), t_rparen).tf(([lp, add, rp]) => add),
    t_num.tf(tk => parseFloat(tk.text))
  ),

  mult =
    SequenceOf(paren, ZeroOrMore(SequenceOf(Either(t_star, t_slash), paren)))
                          .tf(([first, mults]) =>
                            mults.reduce((lhs, [op, rhs]) => op.text === '*' ? lhs * rhs : lhs / rhs, first)
                          ),

  add: Rule<number> =
    SequenceOf(mult, ZeroOrMore(SequenceOf(Either(t_plus, t_minus), mult)))
                          .tf(([first, adds]) => {
                            return adds.reduce((acc, [op, rhs]) => op.text === '+' ? acc + rhs : acc - rhs, first)
                          }),

  calc = Language(add, t)

console.log(calc.parse('  2 * (2 +   1)   + 10 / 2    '))
console.log(calc.parse(`
  2 + 3 * 2
  +
`))
// console.log(calc.parse('  52 !  '))
