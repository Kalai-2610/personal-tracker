class Constants {
    static JOI_VATIDATION_OPTION = {
        abortEarly: false,
        allowUnknown: false,
        convert: false
    }

    static TOKEN_EXPIRY = "10m"
    static SESSION_EXPIRY = 60

    static MONGO_ID_REGEX = /^[0-9a-fA-F]{24}$/
}

module.exports = Constants