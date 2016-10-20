'use strict';

// Node Requires
const url = require('url');

// Third party modules
const restify = require('restify');
const builder = require('botbuilder');
const paypal = require('paypal-rest-sdk');

// Local modules
const configuration = require('./configuration');


// Configure the paypal module with a client id and client secret that you cancel_url
// generate from https://developer.paypal.com/
paypal.configure({
    'mode': configuration.PAYPAL_CLIENT_MODE,
    'client_id': configuration.PAYPAL_CLIENT_ID,
    'client_secret': configuration.PAYPAL_CLIENT_SECRET
});

// A connector connects a bot on bot framework to various messaging services that a bot
// can talk to.
let connector = new builder.ChatConnector({
    appId: undefined,
    appPassword: undefined
});

// A bot listens and reacts to messages that the connector picks up on.
let bot = new builder.UniversalBot(connector);

// We're using restify here to set up an HTTP server, and create some callbacks that Paypal will hit.
let server = restify.createServer();
server.use(restify.queryParser());

server.listen(configuration.PORT, function () {
   console.log('%s listening to %s', server.name, server.url); 
});

// This is a callback that Paypal ends up hitting when a user approves a transaction for completion.
server.get('approvalComplete', function (req, res, next) {
    console.log('User approved transaction');
    executePayment(req.params);
    res.send(200);
});

// Messages are posted to this endpoint. We ask the connector to listen at this endpoint for new messages.
server.post('/api/messages', connector.listen());


/**
 * This function creates and returns an object that is passed through to the PayPal Node SDK 
 * to create a payment that a user must manually approve.
 * 
 * See https://developer.paypal.com/docs/api/payments/#payment_create_request for a description of the fields.
 */
function createPaymentJson (returnUrl, cancelUrl) {
    return {
        "intent": "sale",
        "payer": {
            "payment_method": "paypal"
        },
        "redirect_urls": {
            "return_url": returnUrl,
            "cancel_url": cancelUrl
        },
        "transactions": [{
            "item_list": {
                "items": [{
                    "name": "Fine",
                    "sku": "ParkingFine",
                    "price": "1.00",
                    "currency": "USD",
                    "quantity": 1
                }]
            },
            "amount": {
                "currency": "USD",
                "total": "1.00"
            },
            "description": "This is your fine. Please pay it :3"
        }]
    };
}

/**
 * This function creates and returns an object that is passed through to the PayPal Node SDK
 * to execute an authorized payment.
 * 
 * See https://developer.paypal.com/docs/api/payments/#payment_execute_request for a description of the fields.
 */
function executePaymentJson (payerId) {
    return {
        "payer_id": payerId,
        "transactions": [{
            "amount": {
                "currency": "USD",
                "total": "1.00"
            }
        }]
    };
}

/**
 * Generates a URL that Paypal will redirect to on successful approval of the payment by the user.
 */
function createReturnUrl (address) {
    console.log('Creating Return Url');

    // We build up this object to tell the approval callback
    // where (which user, channel, bot user) the receipt
    // message should be sent to, after the transaction is executed.
    let queryObject = {
        'addressId': address.id,
        'conversationId': address.conversation.id,
        'userId': address.user.id,
        'channelId': address.channelId,
        'botServiceUrl': encodeURIComponent(address.serviceUrl)
    };


    // This object encodes the endpoint that PayPal redirects to when
    // a user approves the transaction.
    let urlObject = {
        protocol: 'http',
        hostname: 'localhost',
        port: configuration.PORT,
        pathname: 'approvalComplete',
        query: queryObject
    }

    return url.format(urlObject);
}

/**
 * Creates a payment on paypal that a user must approve.
 */
function createAndSendPayment (session) {
    console.log('Creating Payment');

    let returnUrl = createReturnUrl(session.message.address);
    let paymentJson = createPaymentJson(returnUrl, 'http://localhost');

    paypal.payment.create(paymentJson, function (error, payment) {
        if (error) {
            throw error;
        } else {
            // The SDK returns a payment object when the payment is successfully created. 
            // This object has a few properties, described at length here: 
            // https://developer.paypal.com/docs/api/payments/#payment_create_response
            // We're looking for the 'approval_url' property, which the user must go to
            // to approve the transaction before we can actively execute the transaction.
            for (var index = 0; index < payment.links.length; index++) {
                if (payment.links[index].rel === 'approval_url') {
                    session.send("Please pay your fine: " + payment.links[index].href);
                }
            }
        }
    });
};

/**
 * When a payment is approved by the user, we can go ahead an execute it.
 */
function executePayment (parameters) {
    console.log('Executing an Approved Payment');

    // Appended to the URL by PayPal during the approval step.
    let paymentId = parameters.paymentId;   
    let payerId = parameters.PayerID;

    // Generate the sample payment execution JSON that paypal requires:
    let paymentJson = executePaymentJson(payerId)

    // Appended to the URL by us in createReturnUrl
    let addressId = parameters.addressId;
    let conversationId = parameters.conversationId;
    let channelId = parameters.channelId;
    let userId = parameters.userId;
    let botServiceUrl = decodeURIComponent(parameters.botServiceUrl);

    // Finally, execute the payment, and tell the user that we got their payment.
    paypal.payment.execute(paymentId, paymentJson, function (error, payment) {
        if (error) {
            console.log(error.response);
            throw error;
        } else {
            console.log('Payment Executed Successfully');
            respondToUser(payment, botServiceUrl, channelId, addressId, conversationId, userId);
        }
    });
}

/**
 * This function completes the payment dialog by creating a message, binding an address to it, 
 * and sending it.
 */
function respondToUser (payment, botServiceUrl, channelId, addressId, conversationId, userId) {
    let address = {
        channelId: channelId,
        user: { id: userId, name: userId },
        conversation: { id: conversationId },
        bot: { id: 'paybot', name: 'paybot' },
        serviceUrl: botServiceUrl,
        useAuth: false
    };

    let message = new builder.Message().address(address).text('Thanks for your payment!');

    // Asks the bot to send the message we built up above to the user.
    bot.send(message.toMessage());
}

//=========================================================
// Bot Dialogs
//=========================================================


// The root dialog of our bot simply just jumpes straight into the
// business logic of paying a fine.
bot.dialog('/', function (session, args) {
        session.beginDialog('listFines');
});

// Simple two step dialog to list 'fines' that a user has received, and allow
// a user to 'pay' them. 
bot.dialog('listFines', [
    function (session, args) {
        console.log('List Fines Dialog');
        session.send('You have 1 outstanding fine:');

        session.send('Parking Fine Violation');
        builder.Prompts.choice(session, "What would you like to do?", ["Pay fine", "Cancel"]);
    },
    function (session, results, next) {
        let choice = results.response;
        
        if (choice.entity === 'Cancel') {
            return;
        }

        // Starts the payment flow.
        createAndSendPayment(session);
    },
]);