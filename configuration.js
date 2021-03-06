module.exports = {
    HOST: process.env.HOST || 'localhost',
    PORT: process.env.PORT || process.env.port || 3978,
    PAYPAL_CLIENT_MODE: process.env.PAYPAL_CLIENT_MODE,
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    MICROSOFT_APP_ID: process.env.MICROSOFT_APP_ID,
    MICROSOFT_APP_SECRET: process.env.MICROSOFT_APP_SECRET
}