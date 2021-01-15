import * as fs from 'fs'
import * as config from '../config.json'
import { EOL } from 'os'
let _EOL = EOL
if (config.EOL !== '') _EOL = config.EOL
const wordlist = fs.readFileSync(`./wordlist/${config.Wallet.wordlist}`).toString().split(_EOL)
export default () => {
    const words = []
    for (let i = 0; i < 12; i++) {
        const j = Math.floor(Math.random() * wordlist.length)
        words.push(wordlist[j])
    }
    return words
}