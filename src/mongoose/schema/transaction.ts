import * as mongoose from 'mongoose'
import * as config_mongoose from '../../../config/mongoose.json'
const options = {
    _id: String
}
for (const property in config_mongoose.transaction) {
    options[config_mongoose.transaction[property].name] = config_mongoose.transaction[property].type
}
export default new mongoose.Schema(options)