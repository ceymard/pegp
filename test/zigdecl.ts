/**
 * Definition of a forgiving zig parser that looks at definitions to either
 * generate a documentation or a completion list.
 *
 * The principle of this parser is that it will not try to parse a zig file
 * completely correctly. Instead, it will focus on looking for declarations
 * of functions, enums, etc.
 *
 * It also looks for variable declarations inside of scopes to try to make
 * an educated guess at what type they're referencing.
 */


import {
  SequenceOf as __, TokenList, RX, Either, ZeroOrMore, Optional
} from '../src'

const t = new TokenList()

const OP = {
  AMPERSANDEQUAL:      t.add('&='),
  AMPERSAND:           t.add('&'),
  ASTERISK2:           t.add('**'),
  ASTERISKEQUAL:       t.add('*='),
  ASTERISKPERCENTEQUAL: t.add('*%='),
  ASTERISKPERCENT:     t.add('*%'),
  ASTERISK:            t.add('*'),
  CARETEQUAL:          t.add('^='),
  CARET:               t.add('^'),
  COLON:               t.add(':'),
  COMMA:               t.add(','),
  DOT3:                t.add('...'),
  DOT2:                t.add('..'),
  DOTASTERISK:         t.add('.*'),
  DOTQUESTIONMARK:     t.add('.?'),
  DOT:                 t.add('.'),
  EQUALEQUAL:          t.add('=='),
  EQUALRARROW:         t.add('=>'),
  EQUAL:               t.add('='),
  EXCLAMATIONMARKEQUAL: t.add('!='),
  EXCLAMATIONMARK:     t.add('!'),
  LARROW2EQUAL:        t.add('<<='),
  LARROW2:             t.add('<<'),
  LARROWEQUAL:         t.add('<='),
  LARROW:              t.add('<'),
  LBRACE:              t.add('{'),
  LBRACKET:            t.add('['),
  LPAREN:              t.add('('),
  MINUSEQUAL:          t.add('-='),
  MINUSPERCENTEQUAL:   t.add('-%='),
  MINUSPERCENT:        t.add('-%'),
  MINUSRARROW:         t.add('->'),
  MINUS:               t.add('-'),
  PERCENTEQUAL:        t.add('%='),
  PERCENT:             t.add('%'),
  PIPE2:               t.add('||'),
  PIPEEQUAL:           t.add('|='),
  PIPE:                t.add('|'),
  PLUS2:               t.add('++'),
  PLUSEQUAL:           t.add('+='),
  PLUSPERCENTEQUAL:    t.add('+%='),
  PLUSPERCENT:         t.add('+%'),
  PLUS:                t.add('+'),
  PTRC:                t.add('[*c]'),
  PTRUNKNOWN:          t.add('[*]'),
  QUESTIONMARK:        t.add('?'),
  RARROW2EQUAL:        t.add('>>='),
  RARROW2:             t.add('>>'),
  RARROWEQUAL:         t.add('>='),
  RARROW:              t.add('>'),
  RBRACE:              t.add('}'),
  RBRACKET:            t.add(']'),
  RPAREN:              t.add(')'),
  SEMICOLON:           t.add(';'),
  SLASHEQUAL:          t.add('/='),
  SLASH:               t.add('/'),
  TILDE:               t.add('~'),
}

