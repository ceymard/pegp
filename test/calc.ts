

import {
  SequenceOf, Either, Rule, ZeroOrMore, Language, TokenList
} from '../src'

const t = new TokenList()
t.skip(/[\s\t\n\r ]+/)

const T = {
  num: t.add(/[0-9]+(\.[0-9+])?/),
  plus: t.add('+'),
  minus: t.add('-'),
  star: t.add('*'),
  slash: t.add('/'),
  lparen: t.add('('),
  rparen: t.add(')')
}

const
  paren = Either(SequenceOf(T.lparen, () => add, T.rparen).tf(([lp, add, rp]) => add))
          .Or(T.num.tf(tk => parseFloat(tk.text))),

  mult =
    SequenceOf(paren, ZeroOrMore(SequenceOf(Either(T.star).Or(T.slash), paren)))
                          .tf(([lhs, mults]) =>
                            mults.reduce((lhs, [op, rhs]) => op.is('*') ? lhs * rhs : lhs / rhs, lhs)
                          ),

  add: Rule<number> =
    SequenceOf(mult, ZeroOrMore(SequenceOf(Either(T.plus).Or(T.minus), mult)))
                          .tf(([lhs, adds]) => {
                            return adds.reduce((acc, [op, rhs]) => op.is('+') ? acc + rhs : acc - rhs, lhs)
                          }),

  calc = Language(add, t)

console.log(calc.parse('  2 * (2 +   1)   + 10 / 2    '))
console.log(calc.parse(`
  2 + 3 * 2
  +
`))
console.log(calc.parse('  52 !  '))
