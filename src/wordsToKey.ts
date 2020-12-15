import keygen from './keygen'
export default (words: Array<string>) => {
    const str = words.join('')
    const buf = Buffer.from(str)
    return keygen(buf)
}