const KW = {
  ALIGN: t.add(/align\b/),
  ALLOWZERO: t.add(/allowzero\b/),
  AND: t.add(/and\b/),
  ASM: t.add(/asm\b/),
  ASYNC: t.add(/async\b/),
  AWAIT: t.add(/await\b/),
  BREAK: t.add(/break\b/),
  CANCEL: t.add(/cancel\b/),
  CATCH: t.add(/catch\b/),
  COMPTIME: t.add(/comptime\b/),
  CONST: t.add(/const\b/),
  CONTINUE: t.add(/continue\b/),
  DEFER: t.add(/defer\b/),
  ELSE: t.add(/else\b/),
  ENUM: t.add(/enum\b/),
  ERRDEFER: t.add(/errdefer\b/),
  ERROR: t.add(/error\b/),
  EXPORT: t.add(/export\b/),
  EXTERN: t.add(/extern\b/),
  FALSE: t.add(/false\b/),
  FN: t.add(/fn\b/),
  FOR: t.add(/for\b/),
  IF: t.add(/if\b/),
  INLINE: t.add(/inline\b/),
  NAKEDCC: t.add(/nakedcc\b/),
  NOALIAS: t.add(/noalias\b/),
  NULL: t.add(/null\b/),
  OR: t.add(/or\b/),
  ORELSE: t.add(/orelse\b/),
  PACKED: t.add(/packed\b/),
  PROMISE: t.add(/promise\b/),
  PUB: t.add(/pub\b/),
  RESUME: t.add(/resume\b/),
  RETURN: t.add(/return\b/),
  LINKSECTION: t.add(/linksection\b/),
  STDCALLCC: t.add(/stdcallcc\b/),
  STRUCT: t.add(/struct\b/),
  SUSPEND: t.add(/suspend\b/),
  SWITCH: t.add(/switch\b/),
  TEST: t.add(/test\b/),
  THREADLOCAL: t.add(/threadlocal\b/),
  TRUE: t.add(/true\b/),
  TRY: t.add(/try\b/),
  UNDEFINED: t.add(/undefined\b/),
  UNION: t.add(/union\b/),
  UNREACHABLE: t.add(/unreachable\b/),
  USE: t.add(/use\b/),
  VAR: t.add(/var\b/),
  VOLATILE: t.add(/volatile\b/),
  WHILE: t.add(/while\b/),
}


const HEX = '[A-Fa-f0-9]'
const CHAR_ESCAPE = RX`
  (?:
    # u8 in hexadecimal
    \\\\x
    ${HEX}
    ${HEX}
  |
    # unicode
    \\\\u
    \\{
    ${HEX}+
    \\}
  |
    # an escaped character
    [nr\\t'"]
  )
`

const CHAR_CHAR = RX`
(?:
  ${CHAR_ESCAPE}
  |
  [^\\'\n]
)
`
const STRING_CHAR = RX`
(?:
  ${CHAR_ESCAPE}
  |
  [^\\"\n]
)
`

const TK = {
  // The doccomment is immediately turned into useful text.
  // should it, though ?
  DOCCOMMENT: t.add(/((\/\/\/\b[^\n]*)+\n)+/)
    .tf(c => {
      const lines = c.text.split('\n')
      var first = 3

      for (var l of lines) {
        for (var i = 0; i < l.length; i++) {
          if (l[i] !== '\\' && l[i] !== ' ' && l[i] !== '\t') {
            first = i
            break
          }
        }
      }

      return lines.map(l => l.slice(first)).join('\n')
    }),
  CHAR_LITTERAL: t.add(RX`  '${CHAR_CHAR}'  `),
  STRING_LITERAL: t.add(RX`  c?"${STRING_CHAR}*"  `),
  MULTILINE_STRING: t.add(/(^\s*c?\/\/[^\n]*\n)/m),
  INTEGER: t.add(RX`(?:
    # Binary
    0b[01]+
    | # Octal
    0o[0-7]+
    | # Hexadecimal
    0x${HEX}+
    | # regular integer
    [0-9]+
  )`),
  IDENTIFIER: t.add(RX`(?:
    [A-Za-z_]\\w*
    |
    # escaped identifier, used in exports mostly
    @"${STRING_CHAR}*"
  )`),
  FLOAT: t.add(RX`(?:
    # Hexadecimal float
      0x${HEX}+
      (?:
        # When there is trailing numbers
        \\.${HEX}+
        # There may be an exponent
        ([pP][-+]?${HEX}+)?

        |
        # Otherwise we just have the exponent and an optional point
        \\.?
        [pP][-+]?${HEX}+
      )
    | # or regular float
      [0-9]+
      (?:
        \\.[0-9]+
        ([eE][-+]?[0-9]+)?
      |
        \\.?[eE][-+]?[0-9]+
      )
  )`),
}

