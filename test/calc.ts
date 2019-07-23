

import {
  SequenceOf, Either, Rule, ZeroOrMore, Language, TokenList
} from '../src'

const t = new TokenList()
t.skip(/[\s\t\n\r ]+/)

const T = {
  NUM: t.add(/[0-9]+(\.[0-9+])?/),
  PLUS: t.add('+'),
  MINUS: t.add('-'),
  STAR: t.add('*'),
  SLASH: t.add('/'),
  LPAREN: t.add('('),
  RPAREN: t.add(')')
}

const
  paren = Either(SequenceOf(T.LPAREN, () => add, T.RPAREN).tf(([lp, add, rp]) => add))
          .Or(T.NUM.tf(tk => parseFloat(tk.text))),

  mult =
    SequenceOf(paren, ZeroOrMore(SequenceOf(Either(T.STAR).Or(T.SLASH), paren)))
                          .tf(([lhs, mults]) =>
                            mults.reduce((lhs, [op, rhs]) => op.is('*') ? lhs * rhs : lhs / rhs, lhs)
                          ),

  add: Rule<number> =
    SequenceOf(mult, ZeroOrMore(SequenceOf(Either(T.PLUS).Or(T.MINUS), mult)))
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
