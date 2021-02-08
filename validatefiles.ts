import * as fs from 'fs'
import * as crypto from 'crypto'
import * as configSettings from './config/settings.json'

const files = [
    ...fs.readdirSync('./').map(e => e = `./${e}`),
    ...fs.readdirSync('./src').map(e => e = `./src/${e}`)
].filter(e => e.endsWith('.js'))
files.push('./package.json', './package-lock.json', configSettings.argon2)
console.log(files)
let data = Buffer.alloc(0)
for (const file of files) {
    data = Buffer.concat([ data, fs.readFileSync(file) ])
}
console.log(crypto.createHash('sha256').update(data).digest('hex'))