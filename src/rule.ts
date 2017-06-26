

/**
 * A string holder that keeps track of where it was found in a file.
 */
export class Lexeme {

  constructor(
    public text: string, 
    public token: TokenRule,
    public position: number,
    public line: number, 
    public column: number
  ) {  }

  toString() { return this.text }

}


export class Lexer {

  /**
   * The tokens that will be used by the lexer to slice
   * the input. They can change during lexing when a rule
   * calls another rule that defines different lexemes.
   * 
   * The last element is the current token list.
   */
  protected tokens: TokenRule[][] = []

  /**
   * Similar to the token rule are the skip rules, used to
   * ignore some tokens.
   */
  protected skips: TokenRule[][] = []

  /**
   * All the lexemes that have been found thus far.
   */
  lexemes: Lexeme[] = []

  stack: number[] = []
  position = 0
  last_index = 0
  string = ''

  /**
   * Sets the text this lexer will operate on and
   * resets its internal state.
   */
  feed(str: string): this {
    this.string = str
    this.position = 0
    this.last_index = 0
    this.stack = []

    return this
  }

  pushTokens(tokens: TokenRule[]) {
    this.tokens.push(tokens)
    this.discardNextLexemes()
  }

  pushSkip(tokens: TokenRule[]) {
    this.skips.push(tokens)
    this.discardNextLexemes()
  }

  popTokens() {
    this.tokens.pop()
    this.discardNextLexemes()
  }

  popSkip() {
    this.skips.pop()
    this.discardNextLexemes()
  }

  /**
   * To be called whenever we push or pop tokens or skip rules, as the currently
   * parsed lexemes could be different.
   */
  discardNextLexemes() {
    if (this.position < this.lexemes.length) {
      this.lexemes.splice(this.position + 1)
    }
  }

  save() {
    this.stack.push(this.position)
  }

  rollback() {
    if (this.stack.length === 0) return
    this.position = this.stack.pop()!
  }

  commit() {
    if (this.stack.length === 0) return
    this.stack.pop()!
  }

  /**
   * Advances the lexer to the next non-skipped token.
   */
  advance() {

  }

  peek(): Lexeme|null {
    var res = this.lexemes[this.position]
    return res == null ? null : res
  }

  next(): Lexeme|null {
    var res = this.lexemes[this.position]
    if (res == null) return null

    this.position++
    return res
  }

}


//////////////////////////////////////////////////////////////////////////////

export interface NoMatch { }
export const NO_MATCH: NoMatch = {}


export function protectLexerState(target: Rule<any>, prop: string, descriptor: PropertyDescriptor) {
  var fn = descriptor.value
  descriptor.value = function (s: Lexer) {
    s.save()

    if (target._tokens)
      s.pushTokens(target._tokens)
    if (target._skips)
      s.pushSkip(target._skips)

    var res = fn.call(this, s)

    if (res === NO_MATCH) {
      s.rollback()
    } else {
      s.commit()
    }

    if (target._tokens) s.popTokens()
    if (target._skips) s.popSkip()

    return res    
  }
}


export type Result = (string)[] | null

export abstract class Rule<T> {

  abstract exec(s: Lexer): T | NoMatch;

  _tokens: TokenRule[] | null = null
  _skips: TokenRule[] | null = null

  tokenize(...tokens: TokenRule[]) {
    this._tokens = tokens
    return this
  }

  skip(...tokens: TokenRule[]) {
    this._skips = tokens
    return this
  }

  /**
   * Parse an input string.
   * 
   * Only works on rules that define a token list and an
   * optional skip rule.
   */
  parse(str: string) {
    const lexer = new Lexer()
    if (!this._tokens) throw new Error(`A rule must define tokens to start parsing`)
    lexer.feed(str)
    return this.exec(lexer)
  }

  transform<U>(fn: (a: T) => (U | NoMatch)): Rule<U> {
    return new TransformRule(this, fn) // FIXME
  }

