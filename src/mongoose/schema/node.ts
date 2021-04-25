import * as mongoose from 'mongoose'
const options = {
    host: String,
    banned: Number
}
export default new mongoose.Schema(options, { collection: 'nodes', versionKey: false })