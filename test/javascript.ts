/**
 * Javascript, JSX, Typescript and TSX are covered
 * by this mode.
 *
 * This should also highlight Flow type highlights.
 */

import {
  Any,
  Either, Try, Re, _, Rule, LookAhead, Optional, Str, Z,
  Language
} from '../src/rule'


function K(...args: string[])  {
  return Either(
    ...args.map(a => Str(a))
  )  
}

function O(...args: string[]) {
  return Str(...args)
}

const KEYWORDS = K(
  'abstract',
  'any',
  'as',
  'async',
  'await',
  'boolean',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'constructor',
  'continue',
  'debugger',
  'declare',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'finally',
  'for',
  'from',
  'function',
  'get',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'module',
  'namespace',
  'new',
  'number',
  'of',
  'package',
  'private',
  'protected',
  'public',
  'require',
  'return',
  'set',
  'static',
  'string',
  'switch',
  'symbol',
  'throw',
  'try',
  'type',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
)

const LITERALS = Str(
  'false',
  'NaN',
  'null',
  'super',
  'this',
  'true',
  'undefined',
)

const ID_BASE = Re(/^[$a-zA-Z\u00C0-\u017F_][$a-zA-Z\u00C0-\u017F_0-9]*$/)
const ID_UPPER_START = Re(/^[$A-Z][$a-zA-Z\u00C0-\u017F_0-9]*$/)
const ID = Either(ID_UPPER_START, ID_BASE)


const LBRACKET = O('{'),
      RBRACKET = O('}'),
      COLON = O(':'),
      SEMICOLON = O(';'),
      INTERROGATION = O('?'),
      DOT = O('.'),
      ASSIGN = O('=')

const TOPLEVEL = Either(
  () => COMMENT,
  () => STRING,
  () => NUMBER,
  () => TYPE_DEF,
  () => TYPED_VAR,
  () => FUNCTION_DECL,
  () => JSX,
  () => OBJECT_LITERAL,
  () => CODE_BLOCK,
  () => DOTTED_GUARD,
  KEYWORDS,
  LITERALS,
  () => FUNCTION_CALL,
)


const NUMBER = _(
  /^[0-9]+$/,
  Optional(
    DOT,
    /^[0-9]+$/
  )
)

const CHAR_ESCAPE = _('\\', Re(/./))

// basic strings
const SIMPLE_STRING = Either(
  _('"', Try(CHAR_ESCAPE).until('"')),
  _("'", Try(CHAR_ESCAPE).until("'"))
)

const TEMPLATE_STRING = _(
  O('`'),
  Try(_(O('$', '{'), Try(TOPLEVEL).until(LookAhead('}')), O('}')))
    .until(O('`'))
)

const STRING = Either(SIMPLE_STRING, TEMPLATE_STRING)

//////////////////////////////////////////////////////////////

const COMMENT = Either(
  _(O('/', '/'), Try(Any).until(LookAhead('\n'))),
  _(O('/', '*'), Try(Any).until(O('*', '/')))
)

const CODE_BLOCK = _(LBRACKET, Try(TOPLEVEL).until(LookAhead(RBRACKET)), RBRACKET)

// Forward declaration
const OBJECT_LITERAL = _(LBRACKET,
  LookAhead(Either(() => OBJECT_PROPERTY, RBRACKET, () => METHOD)),
  Try(Either(
    () => OBJECT_PROPERTY,
    () => METHOD,
    TOPLEVEL,
  )).until(LookAhead(RBRACKET)),
  RBRACKET
)

const FUNCTION_CALL = _(
  ID, LookAhead('('))

const DOTTED_NAME = _(ID, Z(DOT, ID))

// Used to swallow properties that would otherwise be keywords
const DOTTED_GUARD = _(DOT, Either(
  FUNCTION_CALL,
  ID
))

///////////////////////////////////////////////////////////////

const DECORATOR = _(
  O('@'),
  DOTTED_NAME
)

const OBJECT_PROPERTY = _(
  Either(ID, SIMPLE_STRING),
  Optional(INTERROGATION),
  COLON
)


//////////////////////////////////////////////////////////////

const TYPE_DECL = _(
  Either(
    _(ID, Optional(() => TYPE_GENERIC), Optional('[', ']')),
    SIMPLE_STRING,
    NUMBER,
    () => TYPE_BODY
  ),
  Z(
    O('|', '&'),
    () => TYPE_DECL
  )
)


const ARGUMENTS = _(O('('),
  Z(() => SINGLE_ARGUMENT),
  O(')'),
  Optional(() => TYPE_BLOCK)
)


const METHOD = _(
  ID,
  ARGUMENTS,
  Either(CODE_BLOCK, SEMICOLON)
)

const CLASS_PROPERTY = _(
  OBJECT_PROPERTY,
  Optional(TYPE_DECL)
)

const TYPE_BODY = _(
  LBRACKET,
  Try(Either(
    DECORATOR,
    METHOD,
    CLASS_PROPERTY,
    TOPLEVEL
  )).until(LookAhead(RBRACKET)),
  RBRACKET
)

const TYPE_GENERIC_DECL = _(TYPE_DECL, Optional(O('='), TYPE_DECL))
const TYPE_GENERIC = _(O('<'), TYPE_GENERIC_DECL, Z(O(','), TYPE_GENERIC_DECL), O('>'))


const TYPE_DEF = Either(
  _(K('type'), TYPE_DECL, O('='), TYPE_DECL),
  _(
    Either(K('interface'), K('class')),
    TYPE_DECL,
    Optional(K('extends'), TYPE_DECL),
    TYPE_BODY
  )
)

const TYPED_VAR = Either(
  _(ID, O(':'), TYPE_DECL),
  _(K('as'), TYPE_DECL)
)

//////////////////////////////////////////////////////////////

const TYPE_BLOCK = _(
  COLON,
  TYPE_DECL
)

const SINGLE_ARGUMENT = _(
  Optional(K('public', 'private', 'protected')),
  ID,
  Optional(TYPE_BLOCK),
  Optional(
    O('='),
    Try(TOPLEVEL).until(LookAhead(Either(')', ',')))
  ),
  Optional(O(','))
)


const NAMED_FUNCTION = _(
  K('function'),
  Optional(ID),
  Optional(TYPE_GENERIC),
  ARGUMENTS
)

const ARROW_FUNCTION = _(
  Either(_(Optional(TYPE_GENERIC), ARGUMENTS), ID),
  O('=', '>')
)

const FUNCTION_DECL = Either(NAMED_FUNCTION, ARROW_FUNCTION)


///////////////////////////////////////////////////////////////////

const VALID_ATTRIBUTE_NAME = _(ID, Z('-', ID))

const ATTRIBUTE = _(VALID_ATTRIBUTE_NAME, Optional(Either(
  _(ASSIGN, LBRACKET, Try(TOPLEVEL).until(LookAhead(RBRACKET)), RBRACKET),
  _(ASSIGN, SIMPLE_STRING)
)))

const OPENING_TAG_START = _('<', DOTTED_NAME, Z(ATTRIBUTE))

const OPENING_TAG = _(OPENING_TAG_START, '>')
const SELF_CLOSING_TAG = _(OPENING_TAG_START, O('/', '>'))
const CLOSING_TAG = _(O('<', '/'), DOTTED_NAME, '>')
const HTML_ENTITY = _(O('&'), ID, O(';'))

const JSX = Either(
  _(OPENING_TAG, Try(
    () => JSX,
    HTML_ENTITY,
    CODE_BLOCK
  ).until(CLOSING_TAG)),
  SELF_CLOSING_TAG
)