  tf<U>(fn: (a: T) => (U | NoMatch)): Rule<U> {
    return new TransformRule(this, fn) // FIXME
  }

}


/**
 * Matches a given token.
 */
export class TokenRule extends Rule<Lexeme> {

  constructor(public regexp: RegExp) {
    super()
  }

  exec(s: Lexer): Lexeme | NoMatch {
    var next = s.peek()
    if (next === null || next.token !== this) return NO_MATCH

    return s.next()!
  }

  text() {
    return this.tf(tk => tk.text)
  }

}


export class TransformRule<T, U> extends Rule<U> {

  constructor(public baserule: Rule<T>, public tr: (a: T) => U) {
    super()
  }

  exec(s: Lexer): U | NoMatch {
    var res = this.baserule.exec(s)
    if (res !== NO_MATCH) 
      return this.tr(res as T)
    return NO_MATCH
  }
}


/**
 * Match a given list of rules.
 */
export class TupleRule<T> extends Rule<T> {

  constructor(public subrules: Rule<any>[]) { super() }

  @protectLexerState
  exec(s: Lexer): T | NoMatch {
    var res: any = []

    var i = 0
    var sub = this.subrules
    var len = sub.length

    for (var i = 0; i < len; i++) {
      var r = sub[i]
      var res2 = r.exec(s)
      if (res2 === NO_MATCH) return NO_MATCH
      res.push(res2)
    }

    return res
  }

}


export function _<A>(a: Rule<A>): TupleRule<[A]>
export function _<A, B>(a: Rule<A>, b: Rule<B>): TupleRule<[A, B]>
export function _<A, B, C>(a: Rule<A>, b: Rule<B>, c: Rule<C>): TupleRule<[A, B, C]>
export function _<A, B, C, D>(a: Rule<A>, b: Rule<B>, c: Rule<C>, d: Rule<D>): TupleRule<[A, B, C, D]>
export function _<A, B, C, D, E>(a: Rule<A>, b: Rule<B>, c: Rule<C>, d: Rule<D>, e: Rule<E>): TupleRule<[A, B, C, D, E]>
export function _<A, B, C, D, E, F>(a: Rule<A>, b: Rule<B>, c: Rule<C>, d: Rule<D>, e: Rule<E>, f: Rule<F>): TupleRule<[A, B, C, D, E, F]>
export function _<A, B, C, D, E, F, G>(a: Rule<A>, b: Rule<B>, c: Rule<C>, d: Rule<D>, e: Rule<E>, f: Rule<F>, g: Rule<G>): TupleRule<[A, B, C, D, E, F, G]>
export function _(...a: Rule<any>[]): TupleRule<any> {
  return new TupleRule(a)
}


export class AnyRule extends Rule<Lexeme> {

  exec(s: Lexer): Lexeme | NoMatch {
    var next = s.next()
    if (next == null) return NO_MATCH
    return next
  }

}

export const Any = new AnyRule()


export class MatchRule extends Rule<Lexeme> {

  matches: (string|RegExp)[] = []

  constructor(...matches: (string|RegExp)[]) {
    super()
    this.matches = matches
  }

  exec(s: Lexer): Lexeme | NoMatch {
    var next = s.next()

    if (next)
      for (var m of this.matches)
        if (typeof m === 'string' && m === next.text
        || m instanceof RegExp && m.exec(next.text)) return next
    return NO_MATCH
  }

}


export class EitherRule<T> extends Rule<T> {

  constructor(public subrules: Rule<T>[]) { super() }

  @protectLexerState
  exec(s: Lexer): T | NoMatch {
    for (var sub of this.subrules) {
      var res = sub.exec(s)
      if (res !== NO_MATCH) return res
    }
    return NO_MATCH
  }
}


