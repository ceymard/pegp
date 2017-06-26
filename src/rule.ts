

/**
 * A string holder that keeps track of where it was found in a file.
 */
export class Lexeme {

  constructor(
    public text: string, 
    public line: number, 
    public column: number,
    public token: TokenRule
  ) { 

  }

  toString() { return this.text }

}


export class Lexer {

  re: RegExp = /./

  static create(...args: (string|RegExp)[]) {
    return new Lexer(...args)
  }

  constructor(...args: (string|RegExp)[]) {
    var tks = args.map(s => typeof(s) === 'string' ? s : s.source)
    this.re = new RegExp(`${tks.join('|')}`, 'g')
  }

  feed(str: string): Lexeme[] {
    var re = this.re
    var exec

    var res = [] as Lexeme[]
    var line = 0
    var col = 1
    while (exec = re.exec(str)) {
      var tk = exec[0], len = tk.length
      // FIXME check that we didn't skip anything in between
      res.push(new Lexeme(tk, line, col))

      for (var i = 0; i < len; i++) {
        if (tk[i] === '\n') {
          line++;
          col = 1;
        } else col++
      }
    }
    return res
  }

  stream(str: string, skip: RegExp): TokenStream {
    return new TokenStream(this.feed(str), skip)
  }
}


export class TokenStream {
  stack: number[] = []
  position = 0

  constructor(public arr: Lexeme[], public skip: RegExp) { }

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

  peek(): Lexeme|null {
    var res = this.arr[this.position]
    return res == null ? null : res
  }

  next(): Lexeme|null {
    var res = this.arr[this.position]
    if (res == null) return null

    this.position++
    return res
  }

}


//////////////////////////////////////////////////////////////////////////////

export interface NoMatch { }
export const NO_MATCH: NoMatch = {}


export function protectStreamState(target: Rule<any>, prop: string, descriptor: PropertyDescriptor) {
  var fn = descriptor.value
  descriptor.value = function (s: TokenStream) {
    s.save()

    var res = fn.call(this, s)

    if (res === NO_MATCH) {
      s.rollback()
      return NO_MATCH
    }

    s.commit()

    return res    
  }
}


export type Result = (string)[] | null

export abstract class Rule<T> {

  abstract exec(s: TokenStream): T | NoMatch;

  skip(s: TokenStream): Lexeme[] {
    var res = []
    var skip_rule = s.skip
    while (s.peek() && skip_rule.test(s.peek()!.text)) {
      res.push(s.next()!)
    }
    return res
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

  exec(s: TokenStream): Lexeme | NoMatch {
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

  exec(s: TokenStream): U | NoMatch {
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

  @protectStreamState
  exec(s: TokenStream): T | NoMatch {
    var res: any = []

    var i = 0
    var sub = this.subrules
    var len = sub.length

    for (var i = 0; i < len; i++) {
      var r = sub[i]
      var res2 = r.exec(s)
      if (res2 === NO_MATCH) return NO_MATCH
      res.push(res2)
      if (i < len - 1) res.push(this.skip(s))
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

  exec(s: TokenStream): Lexeme | NoMatch {
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

  exec(s: TokenStream): Lexeme | NoMatch {
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

  @protectStreamState
  exec(s: TokenStream): T | NoMatch {
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

  @protectStreamState
  exec(s: TokenStream): T[] | NoMatch {
    var res = [] as T[]
    var res2: T | NoMatch

    while (res2 = this.rule.exec(s)) {
      res.push(res2 as T)
      this.skip(s)
    }

    return ([] as T[]).concat(...res)
  }

}


/**
 * A rule that rolls back the token stream whatever happens.
 */
export class LookAheadRule<T> extends Rule<T> {

  constructor(public rule: Rule<T>) { super() }

  exec(s: TokenStream): T | NoMatch {
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

  @protectStreamState
  exec(s: TokenStream): T | NoMatch {
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
