
import {
  SequenceOf, TokenList
} from '../src'

const t = new TokenList()
// skip simple comments
t.skip(/\/\/(?!\/\b)[^\n]\n/)
// skip whitespace
t.skip(/[\s\t\n\r ]+/)

const TK = {
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
    })
}