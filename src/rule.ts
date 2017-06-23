
import {TokenStream} from './tokenizer'

export type RuleDecl = string | RegExp | BaseRule | (() => BaseRule)

function convertRule(r: RuleDecl): BaseRule {
  if (typeof r === 'string')
    return Str(r)
  if (r instanceof RegExp)
    return Re(r)
  if (typeof r === 'function')
    return r()
  return r
}

function convert(r: RuleDecl[]): BaseRule {
  return r.length > 1 ? _(...r.map(convertRule)) : convertRule(r[0])
}


export function protectStreamState(target: BaseRule, prop: string, descriptor: PropertyDescriptor) {
  var fn = descriptor.value
  descriptor.value = function (s: TokenStream) {
    s.save()

    var res = fn.call(this, s)

    if (res == null) {
      s.rollback()
      return null
    }

    s.commit()

    return res    
  }
}


export type Result = (string)[] | null

export abstract class BaseRule {

  abstract exec(s: TokenStream): Result;

  skip(s: TokenStream): string[] {
    var res = []
    var skip_rule = s.skip
    while (s.peek() && skip_rule.test(s.peek()!)) {
      res.push(s.next()!)
    }
    return res
  }

}


/**
 * Match a given list of rules.
 */
export class Rule extends BaseRule {

  constructor(public subrules: BaseRule[]) { super() }

  @protectStreamState
  exec(s: TokenStream): Result {
    var res: Result[] = []

    var i = 0
    var sub = this.subrules
    var len = sub.length

    for (var i = 0; i < len; i++) {
      var r = sub[i]
      var res2 = r.exec(s)
      if (res2 == null) return null
      res.push(res2)
      if (i < len - 1) res.push(this.skip(s))
    }

    var a = [] as (string)[]
    a = a.concat(...res as any)
    return a
  }

}


export function _(...a: RuleDecl[]): Rule {
  return new Rule(a.map(convertRule))
}


export class AnyRule extends BaseRule {

  exec(s: TokenStream): Result {
    var next = s.next()
    if (next == null) return null
    return [next]
  }

}

export const Any = new AnyRule()


export class StringRule extends BaseRule {

  matches: string[] = []

  constructor(...matches: string[]) {
    super()
    this.matches = matches
  }

  exec(s: TokenStream): Result {
    var next = s.next()

    for (var m of this.matches)
      if (m === next) return [next]
    return null
  }

}

export function Str(...str: string[]): BaseRule { return new StringRule(...str) }

export class ReRule extends BaseRule {

  constructor(public re: RegExp) { super() }

  exec(s: TokenStream): Result {
    var next = s.next()
    if (next == null) return null
    return this.re.test(next) ? [next] : null
  }
}

export function Re(re: RegExp) { return new ReRule(re) }


export class EitherRule extends BaseRule {

  constructor(public subrules: BaseRule[]) { super() }

  @protectStreamState
  exec(s: TokenStream): Result {
    for (var sub of this.subrules) {
      var res = sub.exec(s)
      if (res) return res
    }
    return null
  }
}

export function Either(...r: RuleDecl[]): BaseRule {
  return new EitherRule(r.map(convertRule))
}


/**
 * This rule will try to apply a subrule until a condition
 * is met (if any)
 */
export class TryRule extends BaseRule {

  rule: BaseRule
  _until: BaseRule | null = null

  constructor(rules: BaseRule[]) {
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

export class ZeroOrMoreRule extends BaseRule {

  constructor(public rule: BaseRule) { super() }

  @protectStreamState
  exec(s: TokenStream): Result {
    var res = [] as Result[]
    var res2

    while (res2 = this.rule.exec(s)) {
      res.push(res2)
      res.push(this.skip(s))
    }

    return [].concat(...res as any)
  }

}


export class LookAheadRule extends BaseRule {

  constructor(public rule: BaseRule) { super() }

  @protectStreamState
  exec(s: TokenStream): Result {
    s.save()
    var res = this.rule.exec(s)
    s.rollback()

    if (res != null) return []
    return null
  }

}

export function LookAhead(...r: RuleDecl[]): LookAheadRule {
  return new LookAheadRule(r.length > 1 ? _(...r) : convertRule(r[0]))
}


export class OptionalRule extends BaseRule {

  constructor(public rule: BaseRule) { super() }

  @protectStreamState
  exec(s: TokenStream): Result {
    var res = this.rule.exec(s)
    return res == null ? [] : res
  }

}

export function Optional(...r: RuleDecl[]): OptionalRule {
  return new OptionalRule(convert(r))
}

export function ZeroOrMore(...r: RuleDecl[]): ZeroOrMoreRule {
  return new ZeroOrMoreRule(_(...r))
}

export const Z = ZeroOrMore

export function Try(...r: RuleDecl[]): TryRule {
  return new TryRule(r.map(convertRule))
}
