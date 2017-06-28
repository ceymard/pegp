

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

  popTokens() {
    this.tokens.pop()
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
  nextLexeme(update_position = true, skip = true): Lexeme | null {
    var position = this.position

    // Get the current set of tokens
    const tokens = this.tokens[this.tokens.length - 1]

    const lexemes = this.lexemes

    while (position < lexemes.length - 1) {
      position++

      if (skip && lexemes[position].token.is_skip)
        continue

      // If we get here, it means that we're still in the already
      // parsed lexemes but found one that was not skippable, so
      // we return it.
      if (update_position) this.position = position
      return lexemes[position]
    }

    // If we get here, it means that we got out of the list we already had
    // and need to find more lexemes.
    while (this.last_index < this.string.length) {

      for (var t of tokens) {
        t.regexp.lastIndex = this.last_index
        var match = t.regexp.exec(this.string)
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
          if (skip && t.is_skip) continue
          if (update_position) this.position = position
          return lexemes[position]
        }
      }
    }

    if (update_position) this.position = position
    return null
  }

  peek(skip = true): Lexeme|null {
    return this.nextLexeme(false, skip)
  }

  next(skip = true): Lexeme|null {
    const res = this.nextLexeme(true, skip)
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

  is_skip: boolean

  constructor(public regexp: RegExp) {
    super()
  }

  skip(arg = true): this {
    this.is_skip = arg
    return this
  }

  exec(l: Lexer): Lexeme | NoMatch {
    var next = l.peek(!this.is_skip)
    if (next === null || next.token !== this) return NOMATCH

    return l.next(!this.is_skip)!
  }

  text() {
    return this.tf(lm => lm.text)
  }

  as(...matches: (string|RegExp)[]) {
    return this.tf<Lexeme>(lm => {
      for (var m of matches) {
        if (typeof m === 'string' && m === lm.text
        || m instanceof RegExp && m.exec(lm.text))
          return lm
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
export class SequenceRule<T> extends Rule<T> {

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


export function _<A>(a: Rule<A>): SequenceRule<[A]>
export function _<A, B>(a: Rule<A>, b: Rule<B>): SequenceRule<[A, B]>
export function _<A, B, C>(a: Rule<A>, b: Rule<B>, c: Rule<C>): SequenceRule<[A, B, C]>
export function _<A, B, C, D>(a: Rule<A>, b: Rule<B>, c: Rule<C>, d: Rule<D>): SequenceRule<[A, B, C, D]>
export function _<A, B, C, D, E>(a: Rule<A>, b: Rule<B>, c: Rule<C>, d: Rule<D>, e: Rule<E>): SequenceRule<[A, B, C, D, E]>
export function _<A, B, C, D, E, F>(a: Rule<A>, b: Rule<B>, c: Rule<C>, d: Rule<D>, e: Rule<E>, f: Rule<F>): SequenceRule<[A, B, C, D, E, F]>
export function _<A, B, C, D, E, F, G>(a: Rule<A>, b: Rule<B>, c: Rule<C>, d: Rule<D>, e: Rule<E>, f: Rule<F>, g: Rule<G>): SequenceRule<[A, B, C, D, E, F, G]>
export function _(...a: Rule<any>[]): SequenceRule<any> {
  return new SequenceRule(a)
}


export class AnyRule extends Rule<Lexeme> {

  exec(l: Lexer): Lexeme | NoMatch {
    var next = l.next()
    if (next == null) return NOMATCH
    return next
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


export class NotRule extends Rule<null> {

  constructor(public rule: Rule<any>) { super() }

  exec (l: Lexer): null | NoMatch {
    l.save()
    var res = this.rule.exec(l)
    l.rollback()
    if (res !== NOMATCH) return NOMATCH
    return null
  }

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

  tokens: TokenRule[]

  constructor(public rule: Rule<T>, public list: TokenList) {
    super()
    this.tokens = list.tokens
  }

  /**
   * Parse an input string.
   *
   * Only works on rules that define a token list and an
   * optional skip rule.
   */
  parse(str: string) {
    const lexer = new Lexer()
    lexer.feed(str)
    return this.exec(lexer)
  }

  @protectLexerState
  exec(l: Lexer): T | NoMatch {
    l.pushTokens(this.tokens!)

    var res = this.rule.exec(l)

    l.popTokens()
    return res
  }

}

export class TokenList {
  tokens: TokenRule[] = []

  skip(def: string | RegExp): TokenRule {
    var tk = this.add(def)
    tk.skip()
    return tk
  }

  add(def: string | RegExp): TokenRule {
    var tk = Token(def)
    this.tokens.push(tk)
    return tk
  }
}


export function List<T>(r: Rule<T>, sep: Rule<any>): Rule<T[]> {
  return _(r, ZeroOrMore(_(sep, r)).tf(matches => matches.map(([sep, r]) => r)))
    .tf(([start, rest]) => [start].concat(rest))
}

export function Language<T>(r: Rule<T>, tokens: TokenList): LanguageRule<T> {
  return new LanguageRule(r, tokens)
}

export function Optional<T>(r: Rule<T>): OptionalRule<T> {
  return new OptionalRule(r)
}

export function ZeroOrMore<T>(r: Rule<T>): ZeroOrMoreRule<T> {
  return new ZeroOrMoreRule(r)
}

export function Forward<T>(def: () => Rule<T>) {
  return new ForwardRule(def)
}


export function Token(def: string | RegExp): TokenRule {
  return new TokenRule(
    new RegExp(typeof def === 'string' ? def.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') : def.source, 'gy')
  )
}

export function LookAhead<T>(r: Rule<T>): LookAheadRule<T> {
  return new LookAheadRule(r)
}

export function Not(r: Rule<any>) {
  return new NotRule(r)
}

export const Any = new AnyRule()