export function Either<A, B>(a: Rule<A>, b: Rule<B>): Rule<A | B>
export function Either<A, B, C>(a: Rule<A>, b: Rule<B>, c: Rule<C>): Rule<A | B | C>
export function Either<A, B, C, D>(a: Rule<A>, b: Rule<B>, c: Rule<C>, d: Rule<D>): Rule<A | B | C | D>
export function Either<A, B, C, D, E>(a: Rule<A>, b: Rule<B>, c: Rule<C>, d: Rule<D>, e: Rule<E>): Rule<A | B | C | D | E>
export function Either<A, B, C, D, E, F>(a: Rule<A>, b: Rule<B>, c: Rule<C>, d: Rule<D>, e: Rule<E>, f: Rule<F>): Rule<A | B | C | D | E | F>
export function Either<A, B, C, D, E, F, G>(a: Rule<A>, b: Rule<B>, c: Rule<C>, d: Rule<D>, e: Rule<E>, f: Rule<F>, g: Rule<G>): Rule<A | B | C | D | E | F | G>
export function Either(...r: Rule<any>[]): Rule<any> {
  return new EitherRule(r)
}


/**
 * This rule will try to apply a subrule until a condition
 * is met (if any)
 */
/*
export class TryRule extends Rule {

  rule: Rule
  _until: Rule | null = null

  constructor(rules: Rule[]) {
    super()
    if (rules.length > 1) this.rule = Either(...rules)
    else this.rule = rules[0]
  }

  @protectStreamState
  exec(s: TokenStream): Result {
    var res: (string)[] = []
    var next
    var found = false

    while (!found) {

      // first try to play the until rule
      if (this._until) {
        var res2 = this._until.exec(s)
        if (res2) {
          res = res.concat(res2)
          return res
        }
      }

      // The we try the rule
      var res_rule = this.rule.exec(s)
      if (res_rule) {
        res = res.concat(res_rule)
        continue
      }

      // if that didn't work, just push the next token.
      next = s.next()
      if (next == null) return res
      res.push(next)
    }

    return null
  }

  until(r: RuleDecl): this {
    this._until = convertRule(r)
    return this
  }

}
*/

export class ZeroOrMoreRule<T> extends Rule<T[]> {

  constructor(public rule: Rule<T>) { super() }

  @protectLexerState
  exec(s: Lexer): T[] | NoMatch {
    var res = [] as T[]
    var res2: T | NoMatch

    while (res2 = this.rule.exec(s)) {
      res.push(res2 as T)
    }

    return ([] as T[]).concat(...res)
  }

}


/**
 * A rule that rolls back the token stream whatever happens.
 */
export class LookAheadRule<T> extends Rule<T> {

  constructor(public rule: Rule<T>) { super() }

  exec(s: Lexer): T | NoMatch {
    s.save()
    var res = this.rule.exec(s)
    s.rollback()

    return res
  }

}

export function LookAhead<T>(r: Rule<T>): LookAheadRule<T> {
  return new LookAheadRule(r)
}


export class OptionalRule<T> extends Rule<T | NoMatch> {

  constructor(public rule: Rule<T>) { super() }

  @protectLexerState
  exec(s: Lexer): T | NoMatch {
    return this.rule.exec(s)
  }

}

export function Optional<T>(r: Rule<T>): OptionalRule<T> {
  return new OptionalRule(r)
}

export function ZeroOrMore<T>(r: Rule<T>): ZeroOrMoreRule<T> {
  return new ZeroOrMoreRule(r)
}

export function Match(...str: (string|RegExp)[]): Rule<Lexeme> { return new MatchRule(...str) }

export function Str(...str: (string|RegExp)[]): Rule<string> {
  return new MatchRule(...str).tf(tk => tk.text)
}

export function Forward<T>(def: () => Rule<T>): Rule<T> {
  return def()
}


export function Token(def: string | RegExp): TokenRule {
  return new TokenRule(
    new RegExp(typeof def === 'string' ? def : def.source, 'gy')
  )
}
