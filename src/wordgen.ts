import * as fs from 'fs'
import * as config from '../config.json'
import * as os from 'os'
const EOL = config.EOL === '' ? os.EOL : config.EOL
const wordlist = fs.readFileSync(`./wordlist/${config.Wallet.wordlist}`).toString().split(EOL)
export default () => {
    const words = []
    for (let i = 0; i < 12; i++) {
        const j = Math.floor(Math.random() * wordlist.length)
        words.push(wordlist[j])
    }
    return words
}