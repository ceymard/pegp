

import {
  Token as T, _, Either, Forward, Rule, ZeroOrMore
} from '../src/rule'

const 
  ALL_SPACE = T(/[\s\t\n\r ]+/),
  NUM = T(/[0-9]+(\.[0-9+])?/),

  PLUS = T('+'),
  MINUS = T('-'),
  STAR = T('*'),
  SLASH = T('/'),
  LPAREN = T('('),
  RPAREN = T(')'),

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
                          .tf(([first, adds]) => 
                            adds.reduce((acc, [op, rhs]) => op.text === '+' ? acc + rhs : acc - rhs, first)
                          )
    .tokenize(
      NUM,
      PLUS,
      MINUS,
      STAR,
      SLASH,
      LPAREN,
      RPAREN
    ).skip(ALL_SPACE)

ADD.parse('  2 +   45 * 2')
// ADD.exec(
//   Tokenizer.create(/\w/)
//   .stream(`
//     1 + 2
//   `, /\s|\n/)
// )