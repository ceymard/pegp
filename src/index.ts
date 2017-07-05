

/**
 * A string holder that keeps track of where it was found in a file.
 */
export class Lexeme {

  constructor(
    public text: string,
    public match: RegExpMatchArray,
    public token: TokenRule,
    public index: number, // starting position in the original string
    public line: number,
    public column: number
  ) {  }

  toString() { return `<Lexeme:'${this.text}':${this.line}:${this.column}>` }

  is(str: string) {
    return this.text === str
  }

  matches(reg: RegExp) {
    return reg.exec(this.text)
  }

}


/**
 * The Input class is the one responsible for breaking down the
 * input string into usable Lexemes that will be fed to the rules.
 */
export class Input {

  /**
   * The tokens that will be used by the lexer to slice
   * the input. They can change during lexing when a rule
   * calls another rule that defines different lexemes.
   *
   * The last element is the current token list.
   */
  protected tokens: TokenRule[] = []

  /**
   * All the lexemes that have been found thus far.
   */
  lexemes: Lexeme[] = []

  stack: number[] = []
  last_lexeme: Lexeme|null = null
  lex_position = -1
  last_index = 0
  current_line = 1
  current_column = 1
  string = ''

  constructor(tokens: TokenRule[]) {
    this.tokens = tokens
  }

  /**
   * Sets the text this lexer will operate on and
   * resets its internal state.
   */
  feed(str: string): this {
    this.string = str
    this.lex_position = -1
    this.last_index = 0
    this.current_line = 1
    this.current_column = 1
    this.stack = []

    return this
  }

  clone(tokens: TokenRule[]): Input {
    var ni = new Input(tokens)
    ni.feed(this.string)
    ni.last_index = this.last_index
    ni.current_line = this.current_line
    ni.current_column = this.current_column
    return ni
  }

  /**
   * Discard what has been parsed until now. Used to free memory
   * when parsing particularly large files.
   */
  cut() {
    throw new Error('not implemented !')
  }

  save() {
    this.stack.push(this.lex_position)
  }

  rollback() {
    if (this.stack.length === 0) return
    this.lex_position = this.stack.pop()!
  }

  commit() {
    if (this.stack.length === 0) return
    this.stack.pop()!
  }

  /**
   * Advances the lexer to the next non-skipped token. It may not
   * update the position if asked
   *
   * @param update_position Update the internal position in the lexemes array
   * @param skip if true, return only a non-skippable token
   */
  nextLexeme(update_position = true, skip = true): Lexeme | null {
    var position = this.lex_position

    // Get the current set of tokens
    const tokens = this.tokens

    const lexemes = this.lexemes

    // First, examine the lexemes we already lexed but that were not
    // consumed by a failed rule match.
    while (position < lexemes.length - 1) {
      position++

      if (skip && lexemes[position].token.skippable)
        continue

      if (update_position) this.lex_position = position
      return lexemes[position]
    }

    // If we get here, it means that we got out of the list we already had
    // and need to find more lexemes.
    while (this.last_index < this.string.length) {

      var skipped = false
      for (var t of tokens) {
        t.regexp.lastIndex = this.last_index
        var match = t.regexp.exec(this.string)
        if (match) {
          position++
          var l = this.createLexeme(match, t)
          if (skip && t.skippable) {
            skipped = true
            break
          }
          if (update_position) this.lex_position = position
          return l
        }
      }

      if (skipped) continue

      // Getting here is an error, as it means that the last_index is
      // inferior to the string.length and yet we found no token !
      if (this.last_index < this.string.length)
        throw new Error(`Illegal input @${this.current_line}:${this.current_column} '${this.string[this.last_index]}'`)
    }

    if (update_position) this.lex_position = position
    return null
  }

