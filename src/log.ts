import { isMainThread } from 'worker_threads'
import * as config_default_env from '../config/default_env.json'
const time = () => new Date().toLocaleString(undefined, { hour12: false })
const DEBUG = parseInt(process.env.DEBUG) || config_default_env.DEBUG
const log = {
    info: (...e) => {
        console.log(`${time()} INFO:`, ...e)
    },
    warn: (...e) => {
        console.log(`\x1b[33m${time()} WARN:\x1b[0m`, ...e)
    },
    error: (...e) => {
        console.log(`\x1b[31m${time()} ERROR:\x1b[0m`, ...e)
    },
    debug: (level: number, ...e) => {
        if (DEBUG >= level) console.log(`\x1b[34m${time()} DEBUG:\x1b[0m`, ...e)
    }
}
if (isMainThread) {
    if (process.env.DEBUG) log.info('Using DEBUG:', DEBUG)
    else log.warn('Unset environment value! Using default value for DEBUG:', DEBUG)
}
export default log