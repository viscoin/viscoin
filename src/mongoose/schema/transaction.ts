import * as mongoose from 'mongoose'
import * as config from '../../../config.json'
const options = {
    _id: String
}
for (const property in config.transaction) {
    options[config.transaction[property].name] = config.transaction[property].type
}
export default mongoose.Schema(options)