  createLexeme(match: RegExpMatchArray, rule: TokenRule): Lexeme {
    const txt = match[0]
    var lxm = new Lexeme(txt, match, rule, this.last_index, this.current_line, this.current_column)

    for (var i = 0; i < txt.length; i++) {
      if (txt[i] === '\n') {
        this.current_line += 1
        this.current_column = 1
      } else {
        this.current_column++
      }
    }

    this.last_index += txt.length
    this.lexemes.push(lxm)
    // Count the lines, store it as last seen lexeme ?
    return lxm
  }

  peek(skip = true): Lexeme|null {
    const res = this.nextLexeme(false, skip)
    if (!this.last_lexeme || res && res.index > this.last_lexeme.index) this.last_lexeme = res
    return res
  }

  next(skip = true): Lexeme|null {
    const res = this.nextLexeme(true, skip)
    if (!this.last_lexeme || res && res.index > this.last_lexeme.index) this.last_lexeme = res
    return res
  }

}


//////////////////////////////////////////////////////////////////////////////

export interface NoMatch { }
export const NOMATCH: NoMatch = {}


export function protectLexerState(target: Rule<any>, prop: string, descriptor: PropertyDescriptor) {
  var fn = descriptor.value
  descriptor.value = function (l: Input) {
    l.save()

    var res = fn.call(this, l)

    if (res === NOMATCH) {
      l.rollback()
    } else {
      l.commit()
    }

    return res
  }
}


export type Result = (string)[] | null

export abstract class Rule<T> {

  _name: string

  abstract exec(input: Input): T | NoMatch;

  name(name: string): this {
    this._name = name
    return this
  }

  transform<U>(fn: (a: T) => (U | NoMatch)): Rule<U> {
    return new TransformRule(this, fn) // FIXME
  }

  tap(fn: (a: T) => void): Rule<T> {
    return new TransformRule(this, (a: T) => { fn(a); return a })
  }

  tf<U>(fn: (a: T) => (U | NoMatch)): Rule<U> {
    return new TransformRule(this, fn) // FIXME
  }

}


export type RuleDecl<T> = (Rule<T> | (() => Rule<T>))

export function declToRule<T>(arg: RuleDecl<T>) {
  if (typeof arg === 'function')
    return Forward(arg)
  return arg
}


/**
 * Matches a given token.
 */
export class TokenRule extends Rule<Lexeme> {

  skippable: boolean

  constructor(public regexp: RegExp) {
    super()
  }

  skip(arg = true): this {
    this.skippable = arg
    return this
  }

  /**
   * Find out if the next Lexeme in the input is this TokenRule.
   * 
   * If the TokenRule was skippable, then temporarily modify its
   * skippable status so that the next Lexeme may be a match instead
   * of being skipped -- we can do it here since if we're on exec()
   * it means the grammar is specifically asking for this Token even
   * though it is being skipped the rest of the time.
   */
  exec(l: Input): Lexeme | NoMatch {
    const old_skip = this.skippable
    this.skippable = false
    const peek = l.peek()
    this.skippable = old_skip

    if (peek === null || peek.token !== this) return NOMATCH

    this.skippable = false
    const next = l.next()!
    this.skippable = old_skip

    return next
  }

  text() {
    return this.tf(lm => lm.text)
  }

  as(...matches: (string|RegExp)[]) {
    return this.tf<Lexeme>(lxm => {
      for (var m of matches) {
        if (typeof m === 'string' && lxm.is(m)
        || m instanceof RegExp && lxm.matches(m))
          return lxm
      }
      return NOMATCH
    })
  }

}


export class TransformRule<T, U> extends Rule<U> {

  constructor(public baserule: Rule<T>, public tr: (a: T) => U) {
    super()
  }

  @protectLexerState
  exec(l: Input): U | NoMatch {
    var res = this.baserule.exec(l)
    if (res !== NOMATCH)
      return this.tr(res as T)
    return NOMATCH
  }
}


/**
 * Match a given list of rules.
 */
export class SequenceRule<T> extends Rule<T> {

  constructor(public subrules: Rule<any>[]) { super() }

