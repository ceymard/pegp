

import {
  Sequence, Either, Forward, Rule, ZeroOrMore, Language, TokenList
} from '../src'

const t = new TokenList()
t.skip(/[\s\t\n\r ]+/)

const
  num = t.add(/[0-9]+(\.[0-9+])?/),

  plus = t.add('+'),
  minus = t.add('-'),
  star = t.add('*'),
  slash = t.add('/'),
  lparen = t.add('('),
  rparen = t.add(')'),

  paren = Either(
    Sequence(lparen, Forward(() => add), rparen).tf(([lp, add, rp]) => add),
    num.tf(tk => parseFloat(tk.text))
  ),

  mult =
    Sequence(paren, ZeroOrMore(Sequence(Either(star, slash), paren)))
                          .tf(([first, mults]) =>
                            mults.reduce((lhs, [op, rhs]) => op.text === '*' ? lhs * rhs : lhs / rhs, first)
                          ),

  add: Rule<number> =
    Sequence(mult, ZeroOrMore(Sequence(Either(plus, minus), mult)))
                          .tf(([first, adds]) => {
                            return adds.reduce((acc, [op, rhs]) => op.text === '+' ? acc + rhs : acc - rhs, first)
                          }),

  calc = Language(add, t)

console.log(calc.parse('  2 * (2 +   1)   + 10 / 2    '))
console.log(calc.parse('   !  '))