// Lastly, we configure the skips
// skip simple comments
t.skip(/\/\/(?!\/\b)[^\n]\n?/)
// skip whitespace
t.skip(/[\s\t\n\r ]+/)


/////////////////// NOW COME THE LANGUAGE RULES ! //////////////////////

const

  ///// Helpers as defined in zig's official grammar



  Payload = __(OP.PIPE, TK.IDENTIFIER, OP.PIPE),
  PtrPayload = __(OP.PIPE, Optional(OP.ASTERISK), TK.IDENTIFIER, OP.PIPE),
  PtrIndexPayload = __(OP.PIPE, Optional(OP.ASTERISK), TK.IDENTIFIER, Optional(__(OP.COMMA, TK.IDENTIFIER)), OP.PIPE),

  AssignOp = Either(OP.ASTERISKEQUAL)
            .Or(OP.SLASHEQUAL)
            .Or(OP.PERCENTEQUAL)
            .Or(OP.PLUSEQUAL)
            .Or(OP.MINUSEQUAL)
            .Or(OP.LARROW2EQUAL)
            .Or(OP.RARROW2EQUAL)
            .Or(OP.AMPERSANDEQUAL)
            .Or(OP.CARETEQUAL)
            .Or(OP.PIPEEQUAL)
            .Or(OP.ASTERISKPERCENTEQUAL)
            .Or(OP.PLUSPERCENTEQUAL)
            .Or(OP.MINUSPERCENTEQUAL)
            .Or(OP.EQUAL),

  CompareOp =
      Either(OP.EQUALEQUAL)
       .Or(OP.EXCLAMATIONMARKEQUAL)
       .Or(OP.LARROW)
       .Or(OP.RARROW)
       .Or(OP.LARROWEQUAL)
       .Or(OP.RARROWEQUAL),

  BitwiseOp =
      Either(OP.AMPERSAND)
       .Or(OP.CARET)
       .Or(OP.PIPE)
       .Or(KW.ORELSE)
       .Or(__(KW.CATCH, Payload)),

  BitShiftOp =
      Either(OP.LARROW2)
       .Or(OP.RARROW2),

  AdditionOp =
      Either(OP.PLUS)
       .Or(OP.MINUS)
       .Or(OP.PLUS2)
       .Or(OP.PLUSPERCENT)
       .Or(OP.MINUSPERCENT),

  MultiplyOp =
      Either(OP.PIPE2)
       .Or(OP.ASTERISK)
       .Or(OP.SLASH)
       .Or(OP.PERCENT)
       .Or(OP.ASTERISK2)
       .Or(OP.ASTERISKPERCENT),

  PrefixOp =
      Either(OP.EXCLAMATIONMARK)
       .Or(OP.MINUS)
       .Or(OP.TILDE)
       .Or(OP.MINUSPERCENT)
       .Or(OP.AMPERSAND)
       .Or(KW.TRY)
       .Or(KW.AWAIT),

  // FIXME
  Expr = __(ZeroOrMore(KW.TRY)),

  AssignExpr = __(Expr, Optional(__(AssignOp, Expr))),

  Block = ,

  TypeDecl = ,
  ByteAlign = ,

  VarDecl = __(
    Either(KW.CONST).Or(KW.VAR),
    TK.IDENTIFIER,
    Optional(__(OP.COLON, TypeDecl)), // optional type. We like this better !
    Optional(ByteAlign),
    OP.SEMICOLON
  ),

  BlockLabel = __(TK.IDENTIFIER, OP.COLON),

  BlockExpr = __(Optional(BlockLabel), Block),

  BlockExprStatement =
    Either(BlockExpr)
    .Or(__(AssignExpr, OP.SEMICOLON)),

  TestDecl = __(KW.TEST, TK.STRING_LITERAL, Block),

  Declaration = ZeroOrMore(TestDecl)

export const TopLevel = ZeroOrMore(
    Declaration
  )