  @protectLexerState
  exec(l: Input): T | NoMatch {
    var res: any = []
    var i = 0
    var sub = this.subrules
    var len = sub.length

    for (var i = 0; i < len; i++) {
      var r = sub[i]
      var res2 = r.exec(l)
      if (res2 === NOMATCH) return NOMATCH
      res.push(res2)
    }

    return res
  }

}


export function SequenceOf<A>(a: RuleDecl<A>): SequenceRule<[A]>
export function SequenceOf<A, B>(a: RuleDecl<A>, b: RuleDecl<B>): SequenceRule<[A, B]>
export function SequenceOf<A, B, C>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>): SequenceRule<[A, B, C]>
export function SequenceOf<A, B, C, D>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>): SequenceRule<[A, B, C, D]>
export function SequenceOf<A, B, C, D, E>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>): SequenceRule<[A, B, C, D, E]>
export function SequenceOf<A, B, C, D, E, F>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>): SequenceRule<[A, B, C, D, E, F]>
export function SequenceOf<A, B, C, D, E, F, G>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>, g: RuleDecl<G>): SequenceRule<[A, B, C, D, E, F, G]>
export function SequenceOf<A, B, C, D, E, F, G, H>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>, g: RuleDecl<G>, h: RuleDecl<H>): SequenceRule<[A, B, C, D, E, F, G, H]>
export function SequenceOf<A, B, C, D, E, F, G, H, I>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>, g: RuleDecl<G>, h: RuleDecl<H>, I: RuleDecl<I>): SequenceRule<[A, B, C, D, E, F, G, H, I]>
export function SequenceOf<A, B, C, D, E, F, G, H, I, J>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>, g: RuleDecl<G>, h: RuleDecl<H>, I: RuleDecl<I>, j: RuleDecl<J>): SequenceRule<[A, B, C, D, E, F, G, H, I, J]>
export function SequenceOf(...a: RuleDecl<any>[]): SequenceRule<any> {
  return new SequenceRule(a.map(declToRule))
}


export function LastOf<A>(a: RuleDecl<A>): Rule<A>
export function LastOf<A, B>(a: RuleDecl<A>, b: RuleDecl<B>): Rule<B>
export function LastOf<A, B, C>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>): Rule<C>
export function LastOf<A, B, C, D>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>): Rule<D>
export function LastOf<A, B, C, D, E>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>): Rule<E>
export function LastOf<A, B, C, D, E, F>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>): Rule<F>
export function LastOf<A, B, C, D, E, F, G>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>, g: RuleDecl<G>): Rule<G>
export function LastOf<A, B, C, D, E, F, G, H>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>, g: RuleDecl<G>, h: RuleDecl<H>): Rule<H>
export function LastOf<A, B, C, D, E, F, G, H, I>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>, g: RuleDecl<G>, h: RuleDecl<H>, I: RuleDecl<I>): Rule<I>
export function LastOf<A, B, C, D, E, F, G, H, I, J>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>, g: RuleDecl<G>, h: RuleDecl<H>, I: RuleDecl<I>, j: RuleDecl<J>): Rule<J>
export function LastOf(...a: RuleDecl<any>[]): Rule<any> {
  return new SequenceRule(a.map(declToRule)).tf((res: any[]) => res[res.length - 1])
}

export function FirstOf<T>(rule: RuleDecl<T>, ...rest: RuleDecl<any>[]): Rule<T>
export function FirstOf(...a: RuleDecl<any>[]): Rule<any> {
  return new SequenceRule(a.map(declToRule)).tf((res: any[]) => res[0])
}

export class AnyRule extends Rule<Lexeme> {

  exec(l: Input): Lexeme | NoMatch {
    var next = l.next()
    if (next == null) return NOMATCH
    return next
  }

}


export class EitherRule<T> extends Rule<T> {

  constructor(public subrules: Rule<T>[]) { super() }

