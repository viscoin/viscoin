import * as mongoose from 'mongoose'
import * as config from '../../../config.json'
const options = {
    _id: String
}
for (const property in config.mongoose.schema.transaction) {
    options[config.mongoose.schema.transaction[property].name] = config.mongoose.schema.transaction[property].type
}
export default mongoose.Schema(options)