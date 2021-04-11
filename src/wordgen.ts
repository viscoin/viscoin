import * as fs from 'fs'
import * as configSettings from '../config/settings.json'
const wordlist = fs.readFileSync(`./wordlist/${configSettings.Wallet.wordlist}`).toString().split(configSettings.EOL)
export default () => {
    const words = []
    for (let i = 0; i < 12; i++) {
        const j = Math.floor(Math.random() * wordlist.length)
        words.push(wordlist[j])
    }
    return words
}