  @protectLexerState
  exec(s: Input): T | NoMatch {
    for (var sub of this.subrules) {
      var res = sub.exec(s)
      if (res !== NOMATCH) return res
    }
    return NOMATCH
  }
}


export class ZeroOrMoreRule<T> extends Rule<T[]> {

  constructor(public rule: Rule<T>) { super() }

  @protectLexerState
  exec(l: Input): T[] | NoMatch {
    var res = [] as T[]
    var res2: T | NoMatch

    while (res2 = this.rule.exec(l)) {
      if (res2 === NOMATCH) break
      res.push(res2 as T)
    }

    return res
  }

}


/**
 * A rule that rolls back the token stream whatever happens.
 */
export class LookAheadRule<T> extends Rule<T> {

  constructor(public rule: Rule<T>) { super() }

  exec(l: Input): T | NoMatch {
    l.save()
    var res = this.rule.exec(l)
    l.rollback()
    return res
  }

}


export class NotRule extends Rule<null> {

  constructor(public rule: Rule<any>) { super() }

  exec (l: Input): null | NoMatch {
    l.save()
    var res = this.rule.exec(l)
    l.rollback()
    if (res !== NOMATCH) return NOMATCH
    return null
  }

}


export class OptionalRule<T> extends Rule<T | null> {

  constructor(public rule: Rule<T>) { super() }

  @protectLexerState
  exec(l: Input): (T | null) | NoMatch {
    var res = this.rule.exec(l)
    if (res === NOMATCH) return null
    return res
  }

}


export class ForwardRule<T> extends Rule<T> {
  constructor(public def: () => Rule<T>) { super() }

  exec(l: Input): T | NoMatch {
    const rule = this.def()
    return rule.exec(l)
  }
}


export class TokenList {
  tokens: TokenRule[] = []

  skip(def: string | RegExp): TokenRule {
    var tk = this.add(def)
    tk.skip()
    return tk
  }

  add(def: string | RegExp | TokenRule): TokenRule {
    var tk = def instanceof TokenRule ? def : Token(def)
    this.tokens.push(tk)
    return tk
  }
}


export class LanguageRule<T> extends Rule<T> {

  tokens: TokenRule[]

  constructor(public rule: Rule<T>, public list: TokenList) {
    super()
    this.tokens = list.tokens
  }

  /**
   * Parse an input string.
   */
  parse(str: string) {
    const lexer = new Input(this.tokens)
    lexer.feed(str)
    var res = this.exec(lexer, true)
    var leftover = lexer.peek()

    if (leftover != null) {
      const last = lexer.last_lexeme || leftover
      throw new Error(`${last.line}:${last.column}: unexpected '${last.text}'`)
    }
    return res
  }

  /**
   * @param l The lexer this language will operate on
   * @param define_tokens if this language was the one that
   *          called parse. If not, this rule will push its
   *          own tokens onto the lexer.
   */
  @protectLexerState
  exec(input: Input, is_toplevel = true): T | NoMatch {
    // Should we create a new input here ?
    var final_input = is_toplevel ? input : input.clone(this.tokens)
    var res = this.rule.exec(final_input)

    // FIXME reintegrate the sub-input into the original one,
    // maybe check if there is an error there or something ?

    return res
  }

}


export function Language<T>(r: Rule<T>, tokens: TokenList): LanguageRule<T> {
  return new LanguageRule(r, tokens)
}


