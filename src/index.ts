

/**
 * A string holder that keeps track of where it was found in a file.
 */
export class Lexeme {

  constructor(
    public text: string, 
    public token: TokenRule,
    public index: number, // starting position in the original string
    public position: number // position in the lexeme array
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
  position = -1
  last_index = 0
  string = ''

  /**
   * Sets the text this lexer will operate on and
   * resets its internal state.
   */
  feed(str: string): this {
    this.string = str
    this.position = -1
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
      // destroy the supplementary lexemes that we don't need anymore
      this.lexemes.splice(this.position + 1)

      // reset last index
      if (this.position > -1) {
        var last = this.lexemes[this.position]
        this.last_index = last.index + last.text.length
      } else {
        this.last_index = 0
      }
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
   * Advances the lexer to the next non-skipped token. It may not
   * update the position if asked
   */
  nextLexeme(update_position = true): Lexeme | null {
    var position = this.position

    // Get the current set of skips
    const skips = this.skips[this.skips.length - 1] || []

    // Get the current set of tokens
    const tokens = this.tokens[this.tokens.length - 1]

    const lexemes = this.lexemes

    while (position < lexemes.length - 1) {
      position++
      var skip = false
      
      for (var s of skips) {
        if (s === lexemes[position].token) {
          skip = true
          break
        }
      }
      if (skip) continue

      if (position >= lexemes.length) break

      // If we get here, it means that we're still in the already
      // parsed lexemes but found one that was not skippable, so
      // we return it.
      if (update_position) this.position = position
      return lexemes[position]
    }

    // If we get here, it means that we got out of the list we already had
    // and need to find more lexemes.
    while (this.last_index < this.string.length) {
      
      for (var s of skips) {
        s.regexp.lastIndex = this.last_index
        var match = s.regexp.exec(this.string)
        if (match) {
          position++
          var l = new Lexeme(
            match[0],
            s,
            this.last_index,
            position
          )
          this.last_index += match[0].length
          lexemes.push(l)
          // push the lexeme
          continue
        }
      }

      for (var t of tokens) {
        t.regexp.lastIndex = this.last_index
        match = t.regexp.exec(this.string)
        if (match) {
          position++
          var l = new Lexeme(
            match[0],
            t,
            this.last_index,
            position
          )
          this.last_index += match[0].length
          lexemes.push(l)
          if (update_position) this.position = position
          return lexemes[position]
        }
      }
    }

    if (update_position) this.position = position
    return null
  }

  peek(): Lexeme|null {
    return this.nextLexeme(false)
  }

  next(): Lexeme|null {
    const res = this.nextLexeme()
    return res
  }

}


//////////////////////////////////////////////////////////////////////////////

export interface NoMatch { }
export const NOMATCH: NoMatch = {}


export function protectLexerState(target: Rule<any>, prop: string, descriptor: PropertyDescriptor) {
  var fn = descriptor.value
  descriptor.value = function (l: Lexer) {
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

  abstract exec(l: Lexer): T | NoMatch;

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

  exec(l: Lexer): Lexeme | NoMatch {
    var next = l.peek()
    if (next === null || next.token !== this) return NOMATCH

    return l.next()!
  }

  text() {
    return this.tf(tk => tk.text)
  }

}


export class TransformRule<T, U> extends Rule<U> {

  constructor(public baserule: Rule<T>, public tr: (a: T) => U) {
    super()
  }

  @protectLexerState
  exec(l: Lexer): U | NoMatch {
    var res = this.baserule.exec(l)
    if (res !== NOMATCH) 
      return this.tr(res as T)
    return NOMATCH
  }
}


/**
 * Match a given list of rules.
 */
export class TupleRule<T> extends Rule<T> {

  constructor(public subrules: Rule<any>[]) { super() }

  @protectLexerState
  exec(l: Lexer): T | NoMatch {
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

  exec(l: Lexer): Lexeme | NoMatch {
    var next = l.next()
    if (next == null) return NOMATCH
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

  exec(l: Lexer): Lexeme | NoMatch {
    var next = l.next()

    if (next)
      for (var m of this.matches)
        if (typeof m === 'string' && m === next.text
        || m instanceof RegExp && m.exec(next.text)) return next
    return NOMATCH
  }

}


export class EitherRule<T> extends Rule<T> {

  constructor(public subrules: Rule<T>[]) { super() }

  @protectLexerState
  exec(s: Lexer): T | NoMatch {
    for (var sub of this.subrules) {
      var res = sub.exec(s)
      if (res !== NOMATCH) return res
    }
    return NOMATCH
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


export class ZeroOrMoreRule<T> extends Rule<T[]> {

  constructor(public rule: Rule<T>) { super() }

  @protectLexerState
  exec(l: Lexer): T[] | NoMatch {
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

  exec(l: Lexer): T | NoMatch {
    l.save()
    var res = this.rule.exec(l)
    l.rollback()
    return res
  }

}

export function LookAhead<T>(r: Rule<T>): LookAheadRule<T> {
  return new LookAheadRule(r)
}


export class OptionalRule<T> extends Rule<T | NoMatch> {

  constructor(public rule: Rule<T>) { super() }

  @protectLexerState
  exec(l: Lexer): T | NoMatch {
    return this.rule.exec(l)
  }

}


export class ForwardRule<T> extends Rule<T> {
  constructor(public def: () => Rule<T>) { super() }

  exec(l: Lexer): T | NoMatch {
    const rule = this.def()
    return rule.exec(l)
  }
}


export class LanguageRule<T> extends Rule<T> {

  _tokens: TokenRule[] | null = null
  _skips: TokenRule[] | null = null

  constructor(public rule: Rule<T>) { super() }

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
    if (!this._tokens) throw new Error(`A language must define tokens to start parsing`)
    lexer.feed(str)
    return this.exec(lexer)
  }

  @protectLexerState
  exec(l: Lexer): T | NoMatch {
    l.pushTokens(this._tokens!)
    if (this._skips) l.pushSkip(this._skips)
    
    var res = this.rule.exec(l)

    l.popTokens()
    if (this._skips) l.popSkip()
    return res
  }

}


export function Language<T>(r: Rule<T>): LanguageRule<T> {
  return new LanguageRule(r)
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

export function Forward<T>(def: () => Rule<T>) {
  return new ForwardRule(def)
}


export function Token(def: string | RegExp): TokenRule {
  return new TokenRule(
    new RegExp(typeof def === 'string' ? def.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') : def.source, 'gy')
  )
}
