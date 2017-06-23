
/**
 * A string holder that keeps track of where it was found in a file.
 */
export class Token {

  constructor(public string: string, public line: number, public column: number) { }

  toString() { return this.string }

}


export class Tokenizer {

  re: RegExp = /./

  constructor(...args: (string|RegExp)[]) {
    var tks = args.map(s => typeof(s) === 'string' ? s : s.source)
    this.re = new RegExp(`${tks.join('|')}`, 'g')
  }

  feed(str: string): Token[] {
    var re = this.re
    var exec

    var res = [] as Token[]
    var line = 0
    var col = 1
    while (exec = re.exec(str)) {
      var tk = exec[0], len = tk.length
      // FIXME check that we didn't skip anything in between
      res.push(new Token(tk, line, col))

      for (var i = 0; i < len; i++) {
        if (tk[i] === '\n') {
          line++;
          col = 1;
        } else col++
      }
    }
    return res
  }
}


export class TokenStream {
  stack: number[] = []
  position = 0

  constructor(public arr: Token[], public skip: RegExp) { }

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

  peek(): Token|null {
    var res = this.arr[this.position]
    return res == null ? null : res
  }

  next(): Token|null {
    var res = this.arr[this.position]
    if (res == null) return null

    this.position++
    return res
  }

}
