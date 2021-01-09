import * as chalk from 'chalk'
export default () => {
    return chalk.magentaBright(new Date().toLocaleTimeString())
}