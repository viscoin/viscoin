import keygen from './src/keygen'
import * as fs from 'fs'
import base58 from './src/base58'

const wordlist = String(fs.readFileSync('./wordlist/english.txt')).split('\n')
const words = []
// const words = [
//     'angels',      'desk',
//     'mission',     'sisters',
//     'dsc',         'eleven',
//     'milan',       'institutes',
//     'fundamental', 'word',
//     'author',      'benjamin'
// ]
for (let i = 0; i < 12; i++) {
    const j = Math.floor(Math.random() * wordlist.length)
    words.push(wordlist[j])
}
console.log(words)
const seed = Buffer.from(words.join(''))
const key = keygen(seed)
console.log(base58.encode(key.address))
console.log(base58.encode(key.publicKey))
console.log(base58.encode(key.privateKey))