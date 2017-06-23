
import {Stream, Tokenizer} from './tokenizer'

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

export class Token {
  constructor(public str: string) { }
  toString() { return this.str }
}

export type Result = (string|Token)[] | null

export abstract class BaseRule {

  abstract exec(s: Stream): Result;

  run(s: Stream): Result {
    s.save()

    var res = this.exec(s)

    if (res == null) {
      s.rollback()
      return null
    }

    s.commit()

    return res
  }

  skip(s: Stream): string[] {
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

  exec(s: Stream): Result {
    var res: Result[] = []

    var i = 0
    var sub = this.subrules
    var len = sub.length

    for (var i = 0; i < len; i++) {
      var r = sub[i]
      var res2 = r.run(s)
      if (res2 == null) return null
      res.push(res2)
      if (i < len - 1) res.push(this.skip(s))
    }

    var a = [] as (string|Token)[]
    a = a.concat(...res as any)
    return a
  }

}


export function _(...a: RuleDecl[]): Rule {
  return new Rule(a.map(convertRule))
}


export class AnyRule extends BaseRule {

  exec(s: Stream): Result {
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

  exec(s: Stream): Result {
    var next = s.next()

    for (var m of this.matches)
      if (m === next) return [next]
    return null
  }

}

export function Str(...str: string[]): BaseRule { return new StringRule(...str) }

export class ReRule extends BaseRule {

  constructor(public re: RegExp) { super() }

  exec(s: Stream): Result {
    var next = s.next()
    if (next == null) return null
    return this.re.test(next) ? [next] : null
  }
}

export function Re(re: RegExp) { return new ReRule(re) }


export class EitherRule extends BaseRule {

  constructor(public subrules: BaseRule[]) { super() }

  exec(s: Stream): Result {
    for (var sub of this.subrules) {
      var res = sub.run(s)
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

  exec(s: Stream): Result {
    var res: (string|Token)[] = []
    var next
    var found = false

    while (!found) {

      // first try to play the until rule
      if (this._until) {
        var res2 = this._until.run(s)
        if (res2) {
          res = res.concat(res2)
          return res
        }
      }

      // The we try the rule
      var res_rule = this.rule.run(s)
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

  exec(s: Stream): Result {
    var res = [] as Result[]
    var res2

    while (res2 = this.rule.run(s)) {
      res.push(res2)
      res.push(this.skip(s))
    }

    return [].concat(...res as any)
  }

}


export class LookAheadRule extends BaseRule {

  constructor(public rule: BaseRule) { super() }

  exec(s: Stream): Result {
    s.save()
    var res = this.rule.run(s)
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

  exec(s: Stream): Result {
    var res = this.rule.run(s)
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


export class Language {

  static languages: Language[] = []

  static get(alias: string) {
    for (var l of this.languages) {
      if (l.aliases.indexOf(alias) > -1)
        return l
    }
    return null
  }

  static create(rule: BaseRule, skip: RegExp, ...res: RegExp[]) {
    var l = new Language(rule, skip, new Tokenizer(...res))
    this.languages.push(l)
    return l
  }

  aliases: string[] = []

  constructor(public rule: BaseRule, public skip: RegExp, public tokenizer: Tokenizer) { }

  alias(...alias: string[]): this {
    this.aliases = this.aliases.concat(alias)
    return this
  }

  parse(str: string): string {
    var tokens = this.tokenizer.feed(str)
    var stream = new Stream(tokens, this.skip)
    return (this.rule.run(stream)||[]).map(s => typeof s === 'string' ?
      s.replace(/&/g, '&amp;')
       .replace(/</g, '&lt;')
       .replace(/>/g, '&gt;')
    : s.toString()).join('')
  }
}