export function Either<A, B>(a: RuleDecl<A>, b: RuleDecl<B>): Rule<A | B>
export function Either<A, B, C>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>): Rule<A | B | C>
export function Either<A, B, C, D>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>): Rule<A | B | C | D>
export function Either<A, B, C, D, E>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>): Rule<A | B | C | D | E>
export function Either<A, B, C, D, E, F>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>): Rule<A | B | C | D | E | F>
export function Either<A, B, C, D, E, F, G>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>, g: RuleDecl<G>): Rule<A | B | C | D | E | F | G>
export function Either<A, B, C, D, E, F, G, H>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>, g: RuleDecl<G>, h: RuleDecl<H>): Rule<A | B | C | D | E | F | G | H>
export function Either<A, B, C, D, E, F, G, H, I>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>, g: RuleDecl<G>, h: RuleDecl<H>, i: RuleDecl<I>): Rule<A | B | C | D | E | F | G | H | I>
export function Either<A, B, C, D, E, F, G, H, I, J>(a: RuleDecl<A>, b: RuleDecl<B>, c: RuleDecl<C>, d: RuleDecl<D>, e: RuleDecl<E>, f: RuleDecl<F>, g: RuleDecl<G>, h: RuleDecl<H>, i: RuleDecl<I>, j: RuleDecl<J>): Rule<A | B | C | D | E | F | G | H | I | J>
export function Either(...r: RuleDecl<any>[]): Rule<any> {
  return new EitherRule(r.map(declToRule))
}


/**
 * Optionnally match a rule. If it is not present, produces null.
 *
 * @param rule the rule to check
 */
export function Optional<T>(rule: RuleDecl<T>): OptionalRule<T> {
  return new OptionalRule(declToRule(rule))
}


/**
 * Matches a rule any number of times. Its production is
 * an array of results.
 *
 * @param rule the rule to be matched
 */
export function ZeroOrMore<T>(rule: RuleDecl<T>): ZeroOrMoreRule<T> {
  return new ZeroOrMoreRule(declToRule(rule))
}


/**
 * Matches a rule at least one time. Its production is an array
 * of results.
 *
 * @param rule the rule to be matched
 */
export function OneOrMore<T>(rule: RuleDecl<T>): Rule<T[]> {
  return ZeroOrMore(rule).tf(res => {
    if (res.length === 0) return NOMATCH
    return res
  })
}


/**
 * Convenience rule to match a list of rules separated by a separator
 * rule. Produces a list of the matched rules and discards the separators.
 *
 * @param rule The rule we want to match
 * @param sep A rule that should be present between the rule
 */
export function List<T>(r: RuleDecl<T>, sep: RuleDecl<any>): Rule<T[]> {
  return SequenceOf(r, ZeroOrMore(SequenceOf(sep, r)).tf(matches => matches.map(([sep, r]) => r)))
    .tf(([start, rest]) => [start].concat(rest))
}


/**
 * Allows a rule defined later in the code to be used now.
 *
 * If using typescript, you will probably have to manually
 * type the rule in question (like `const rule: Rule<...> = `),
 * as the type inferer will choke with recursive rule declarations
 * and will type it as `Rule<{}>`.
 *
 * @param rule_callback A callback function that returns a rule.
 */
export function Forward<T>(rule_callback: () => Rule<T>) {
  return new ForwardRule(rule_callback)
}


function add_flags(src: RegExp|string): string {
  if (typeof src === 'string') return 'gy'
  var flags = src.flags
  if (flags.indexOf('g') === -1) flags += 'g'
  if (flags.indexOf('y') === -1) flags += 'y'
  return flags
}

/**
 * Define a token. Using TokenList.add is probably a better
 * solution than manually defining a token.
 */
export function Token(def: string | RegExp): TokenRule {
  return new TokenRule(
    new RegExp(typeof def === 'string' ?
      def.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') :
      def.source, add_flags(def))
  )
}


/**
 * Use it to check if the given rule matches without actually
 * consuming it.
 *
 * @param rule the rule to be matched.
 */
export function LookAhead<T>(rule: RuleDecl<T>): LookAheadRule<T> {
  return new LookAheadRule(declToRule(rule))
}


/**
 * Use it to check that the given rule does not match without
 * advancing or failing the parse process.
 *
 * Note that this rule produces `null` only.
 *
 * @param rule the rule to be checked
 */
export function Not(rule: RuleDecl<any>) {
  return new NotRule(declToRule(rule))
}

export const Any = new AnyRule()