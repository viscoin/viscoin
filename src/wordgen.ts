import * as fs from 'fs'
import * as config from '../config.json'
const wordlist = String(fs.readFileSync(`./wordlist/${config.wordlist}`)).split('\n')
export default () => {
    const words = []
    for (let i = 0; i < 12; i++) {
        const j = Math.floor(Math.random() * wordlist.length)
        words.push(wordlist[j])
    }
    return words
}